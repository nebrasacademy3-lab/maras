import assert from "node:assert/strict";
import { File } from "node:buffer";
import test from "node:test";
import { pureSource } from "./helpers/pure-source.mjs";
const policy = await pureSource("lib/resumable-upload-policy.ts");
class UploadError extends Error { constructor(message,status){super(message);this.status=status;} }
const id = "9c68e1c3-9f81-4b87-b054-5628c9965323";
const receipt = (size,received=[],status="open")=>({ok:true,id,sizeBytes:size,chunkBytes:policy.RESUMABLE_CHUNK_BYTES,received,status,expiresAt:"2099-01-01T00:00:00Z",...(status==="completed"?{asset:{id:73}}:{})});
const client=await pureSource("lib/instructor-video-client.ts",{...policy,UploadError});
test("upload receipts reject changed sizes, duplicate/out-of-range chunks and unsafe identifiers",()=>{
 const size=policy.RESUMABLE_CHUNK_BYTES+7,good=receipt(size,[0]);
 assert.deepEqual(client.instructorUploadReceipt(good,size),good);
 for(const change of [{sizeBytes:size+1},{chunkBytes:1},{received:[0,0]},{received:[2]},{received:[-1]},{received:[.5]},{received:["0"]},{status:"expired"},{id:"../other"},{expiresAt:"invalid"}]) assert.throws(()=>client.instructorUploadReceipt({...good,...change},size));
 assert.throws(()=>client.instructorUploadReceipt(receipt(0),0));
});
test("resume skips confirmed bytes, binds completion to the same lesson/revision and forgets only this manifest",async()=>{
 const size=policy.RESUMABLE_CHUNK_BYTES+7,file=new File([new Uint8Array(size)],"lesson.mp4",{type:"video/mp4"}),store=new Map(),posts=[],puts=[],progress=[];
 const transport=await pureSource("lib/instructor-video-client.ts",{...policy,UploadError,localStorage:{getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},authRequest:async(url,init)=>{const body=JSON.parse(init.body);posts.push({url,body});return Response.json(receipt(size,body.action==="start"?[0]:[0,1],body.action==="start"?"open":"completed"));},uploadWithProgress:async options=>{puts.push(options);assert.equal(options.body.size,7);options.onProgress({loaded:7});return receipt(size,[0,1]);}});
 await transport.uploadInstructorVideo({file,ownerId:8,assignmentId:21,lessonId:35,expectedRevision:4,signal:new AbortController().signal,onProgress:value=>progress.push(value),onPhase:()=>{}});
 assert.equal(puts.length,1);assert.equal(puts[0].url,`/api/instructor/assignments/21/videos?id=${id}&part=1`);
 assert.equal(posts[0].body.lessonId,35);assert.equal(posts[0].body.hashes.length,2);assert.equal(posts[0].body.expectedRevision,4);assert.equal(posts[1].body.id,id);assert.equal(posts[1].body.expectedRevision,4);assert.equal(posts[1].body.action,"complete");assert.equal(progress[0].loaded,policy.RESUMABLE_CHUNK_BYTES);assert.equal(progress.at(-1).percent,100);assert.equal(store.size,0);
});
test("wrong-session acknowledgements never complete or discard resumption state",async()=>{
 const file=new File([new Uint8Array(20)],"lesson.mp4",{type:"video/mp4"}),store=new Map(),posts=[];
 const transport=await pureSource("lib/instructor-video-client.ts",{...policy,UploadError,localStorage:{getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},authRequest:async(url,init)=>{posts.push(JSON.parse(init.body));return Response.json(receipt(20));},uploadWithProgress:async()=>({...receipt(20,[0]),id:"6e268237-1771-41c2-a58d-3a48acfc3226"})});
 await assert.rejects(transport.uploadInstructorVideo({file,ownerId:8,assignmentId:21,lessonId:35,expectedRevision:4,signal:new AbortController().signal,onProgress:()=>{},onPhase:()=>{}}));
 assert.equal(posts.length,1);assert.equal(store.size,1);assert.match([...store.keys()][0],/^maras[.]instructor-video[.]v1:8:21:/);
});
