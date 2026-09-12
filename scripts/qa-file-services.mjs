import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
const {url}=JSON.parse(readFileSync('.data/qa-database.json','utf8'));
const scanner=JSON.parse(readFileSync('.data/qa-scanner.json','utf8'));
const fixtures=JSON.parse(readFileSync('.data/qa-fixtures.json','utf8'));
if(new URL(url).hostname!=='127.0.0.1'||new URL(fixtures.origin).hostname!=='127.0.0.1')throw new Error('Loopback synthetic QA only');
Object.assign(process.env,{DATABASE_URL:url,MALWARE_SCAN_URL:scanner.url,MALWARE_SCAN_TOKEN:scanner.token,UPLOAD_DIR:process.cwd()+'/.data/qa-uploads',S3_ENDPOINT:'',S3_BUCKET:'',S3_ACCESS_KEY_ID:'',S3_SECRET_ACCESS_KEY:''});
const require=createRequire(import.meta.url);require('tsx/cjs');const {runFileScanBatch}=require('../lib/file-scan-queue.ts');const {closeDb}=require('../db/index.ts');
const client=new pg.Client({connectionString:url});await client.connect();
const a=fixtures.users.find(u=>u.role==='student-a'),b=fixtures.users.find(u=>u.role==='student-b');
const evidence={testedAt:new Date().toISOString(),engine:'real ClamAV 1.4.6',production:false,studentDataUsed:false,results:[]};
const bytes=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
const digest=createHash('sha256').update(bytes).digest('hex');
const headers=user=>({authorization:'Bearer '+user.token,origin:fixtures.origin});
async function call(path,user,options={}){return fetch(fixtures.origin+path,{...options,headers:{...headers(user),...options.headers},signal:AbortSignal.timeout(90000)});}
async function upload(path,field,fields={}){const form=new FormData();for(const [k,v]of Object.entries(fields))form.set(k,v);form.set(field,new Blob([bytes],{type:'application/pdf'}),'qa-safe-'+Date.now()+'.pdf');const res=await call(path,a,{method:'POST',body:form});const body=await res.json();assert.equal(res.status,201,path+': '+JSON.stringify(body));return body;}
try {
await client.query("UPDATE users SET phone=COALESCE(phone,'+966500000901') WHERE id=$1",[a.id]);
const request=await upload('/api/course-requests','files',{courseName:'QA scanner verification',notes:'Synthetic file upload and permission test'});
const requestFile=(await client.query('SELECT * FROM course_request_files WHERE request_id=$1',[request.request.id])).rows[0];
const support=await upload('/api/support','files',{category:'technical',title:'QA scanner verification',message:'Synthetic support file verification'});
const supportFile=(await client.query('SELECT * FROM support_reply_files WHERE ticket_id=$1',[support.ticket.id])).rows[0];
const ai=await upload('/api/ai/files','file');
const aiFile=(await client.query('SELECT * FROM ai_files WHERE id=$1',[ai.file.id])).rows[0];
for(const [table,row,path,foreignStatus] of [['course_request_files',requestFile,'/api/course-requests/files/'+requestFile.id,404],['support_reply_files',supportFile,'/api/support/files/'+supportFile.id,403]]) {
 assert.equal(row.scan_status,'clean');assert.equal(row.scan_sha256,digest);
 const owned=await call(path,a);assert.equal(owned.status,200);assert.deepEqual(Buffer.from(await owned.arrayBuffer()),bytes);
 assert.match(owned.headers.get('cache-control'),/no-store/);assert.equal(owned.headers.get('x-content-type-options'),'nosniff');
 const foreign=await call(path,b);assert.equal(foreign.status,foreignStatus);await foreign.arrayBuffer();
 const anon=await fetch(fixtures.origin+path);assert.equal(anon.status,401);await anon.arrayBuffer();
 await client.query('UPDATE '+table+" SET scan_status='pending',scanned_at=NULL,scan_sha256=NULL,scan_next_attempt_at=NULL WHERE id=$1",[row.id]);
 const pending=await call(path,a);assert.equal(pending.status,423);await pending.arrayBuffer();
 evidence.results.push({area:table,upload:201,cleanDownload:200,bytesMatch:true,foreignDownload:foreignStatus,anonymousDownload:401,pendingDownload:423});
}
assert.equal(aiFile.scan_status,'clean');assert.equal(aiFile.scan_sha256,digest);assert.equal(aiFile.status,'ready');
const foreignAi=await call('/api/ai/files/'+ai.file.id+'/actions',b,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'summary'})});assert.equal(foreignAi.status,404);await foreignAi.arrayBuffer();
await client.query("UPDATE ai_files SET scan_status='pending',scanned_at=NULL,scan_sha256=NULL,status='pending_scan',scan_next_attempt_at=NULL WHERE id=$1",[ai.file.id]);
const batch=await runFileScanBatch(10);assert.ok(batch.clean>=3);
for(const [table,row,path] of [['course_request_files',requestFile,'/api/course-requests/files/'+requestFile.id],['support_reply_files',supportFile,'/api/support/files/'+supportFile.id]]) {
 const rechecked=(await client.query('SELECT * FROM '+table+' WHERE id=$1',[row.id])).rows[0];assert.equal(rechecked.scan_status,'clean');assert.equal(rechecked.scan_sha256,digest);assert.equal(rechecked.scan_attempts,1);
 const downloaded=await call(path,a);assert.equal(downloaded.status,200);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),bytes);
}
const readyAi=(await client.query('SELECT * FROM ai_files WHERE id=$1',[ai.file.id])).rows[0];assert.equal(readyAi.status,'ready');assert.equal(readyAi.scan_status,'clean');assert.equal(readyAi.scan_sha256,digest);
evidence.results.push({area:'ai_files',upload:201,cleanStatus:'ready',digestVerified:true,foreignAction:404,pendingWorkerStatus:'ready',liveAiProviderCalled:false});
evidence.worker={scanned:batch.scanned,clean:batch.clean,pending:batch.pending,quarantined:batch.quarantined};
const form=new FormData();form.set('category','technical');form.set('title','QA rejected antivirus fixture');form.set('message','Synthetic antivirus signature test');
const eicar=Buffer.from('WDVPIVAlQEFQWzRcUFpYNTQoUF4pN0NDKTd9JEVJQ0FSLVNUQU5EQVJELUFOVElWSVJVUy1URVNULUZJTEUhJEgrSCo=','base64');
form.set('files',new Blob([eicar],{type:'text/plain'}),'qa-security-test.txt');
const rejected=await call('/api/support',a,{method:'POST',body:form});assert.equal(rejected.status,422);await rejected.arrayBuffer();
evidence.malwareUpload={supportStatus:422,persisted:false};
mkdirSync('verification',{recursive:true});writeFileSync('verification/file-services-live.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
} finally {await client.end();await closeDb();}
