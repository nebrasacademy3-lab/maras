/** Real isolated PostgreSQL + local files; provider transport is synthetic and allowlisted. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { eq, sql } from "drizzle-orm";

const local = JSON.parse(readFileSync(".data/qa-database.json", "utf8")) as { url: string };
const address = new URL(local.url);
if (address.hostname !== "127.0.0.1" || address.pathname !== "/maras_qa") throw new Error("Dedicated loopback database required");
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== local.url) throw new Error("Different database refused");
for (const key of ["S3_BUCKET", "BUCKET", "RAILWAY_PROJECT_ID", "GEMINI_API_KEY", "GEMINI_API_KEYS", "GEMINI_PAID_API_KEY", "GEMINI_PAID_API_KEYS", "GEMINI_FREE_API_KEY", "GEMINI_FREE_API_KEYS", "GOOGLE_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "GEMINI_CONTROL_PLANE_ACCESS_TOKEN", "OPENAI_API_KEY", "TAP_SECRET_KEY", "RESEND_API_KEY"]) if (process.env[key]) throw new Error("Live credentials forbidden");
const childMode = process.argv.includes("--crash-after-checkpoints");
const statePath = ".data/qa-study-processing-state.json";
const state = childMode ? JSON.parse(readFileSync(statePath, "utf8")) as { nonce: string; projectNumber: string; projectId: string; jobId: string } : { nonce: randomUUID(), projectNumber: "8" + Date.now(), projectId: "maras-processing-qa-" + randomUUID().slice(0, 8), jobId: "" };
const callLog = `.data/qa-processing-calls-${state.nonce}.jsonl`;
Object.assign(process.env, { DATABASE_URL: local.url, DATABASE_SSL: "false", UPLOAD_DIR: `${process.cwd()}/.data/uploads`, AI_PROVIDER_MIN_INTERVAL_MS: "250", AI_PROVIDER_MAX_CONCURRENT: "2", AI_WORKER_MAX_ACTIVE: "2", GEMINI_API_KEY: "AIza" + "synthetic_processing_".repeat(2) });
const { getDb, closeDb } = await import("../db/index");
const schema = await import("../db/schema");
const checkpoints = await import("../lib/study-job-checkpoints");
const tables = await import("../db/study-processing-schema");
const { putObject } = await import("../lib/storage");
const { enqueueAiFileJob, runAiFileJobOnce, claimAiFileJob, fileJobPayload } = await import("../lib/ai-file-jobs");
const { runCheckpointedFileAction } = await import("../lib/study-processing");
const { aiKeyFingerprint } = await import("../lib/ai-keys");
const { getAiServiceSettings, getAiUsageStatuses, beginAiUsage } = await import("../lib/ai-platform");
const { controlStudyJob, expirePausedStudyJobs } = await import("../lib/study-job-control");
const { refreshGeminiProject } = await import("../lib/gemini-project-verification");
const { assertStudyCoverage, checkedStudyJson } = await import("../lib/study-processing-plan");
const db = getDb();
let nextMode: "ok" | "limit" | "missing" | "late" = "ok";
let lateJob = "";
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const target = new URL(String(url)); assert.equal(target.search, ""); assert.equal(init?.redirect, "error");
  if (target.hostname !== "generativelanguage.googleapis.com") {
    assert.equal(init?.method, "GET"); assert.equal(new Headers(init?.headers).get("authorization"), "Bearer synthetic-processing-proof");
    if (target.href === `https://cloudresourcemanager.googleapis.com/v3/projects/${state.projectNumber}`) return Response.json({ name: `projects/${state.projectNumber}`, projectId: state.projectId, state: "ACTIVE" });
    if (target.href === `https://apikeys.googleapis.com/v2/projects/${state.projectNumber}/locations/global/keys/processing/keyString`) return Response.json({ keyString: process.env.GEMINI_API_KEY });
    if (target.href === `https://cloudbilling.googleapis.com/v1/projects/${state.projectId}/billingInfo`) return Response.json({ name: `projects/${state.projectId}/billingInfo`, projectId: state.projectId, billingEnabled: false, billingAccountName: "" });
    throw new Error("Unexpected endpoint; live network refused");
  }
  assert.match(target.pathname, /^\/v1beta\/models\/[^/]+:(countTokens|generateContent)$/);
  assert.equal(new Headers(init?.headers).get("x-goog-api-key"), process.env.GEMINI_API_KEY);
  const payload = JSON.parse(String(init?.body));
  if (target.pathname.endsWith(":countTokens")) return Response.json({ totalTokens: 20 });
  const source = payload.contents[0].parts.map((part: {text?: string})=>part.text).filter(Boolean).map((text: string)=>{try{return JSON.parse(text);}catch{return null;}}).find((value: {untrustedSourceUnits?: unknown})=>value?.untrustedSourceUnits);
  assert.ok(source, "Chunk source must be structurally identified");
  assert.equal(payload.generationConfig.responseJsonSchema?.properties?.units?.type, "array");
  const units = source.untrustedSourceUnits as Array<{id: string; text: string}>;
  const mode = nextMode; nextMode = "ok";
  appendFileSync(callLog, JSON.stringify({ mode, ids: units.map(unit=>unit.id) }) + "\n");
  if (mode === "late") await db.execute(sql`UPDATE ai_file_jobs SET lease_until='2000-01-01T00:00:00.000Z' WHERE id=${lateJob}`);
  return Response.json({ candidates: [{ content: { parts: [{ text: mode === "limit" ? '{"units":[' : JSON.stringify({units:(mode === "missing" ? units.slice(0,-1) : units).map(unit=>({id:unit.id,status:"complete",text:unit.text}))}) }] }, finishReason: mode === "limit" ? "MAX_TOKENS" : "STOP" }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 20 } });
};
const readJob = async (id: string) => (await db.select().from(schema.aiFileJobs).where(eq(schema.aiFileJobs.id,id)))[0];
const calls = () => existsSync(callLog) ? readFileSync(callLog,"utf8").trim().split("\n").filter(Boolean).map(line=>JSON.parse(line) as {mode:string;ids:string[]}) : [];
const tick = async (id: string) => {
  await new Promise(resolve=>setTimeout(resolve,270));
  await db.execute(sql`DELETE FROM ai_work_leases WHERE key='provider:pace'`);
  await db.execute(sql`UPDATE ai_file_jobs SET available_at=${new Date().toISOString()} WHERE id=${id} AND status='queued'`);
  assert.equal(await runAiFileJobOnce(),true);
};
if (childMode) {
  for (let n=0;n<17;n++) await tick(state.jobId);
  const saved = await checkpoints.loadStudyParts(state.jobId);
  assert.equal(saved.filter(part=>part.status==='committed').length,17);
  process.exit(73); // intentional abrupt exit: no closeDb/finalizers
}
const successes: string[] = [];
const createdJobs: string[] = [], createdFiles: number[] = [], createdConversations: number[] = [];
const fixtures = JSON.parse(readFileSync(".data/qa-fixtures.json","utf8")) as {users:Array<{id:number;email:string;role:string}>};
const user = fixtures.users.find(row=>row.role==='student-a')!, other = fixtures.users.find(row=>row.role==='student-b')!;
const inputOf = (job: typeof schema.aiFileJobs.$inferSelect) => ({user, fileId:job.fileId, conversationId:job.conversationId, action:job.action as 'summary', options:JSON.parse(job.optionsJson), client:'web' as const, requestId:`qa-processing:${job.id}`, job:{id:job.id,owner:job.leaseOwner!}});
async function createJob(paragraphs: number, words=160) {
  const text=Array.from({length:paragraphs},(_,i)=>(`Synthetic section ${state.nonce} ${i}: `+'scientific reference '.repeat(words)).trim()).join('\n\n');
  const bytes=Buffer.from(text),key=`qa-study/${state.nonce}/${randomUUID()}.txt`;
  await putObject(key,new Response(new Uint8Array(bytes)).body!,'text/plain','local');
  const [conversation]=await db.insert(schema.aiConversations).values({userId:user.id,title:'Synthetic checkpoint test'}).returning(); createdConversations.push(conversation.id);
  const [file]=await db.insert(schema.aiFiles).values({userId:user.id,conversationId:conversation.id,objectKey:key,storageProvider:'local',originalName:'checkpoint.txt',contentType:'text/plain',sizeBytes:bytes.length,status:'ready',scanStatus:'clean',scanSha256:createHash('sha256').update(bytes).digest('hex')}).returning(); createdFiles.push(file.id);
  const job=await enqueueAiFileJob({user,file,conversationId:conversation.id,action:'summary',options:{language:'العربية',targetLanguage:'العربية',questionCount:5},requestId:randomUUID(),client:'web'}); createdJobs.push(job.id);
  return {job,file,text};
}
try {
 const settings=await getAiServiceSettings();
 await refreshGeminiProject({projectNumber:state.projectNumber,projectId:state.projectId,keys:[{resource:`projects/${state.projectNumber}/locations/global/keys/processing`,fingerprint:aiKeyFingerprint(process.env.GEMINI_API_KEY!)}],models:[{model:settings.summary.model,rpm:1000,tpm:10000000,rpd:10000,concurrent:2,inputTokens:20000,outputTokens:settings.summary.maxOutputTokens}]},'synthetic-processing-proof');
 const baselineUsage=(await getAiUsageStatuses(user)).statuses.summary.used;
 const first=await createJob(40); state.jobId=first.job.id; writeFileSync(statePath,JSON.stringify(state));
 const env={...process.env,GEMINI_API_KEY:''};
 const exit=await new Promise<number|null>((resolve,reject)=>{const child=spawn(process.execPath,['--import','./scripts/ai-worker-runtime.mjs','--import','tsx','scripts/qa-study-processing.ts','--crash-after-checkpoints'],{env,stdio:['ignore','inherit','inherit']});const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Crash child timed out'));},45000);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);resolve(code);});});
 assert.equal(exit,73); assert.equal(calls().length,17);
 let current=await readJob(first.job.id); const progress=JSON.parse(current.progressJson!); assert.equal(progress.completedParts,17); assert.equal(progress.totalParts,40); assert.equal(progress.percent,42); assert.equal(current.status,'queued');
 const hashes=(await checkpoints.loadStudyParts(current.id)).slice(0,17).map(part=>part.resultSha256);
 assert.equal((await db.execute(sql`SELECT count(*)::int AS n FROM ai_artifacts WHERE file_id=${first.file.id}`)).rows[0].n,0);
 successes.push('real child exits abruptly after 17/40 committed parts; private source and progress persist with no final artifact');
 // Simulate an hour of idle waiting, not a new logical request or expired quota hold.
 await db.execute(sql`UPDATE ai_usage_events SET created_at=${new Date(Date.now()-3600_000).toISOString()} WHERE id=${current.usageEventId}`);
 assert.equal((await getAiUsageStatuses(user)).statuses.summary.used,baselineUsage+1);
 for(let n=17;n<40;n++) await tick(current.id);
 current=await readJob(current.id); assert.equal(current.status,'succeeded',current.errorMessage||'resume'); assert.equal(calls().length,40);
 assert.deepEqual((await checkpoints.loadStudyParts(current.id)).slice(0,17).map(part=>part.resultSha256),hashes);
 const allIds=calls().flatMap(row=>row.ids); assert.equal(new Set(allIds).size,40); assert.equal(allIds.length,40);
 const response=fileJobPayload(current) as unknown as {progress:{percent:number};result:{artifact:{content:string}}}; assert.equal(response.progress.percent,100);
 for (const paragraph of first.text.split('\n\n')) assert.ok(response.result.artifact.content.includes(paragraph));
 assert.equal((await db.execute(sql`SELECT count(*)::int AS n FROM ai_usage_events WHERE file_id=${first.file.id}`)).rows[0].n,1);
 const event=(await db.select().from(schema.aiUsageEvents).where(eq(schema.aiUsageEvents.id,current.usageEventId!)))[0]; assert.equal(event.status,'succeeded'); assert.equal(event.inputTokens,800); assert.equal(event.outputTokens,800);
 successes.push('resume generates only parts 18–40, preserves every source unit, settles one quota reservation and reports 100% only after publication');
 const second=await createJob(12,55); nextMode='limit'; await tick(second.job.id);
 current=await readJob(second.job.id); assert.equal(current.status,'queued',current.errorMessage||'MAX_TOKENS split');
 const leaves=await checkpoints.loadStudyParts(current.id),plan=await checkpoints.loadStudyPlan(current.id);
 assert.ok(leaves.some(part=>part.partId.endsWith('.0'))); assertStudyCoverage(plan!.sourceUnits,leaves.map(part=>checkedStudyJson(part.inputJson,part.inputSha256)));
 assert.equal((await db.execute(sql`SELECT count(*)::int AS n FROM study_job_parts WHERE job_id=${current.id} AND status='superseded'`)).rows[0].n,1);
 for(let n=0;n<20 && (await readJob(current.id)).status==='queued';n++) await tick(current.id);
 assert.equal((await readJob(current.id)).status,'succeeded',JSON.stringify({payload:fileJobPayload(await readJob(current.id)),error:(await readJob(current.id)).errorCode,parts:(await checkpoints.loadStudyParts(current.id)).map(p=>({id:p.partId,status:p.status,attempts:p.attempts})),leases:(await db.execute(sql`SELECT key,expires_at FROM ai_work_leases`)).rows}));
 successes.push('MAX_TOKENS replaces a parent with disjoint children and completes exact coverage without publishing truncated output');
 const third=await createJob(8,55); nextMode='missing'; await tick(third.job.id); current=await readJob(third.job.id);
 assert.equal(current.status,'failed'); assert.equal(current.errorCode,'AI_PART_COVERAGE'); assert.equal((await checkpoints.loadStudyParts(current.id)).filter(part=>part.status==='committed').length,0);
 assert.equal((await db.execute(sql`SELECT count(*)::int AS n FROM ai_artifacts WHERE file_id=${third.file.id}`)).rows[0].n,0);
 successes.push('syntactically valid but incomplete provider output fails coverage, with no partial result or artifact accepted');
 const fourth=await createJob(5); nextMode='late';lateJob=fourth.job.id;await tick(fourth.job.id);current=await readJob(fourth.job.id);
 assert.equal(current.status,'processing'); assert.equal((await checkpoints.loadStudyParts(current.id)).filter(part=>part.status==='committed').length,0);
 const oldAttempt=(await db.select().from(tables.studyJobAttempts).where(eq(tables.studyJobAttempts.jobId,current.id)))[0]; assert.equal(oldAttempt.status,'uncertain'); assert.equal(oldAttempt.billable,true);assert.equal(oldAttempt.inputTokens,20);
 const oldInput=inputOf(current),pending=(await checkpoints.loadStudyParts(current.id))[0];
 const successor=await claimAiFileJob();assert.equal(successor?.id,current.id); assert.notEqual(successor!.leaseOwner,current.leaseOwner);
 await assert.rejects(checkpoints.commitStudyPart(oldInput,pending,{kind:'units'},oldAttempt.id),error=>(error as {code:string}).code==='AI_JOB_LEASE_LOST');
 successes.push('late response retains measured uncertain consumption but expired worker cannot publish over its successor');
 const freshInput=inputOf(successor!);
 await assert.rejects(checkpoints.startStudyAttempt({...freshInput,user:other},pending,settings.summary.model));
 await assert.rejects(beginAiUsage({requestId:`study-job:${current.id}`,user:other,service:'summary',fileId:current.fileId,conversationId:current.conversationId,job:freshInput.job}));
 successes.push('cross-account source, part attempt and quota reservation access are rejected before provider dispatch');
 await checkpoints.yieldStudyJob(freshInput);
 for(let n=0;n<10 && (await readJob(current.id)).status==='queued';n++) await tick(current.id);
 assert.equal((await readJob(current.id)).status,'succeeded',JSON.stringify({payload:fileJobPayload(await readJob(current.id)),error:(await readJob(current.id)).errorCode,parts:(await checkpoints.loadStudyParts(current.id)).map(p=>({id:p.partId,status:p.status,attempts:p.attempts})),leases:(await db.execute(sql`SELECT key,expires_at FROM ai_work_leases`)).rows}));
 const fifth=await createJob(5);await tick(fifth.job.id);current=await readJob(fifth.job.id);
 const claim=await claimAiFileJob();assert.equal(claim?.id,current.id);const pinned=inputOf(claim!);
 await db.update(schema.aiFiles).set({originalName:'changed.txt'}).where(eq(schema.aiFiles.id,fifth.file.id));
 const before=calls().length;
 await assert.rejects(runCheckpointedFileAction(pinned,claim!),error=>(error as {code:string}).code==='AI_SOURCE_CHANGED'); assert.equal(calls().length,before);
 await db.update(schema.aiFiles).set({originalName:'checkpoint.txt'}).where(eq(schema.aiFiles.id,fifth.file.id));
 await db.update(schema.aiFileJobs).set({generationConfigJson:JSON.stringify({...settings.summary,instructions:'different pinned glossary'})}).where(eq(schema.aiFileJobs.id,current.id));
 await assert.rejects(runCheckpointedFileAction(pinned,await readJob(current.id)),error=>(error as {code:string}).code==='AI_JOB_CONFIGURATION_CHANGED');assert.equal(calls().length,before);
 successes.push('source rename and incompatible pinned instructions stop resumption before a further provider call');
 await db.update(schema.aiFileJobs).set({generationConfigJson:JSON.stringify(settings.summary)}).where(eq(schema.aiFileJobs.id,current.id));
 await checkpoints.yieldStudyJob(pinned);
 await assert.rejects(controlStudyJob({id:current.id,user:other,client:'web',action:'pause'}),error=>(error as {status:number}).status===404);
 const paused=await controlStudyJob({id:current.id,user,client:'web',action:'pause'});assert.equal(paused.status,'paused');
 assert.equal((await controlStudyJob({id:current.id,user,client:'web',action:'pause'})).id,current.id);
 assert.equal(await claimAiFileJob(),null);
 const resumed=await controlStudyJob({id:current.id,user,client:'web',action:'resume'});assert.equal(resumed.id,current.id);assert.equal(resumed.status,'queued');assert.equal(resumed.usageEventId,current.usageEventId);
 const active=await claimAiFileJob();assert.equal(active?.id,current.id);
 assert.equal((await controlStudyJob({id:current.id,user,client:'web',action:'pause'})).pauseRequested,true);
 await checkpoints.yieldStudyJob(inputOf(active!));assert.equal((await readJob(current.id)).status,'paused');
 successes.push('pause/resume is owner-only and idempotent, retains job/quota identity, and stops scheduling at a checkpoint');
 await controlStudyJob({id:current.id,user,client:'web',action:'resume'});
 const cancelled=await controlStudyJob({id:current.id,user,client:'web',action:'cancel'});assert.equal(cancelled.status,'cancelled');
 assert.equal((await controlStudyJob({id:current.id,user,client:'web',action:'resume'})).status,'cancelled');
 assert.equal((await checkpoints.loadStudyParts(current.id)).filter(part=>part.status==='committed').length,1);
 await assert.rejects(checkpoints.startStudyAttempt(pinned,(await checkpoints.loadStudyParts(current.id))[1],settings.summary.model));
 assert.equal((await db.select().from(schema.aiUsageEvents).where(eq(schema.aiUsageEvents.id,cancelled.usageEventId!)))[0].status,'billable_failed');
 successes.push('cancellation preserves accepted parts, fences old workers, and truthfully settles dispatched consumption without promising a refund');
 const expired=await createJob(5);await controlStudyJob({id:expired.job.id,user,client:'web',action:'pause'});
 await db.update(schema.aiFileJobs).set({createdAt:new Date(Date.now()-8*86400_000).toISOString()}).where(eq(schema.aiFileJobs.id,expired.job.id));
 await expirePausedStudyJobs();assert.equal((await readJob(expired.job.id)).status,'failed');assert.equal((await readJob(expired.job.id)).errorCode,'AI_QUEUE_EXPIRED');
 successes.push('paused jobs expire after the bounded retention window instead of reserving queue capacity indefinitely');

 const report={passed:successes.length,checks:successes,database:'real isolated PostgreSQL',storage:'local synthetic files',provider:'synthetic transport only',physicalDevice:false,liveProvider:false};
 writeFileSync('.data/qa-study-processing-report.json',JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
} finally {
 globalThis.fetch=originalFetch;
 for(const id of createdJobs) await db.delete(schema.aiFileJobs).where(eq(schema.aiFileJobs.id,id));
 for(const id of createdConversations) await db.execute(sql`DELETE FROM ai_messages WHERE conversation_id=${id}`);
 for(const id of createdFiles) {await db.execute(sql`DELETE FROM ai_artifacts WHERE file_id=${id}`);await db.execute(sql`DELETE FROM ai_usage_events WHERE file_id=${id}`);await db.delete(schema.aiFiles).where(eq(schema.aiFiles.id,id));}
 for(const id of createdConversations) await db.delete(schema.aiConversations).where(eq(schema.aiConversations.id,id));
 for(const table of ['gemini_project_reservations','gemini_project_keys','gemini_project_limits','gemini_projects']) await db.execute(sql.raw(`DELETE FROM ${table} WHERE project_number='${state.projectNumber}'`));
 await closeDb();
}
