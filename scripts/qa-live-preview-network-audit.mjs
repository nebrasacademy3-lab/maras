/** Read-only, bounded audit of the public Discrete Structures preview. Never logs signed URLs/tokens. */
import assert from "node:assert/strict";
const origin="https://marasalelm.com", courseSlug="discrete-structures", lessonId="d-1";
const ua="Maras-Owner-Preview-Security-Audit/1.0";
const strip=url=>{const u=new URL(url,origin);return u.origin+u.pathname;};
const header=(r,n)=>r.headers.get(n)||null;
async function boundedText(response,limit=512*1024){
  if(!response.body)return "";
  const reader=response.body.getReader();let size=0,chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new Error("response bound exceeded");}chunks.push(value);}}
  finally{reader.releaseLock();}
  return Buffer.concat(chunks).toString("utf8");
}
function firstMedia(text){return text.split(/\r?\n/).map(x=>x.trim()).find(x=>x&&!x.startsWith("#"))||null;}
const session=await fetch(origin+"/api/video/session",{method:"POST",redirect:"manual",headers:{
  "user-agent":ua,"content-type":"application/json","origin":origin,"referer":origin+"/courses/"+courseSlug,
  "sec-fetch-site":"same-origin","sec-fetch-mode":"cors","x-meras-platform":"web"
},body:JSON.stringify({courseSlug,lessonId}),signal:AbortSignal.timeout(15000)});
const sessionText=await boundedText(session,128*1024);
let body={};try{body=JSON.parse(sessionText)}catch{}
assert.equal(session.status,200,"public preview session should be available");
for(const key of ["sourceUrl","hlsUrl","streamUrl"]){if(body[key]){const u=new URL(body[key],origin);assert.equal(u.origin,origin);assert.ok(u.pathname.startsWith("/api/video/"+lessonId));}}
const ttlSeconds=body.expiresAt?Math.max(0,Math.round((Date.parse(body.expiresAt)-Date.now())/1000)):null;
const result={checkedAt:new Date().toISOString(),deployedEndpoint:origin+"/courses/"+courseSlug,session:{
  status:session.status,cacheControl:header(session,"cache-control"),referrerPolicy:header(session,"referrer-policy"),
  setCookie:header(session,"set-cookie")?header(session,"set-cookie").split(";").map(x=>x.trim()).filter(x=>/^(?:[^=]+=|httponly$|secure$|samesite=|max-age=)/i.test(x)).map(x=>x.replace(/^[^=]+=.*/,"<cookie>=<redacted>")):null,
  adaptive:Boolean(body.adaptive),encryptedFlag:Boolean(body.encrypted),ttlSeconds,
  sourcePath:body.sourceUrl?strip(body.sourceUrl):null,hlsPath:body.hlsUrl?strip(body.hlsUrl):null,streamPath:body.streamUrl?strip(body.streamUrl):null
}};
if(body.sourceUrl){
  const source=new URL(body.sourceUrl,origin);
  const direct=await fetch(source,{method:"GET",redirect:"manual",headers:{"user-agent":ua,"range":"bytes=0-1023"},signal:AbortSignal.timeout(15000)});
  await direct.body?.cancel();
  result.sourceReplayFreshContext={status:direct.status,contentType:header(direct,"content-type"),contentDisposition:header(direct,"content-disposition"),
    acceptRanges:header(direct,"accept-ranges"),contentRange:header(direct,"content-range"),cacheControl:header(direct,"cache-control"),
    corp:header(direct,"cross-origin-resource-policy"),acao:header(direct,"access-control-allow-origin")};
}
if(body.hlsUrl){
  const masterUrl=new URL(body.hlsUrl,origin);
  const master=await fetch(masterUrl,{headers:{"user-agent":ua},signal:AbortSignal.timeout(15000)});
  const masterText=await boundedText(master,512*1024);
  result.hlsFreshContext={status:master.status,contentType:header(master,"content-type"),cacheControl:header(master,"cache-control"),
    corp:header(master,"cross-origin-resource-policy"),acao:header(master,"access-control-allow-origin"),hasExtXKey:/#EXT-X-KEY:/i.test(masterText)};
  const child=firstMedia(masterText);
  if(child){
    const childUrl=new URL(child,masterUrl);
    const playlist=await fetch(childUrl,{headers:{"user-agent":ua},signal:AbortSignal.timeout(15000)});
    const playlistText=await boundedText(playlist,512*1024);
    result.hlsChild={status:playlist.status,path:strip(childUrl),hasExtXKey:/#EXT-X-KEY:/i.test(playlistText)};
    const segment=firstMedia(playlistText);
    if(segment){
      const segmentUrl=new URL(segment,childUrl);
      const seg=await fetch(segmentUrl,{method:"HEAD",headers:{"user-agent":ua},signal:AbortSignal.timeout(15000)});
      result.segmentFreshContext={status:seg.status,path:strip(segmentUrl),contentType:header(seg,"content-type"),contentLength:header(seg,"content-length"),
        cacheControl:header(seg,"cache-control"),corp:header(seg,"cross-origin-resource-policy"),acao:header(seg,"access-control-allow-origin")};
    }
  }
  const cross=await fetch(masterUrl,{headers:{"user-agent":ua,"origin":"https://example.invalid","sec-fetch-site":"cross-site"},signal:AbortSignal.timeout(15000)});
  await cross.body?.cancel();
  result.hlsCrossSiteRequest={status:cross.status,acao:header(cross,"access-control-allow-origin"),corp:header(cross,"cross-origin-resource-policy")};
}
console.log(JSON.stringify(result,null,2));
