import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { pureSource } from './helpers/pure-source.mjs';
const progress = await pureSource('lib/study-progress.ts');
const data={phase:'processing',totalUnits:40,completedUnits:17,totalParts:40,completedParts:17,percent:42};
const timer={setTimeout:callback=>{queueMicrotask(callback);return 1;},clearTimeout:()=>{}};
test('web and native progress contracts match exactly; unsupported fields never reach UI',async()=>{
 assert.equal(await readFile(new URL('../lib/study-progress.ts',import.meta.url),'utf8'),await readFile(new URL('../mobile/src/lib/study-progress.ts',import.meta.url),'utf8'));
 assert.deepEqual(progress.normalizeStudyProgress({...data,apiKey:'secret',percent:100},'processing'),{...data,percent:99});
 assert.equal(progress.normalizeStudyProgress({...data,percent:100},'succeeded').percent,100);
 assert.equal(progress.normalizeStudyProgress({phase:'api-key-secret'},'queued'),null);
 assert.equal(progress.normalizeStudyProgress({...data,totalUnits:2,completedUnits:200},'processing').completedUnits,2);
 assert.match(progress.studyProgressLabel(data),/17 من 40/);
});
test('web observation surfaces committed progress and follows the same server job to completion',async()=>{
 const paths=[],updates=[];
 const client=await pureSource('lib/ai-job-client.ts',{...progress,...timer,fetch:async(path,options)=>{paths.push(path);assert.equal(options.credentials,'same-origin');return Response.json({job:{id:'stable-id',status:'succeeded',progress:{...data,percent:100},result:{ok:true}}});}});
 const result=await client.observeStudyJob({id:'stable-id',status:'processing',progress:data},{onProgress:p=>updates.push(p)});
 assert.deepEqual(result,{ok:true});assert.deepEqual(paths,['/api/ai/jobs/stable-id']);assert.equal(updates[0].percent,42);assert.equal(updates[1].percent,100);
});
test('paused browser observation stops without discarding resumable identity; cancel is terminal',async()=>{
 let calls=0;
 const client=await pureSource('lib/ai-job-client.ts',{...progress,...timer,fetch:async()=>{calls++;throw new Error('unexpected transport');}});
 await assert.rejects(client.observeStudyJob({id:'paused',status:'paused',progress:{...data,phase:'paused'}}),error=>error instanceof client.StudyRequestError && !error.terminal);
 await assert.rejects(client.observeStudyJob({id:'cancelled',status:'cancelled'}),error=>error instanceof client.StudyRequestError && error.terminal);
 assert.equal(calls,0);
});
test('aborted browser observation cannot surface stale progress or results to a changed account',async()=>{
 const client=await pureSource('lib/ai-job-client.ts',progress),abort=new AbortController();abort.abort();let seen=false;
 await assert.rejects(client.observeStudyJob({id:'old-account',status:'succeeded',result:{private:'value'}},{signal:abort.signal,onProgress:()=>{seen=true;}}));assert.equal(seen,false);
});
test('control sends only an explicit PATCH command, not a replacement file or generation request',async()=>{
 let call;
 const client=await pureSource('lib/ai-job-client.ts',{...progress,fetch:async(path,options)=>{call={path,options};return Response.json({job:{id:'stable-id',status:'queued'}});}});
 await client.controlStudyJob('stable-id','resume');assert.equal(call.path,'/api/ai/jobs/stable-id');assert.equal(call.options.method,'PATCH');assert.deepEqual(JSON.parse(call.options.body),{action:'resume'});
});
test('native observation preserves paused identity and sends shared progress without provider details',async()=>{
 const updates=[];
 const client=await pureSource('mobile/src/lib/study-jobs.ts',{...progress,...timer,AppState:{currentState:'active'},api:async()=>({job:{id:'stable',status:'succeeded',progress:{...data,percent:100},result:{ok:true}}})});
 await assert.rejects(client.observeStudyJob({id:'stable',status:'paused'},new AbortController().signal,()=>{}),error=>error instanceof client.StudyJobError && !error.terminal);
 assert.deepEqual(await client.observeStudyJob({id:'stable',status:'processing',progress:data},new AbortController().signal,()=>{},p=>updates.push(p)),{ok:true});assert.equal(updates[0].completedParts,17);
});
test('HTTP job controls enforce CSRF, authentication, body bounds and command allowlisting before mutation',async()=>{
 const body=await pureSource('lib/request-body.ts');let origin=false,user=null,mutations=0;
 const route=await pureSource('app/api/ai/jobs/[id]/route.ts',{...body,sameOriginRequest:()=>origin,getSessionUser:async()=>user,checkRateLimit:async()=>true,jsonError:(error,status=400)=>Response.json({error},{status}),aiJson:value=>Response.json(value),aiError:error=>Response.json({error:error.message},{status:500}),isNativeAppRequest:()=>false,controlStudyJob:async value=>{mutations++;assert.equal(value.user.id,1);return{id:value.id,status:'paused'};},fileJobPayload:job=>job});
 const call=body=>route.PATCH(new Request('https://maras.example/api/ai/jobs/id',{method:'PATCH',body}),{params:Promise.resolve({id:'stable-id'})});
 assert.equal((await call('{"action":"pause"}')).status,403);origin=true;
 assert.equal((await call('{"action":"pause"}')).status,401);user={id:1,email:'synthetic@example.invalid'};
 assert.equal((await call('{"action":"pause","provider":"other"}')).status,400);
 assert.equal((await call(JSON.stringify({action:'pause',padding:'x'.repeat(2048)}))).status,400);assert.equal(mutations,0);
 assert.equal((await call('{"action":"pause"}')).status,200);assert.equal(mutations,1);
});
