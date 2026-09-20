import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pureSource} from './helpers/pure-source.mjs';
const policy=await pureSource('lib/study-upload-policy.ts');
const {resumeStudyUpload}=await pureSource('lib/study-upload-client.ts',policy);
const hash=async bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(){
  const bytes=Buffer.alloc(policy.STUDY_UPLOAD_CHUNK_BYTES+25,65), saved=new Map(), sessions=new Map(), calls=[], events=[];
  let lostStart=false,lostPart=false,lostFinish=false,interrupted=false;
  const receipt=s=>({id:s.id,status:s.status,received:[...s.received],chunkBytes:policy.STUDY_UPLOAD_CHUNK_BYTES,sizeBytes:bytes.length,expiresAt:new Date(Date.now()+86400000).toISOString(),...(s.status==='completed'?{file:{id:123,sizeBytes:bytes.length,status:'pending_scan'}}:{})});
  const transport={userId:7,signal:new AbortController().signal,uuid:randomUUID,hash,onProgress:value=>events.push(value),saved:async(k,v)=>{if(v===null)saved.delete(k);else if(v!==undefined)saved.set(k,v);return saved.get(k)??null;},request:async(path,method,body)=>{
    if(method==='GET')return {ownerId:7,maxFileBytes:50*1024*1024};
    if(method==='POST'){
      const input=JSON.parse(body);
      if(input.action==='start'){
        let s=sessions.get(input.requestKey);if(!s){s={id:randomUUID(),received:[],status:'open',manifest:input};sessions.set(input.requestKey,s);}else assert.deepEqual(s.manifest,input);
        calls.push('start');if(lostStart){lostStart=false;throw Error('lost admission response');}return receipt(s);
      }
      const s=[...sessions.values()].find(s=>s.id===input.id);assert.ok(s);s.status='completed';calls.push('complete');if(lostFinish){lostFinish=false;throw Error('lost completion');}return receipt(s);
    }
    const url=new URL(path,'https://test.example'),index=Number(url.searchParams.get('part'));const s=[...sessions.values()].find(s=>s.id===url.searchParams.get('id'));assert.ok(s);
    calls.push(index);
    if(interrupted&&index===1){interrupted=false;throw Error('connection interrupted');}
    assert.equal(await hash(body),s.manifest.hashes[index]);if(!s.received.includes(index))s.received.push(index);
    if(lostPart){lostPart=false;throw Error('lost part response');}return receipt(s);
  }};
  return {source:{originalName:'file.txt',contentType:'text/plain',sizeBytes:bytes.length,read:async(o,n)=>new Uint8Array(bytes.subarray(o,o+n))},transport,bytes,saved,sessions,calls,events,lose:(kind)=>{if(kind==='start')lostStart=true;if(kind==='part')lostPart=true;if(kind==='finish')lostFinish=true;if(kind==='interrupt')interrupted=true;}};
}
test('browser and native use byte-identical upload state machine and policy',async()=>{
  for(const name of ['study-upload-client.ts','study-upload-policy.ts'])assert.equal(await readFile('lib/'+name,'utf8'),await readFile('mobile/src/lib/'+name,'utf8'));
});
test('manifest validation rejects unsafe IDs, names, sizes, hashes, conversation and type',()=>{
  const valid={requestKey:randomUUID(),originalName:'ok.txt',contentType:'text/plain',sizeBytes:3,hashes:['a'.repeat(64)]};
  assert.equal(policy.studyUploadManifest(valid).conversationId,null);
  for(const change of [{sizeBytes:0},{sizeBytes:1.1},{sizeBytes:Infinity},{sizeBytes:policy.STUDY_UPLOAD_MAX_BYTES+1},{hashes:[]},{hashes:['x'.repeat(64)]},{conversationId:0},{originalName:'../x'},{originalName:'x\\y'},{originalName:'x\u0000y'},{requestKey:'../id'},{contentType:'application/javascript'}])assert.throws(()=>policy.studyUploadManifest({...valid,...change}));
});
test('interrupted upload resumes only missing part with the identical request identity',async()=>{
  const f=fixture();f.lose('interrupt');await assert.rejects(resumeStudyUpload(f.source,f.transport),/interrupted/);
  const result=await resumeStudyUpload(f.source,f.transport);assert.equal(result.file.id,123);assert.equal(f.sessions.size,1);
  assert.deepEqual(f.calls.filter(x=>typeof x==='number'),[0,1,1]);assert.equal(f.saved.size,0);
  assert.ok(f.events.slice(0,-1).every(e=>e.percent<100));assert.equal(f.events.at(-1).percent,100);
});
test('lost admission response does not create a duplicate source session',async()=>{
  const f=fixture();f.lose('start');await assert.rejects(resumeStudyUpload(f.source,f.transport));await resumeStudyUpload(f.source,f.transport);assert.equal(f.sessions.size,1);
});
test('lost accepted-part response is reconciled before resending bytes',async()=>{
  const f=fixture();f.lose('part');await assert.rejects(resumeStudyUpload(f.source,f.transport));await resumeStudyUpload(f.source,f.transport);assert.deepEqual(f.calls.filter(x=>typeof x==='number'),[0,1]);
});
test('lost final response returns the already completed file, not another upload',async()=>{
  const f=fixture();f.lose('finish');await assert.rejects(resumeStudyUpload(f.source,f.transport));const result=await resumeStudyUpload(f.source,f.transport);assert.equal(result.file.id,123);assert.equal(f.calls.filter(x=>x==='complete').length,1);
});
test('content replacement with same name and size starts another manifest; never attaches old parts',async()=>{
  const f=fixture();f.lose('interrupt');await assert.rejects(resumeStudyUpload(f.source,f.transport));f.bytes[0]=66;await resumeStudyUpload(f.source,f.transport);assert.equal(f.sessions.size,2);assert.deepEqual(f.calls.filter(x=>typeof x==='number'),[0,1,0,1]);
});
test('local source mutation during transfer is rejected before sending mismatched bytes',async()=>{
  const f=fixture();const request=f.transport.request;f.transport.request=async(...args)=>{const value=await request(...args);if(args[1]==='POST')f.bytes[0]=66;return value;};await assert.rejects(resumeStudyUpload(f.source,f.transport),/تغيّر الملف/);assert.deepEqual(f.calls.filter(x=>typeof x==='number'),[]);
});
test('cancelled request does not admit or generate; server limit is honored before hashing',async()=>{
  const f=fixture();const controller=new AbortController();controller.abort();await assert.rejects(resumeStudyUpload(f.source,{...f.transport,signal:controller.signal}));assert.equal(f.calls.length,0);
  await assert.rejects(resumeStudyUpload(f.source,{...f.transport,request:async()=>({ownerId:7,maxFileBytes:100})}),{status:413});assert.equal(f.sessions.size,0);
});
test('invalid receipts cannot mark an incomplete or foreign upload completed',()=>{
  for(const value of [null,{}, {id:randomUUID(),status:'completed',received:[0],chunkBytes:policy.STUDY_UPLOAD_CHUNK_BYTES,sizeBytes:3,expiresAt:new Date().toISOString()}, {id:randomUUID(),status:'open',received:[0,0],chunkBytes:policy.STUDY_UPLOAD_CHUNK_BYTES,sizeBytes:3,expiresAt:new Date().toISOString()}])assert.throws(()=>policy.parseStudyUploadReceipt(value,3));
});
