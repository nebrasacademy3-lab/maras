import test from "node:test";
import assert from "node:assert/strict";
import {createHmac,createCipheriv,createDecipheriv,createHash,randomBytes} from "node:crypto";
import {pureSource} from "./helpers/pure-source.mjs";
const hls=await pureSource("lib/video-hls-security.ts",{createHmac,createCipheriv});
const preview=await pureSource("lib/video-preview-proof.ts");
const secret="synthetic-hls-unit-secret-only";
test("AES stream has deterministic per-grant keys, distinct segment IVs and exact padded lengths",async()=>{
 const key=hls.sessionMediaKey(secret,1,"grant-one"),iv=hls.mediaSegmentIv(key,"720p","segment-00001.ts");
 assert.equal(key.length,16);assert.equal(iv.length,16);assert.deepEqual(key,hls.sessionMediaKey(secret,1,"grant-one"));
 assert.notDeepEqual(key,hls.sessionMediaKey(secret,1,"grant-two"));assert.notDeepEqual(key,hls.sessionMediaKey(secret,2,"grant-one"));
 assert.notDeepEqual(iv,hls.mediaSegmentIv(key,"480p","segment-00001.ts"));assert.notDeepEqual(iv,hls.mediaSegmentIv(key,"720p","segment-00002.ts"));
 for(const length of [0,1,16,188,16385]){const bytes=randomBytes(length);let pos=0;const stream=new ReadableStream({pull(c){if(pos>=bytes.length)c.close();else{c.enqueue(bytes.subarray(pos,pos+37));pos+=37;}}});const encrypted=Buffer.from(await new Response(hls.encryptMediaBody(stream,key,iv)).arrayBuffer());assert.equal(encrypted.length,hls.encryptedMediaSize(length));assert.notDeepEqual(bytes,encrypted);const d=createDecipheriv("aes-128-cbc",key,iv);assert.deepEqual(Buffer.concat([d.update(encrypted),d.final()]),bytes);}
});
test("cancelling encrypted response cancels upstream storage and oversized manifests stop bounded reads",async()=>{
 let cancelled=false;const key=Buffer.alloc(16),iv=Buffer.alloc(16);const input=new ReadableStream({pull(c){c.enqueue(new Uint8Array(188));},cancel(){cancelled=true;}});
 const output=hls.encryptMediaBody(input,key,iv);const reader=output.getReader();await reader.read();await reader.cancel();await new Promise(r=>setTimeout(r,0));assert.ok(cancelled);
 await assert.rejects(hls.boundedManifest(new ReadableStream({start(c){c.enqueue(new Uint8Array(2*1024*1024+1));c.close();}})),/MANIFEST_LIMIT/);
});
test("HLS grants survive rendition/segment/key paths without accepting arbitrary URLs",()=>{
 const key=Buffer.alloc(16);const master=hls.manifestWithGrant("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100000\n720p/index.m3u8\n","course","secret-token",key);
 assert.match(master,/720p\/index\.m3u8\?course=course&token=secret-token/);
 const media=hls.manifestWithGrant("#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:6,\nsegment-00001.ts\n#EXT-X-ENDLIST\n","course","secret-token",key,"720p");
 assert.match(media,/#EXT-X-KEY:METHOD=AES-128,URI="\.\.\/key\.bin\?course=course&token=secret-token",IV=0x[a-f0-9]{32}/);
 for(const line of ["https://private.invalid/segment-00001.ts","../segment-00001.ts",'#EXT-X-MAP:URI="file:///secret"','#EXT-X-KEY:METHOD=NONE'])assert.throws(()=>hls.manifestWithGrant("#EXTM3U\n"+line,"a","b",key,"720p"));
});
test("preview proof is a bounded per-client value, never a URL-borne blanket preview bypass",()=>{
 const proof="a".repeat(48);assert.equal(preview.readPreviewProof(new Request("https://test.invalid",{headers:{cookie:`other=x; meras_video_preview=${proof}`}})),proof);
 assert.equal(preview.readPreviewProof(new Request("https://test.invalid",{headers:{"x-meras-playback-proof":proof}})),proof);
 for(const value of ["x".repeat(48),"a".repeat(49),"a".repeat(47)])assert.equal(preview.readPreviewProof(new Request("https://test.invalid",{headers:{"x-meras-playback-proof":value}})),"");
});
test("copied session URLs and public preview URLs fail before any private storage or database read",async()=>{
 const hash=s=>createHash("sha256").update(s).digest("hex");let grant;let user=null,session="";let dbReads=0;
 const access=await pureSource("lib/video-access.ts",{...preview,process:{env:{VIDEO_SIGNING_SECRET:secret}},verifyVideoToken:async()=>grant,requestSessionToken:()=>session,getSessionUser:async()=>user,hashOpaqueToken:async s=>hash(s),jsonError:(error,status)=>Response.json({error},{status}),getDb:()=>{dbReads++;throw new Error("must not read storage");}});
 const run=()=>access.authorizeVideoRequest(new Request("https://test.invalid/video"),"lesson","course","opaque");
 grant={lessonId:"lesson",courseSlug:"course",email:"student@example.test",viewerId:1,sessionHash:hash("session-one")};
 assert.equal((await run()).response.status,401);user={id:2};session="session-two";assert.equal((await run()).response.status,403);user={id:1};assert.equal((await run()).response.status,403);
 grant={lessonId:"lesson",courseSlug:"course",email:"preview",previewProofHash:hash("a".repeat(48))};assert.equal((await run()).response.status,403);delete grant.previewProofHash;assert.equal((await run()).response.status,403);assert.equal(dbReads,0);
});
