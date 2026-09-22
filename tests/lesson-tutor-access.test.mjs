import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID,createHash } from "node:crypto";
import { pureSource } from "./helpers/pure-source.mjs";
class AiPlatformError extends Error { constructor(code,message,status=400){super(message);Object.assign(this,{code,status});} }
class AiBusyError extends AiPlatformError {constructor(){super("BUSY","busy",429);}}
class GeminiProviderError extends Error {}
const person={id:1,email:"student@example.test",role:"student"};
const resource={id:2,lessonId:"lesson-a",courseSlug:"course-a",title:"مرجع الدرس",contentType:"text/plain",originalName:"lesson.txt",objectKey:"synthetic/lesson.txt",scanSha256:"a".repeat(64),updatedAt:"2026-09-22T00:00:00Z"};
const tables=Object.fromEntries(["aiConversations","aiFiles","aiMessages","lessonsDb","users"].map(name=>[name,new Proxy({name},{get:(target,key)=>key==="name"?name:`${name}.${String(key)}`})]));
async function harness(options={}){
 const calls={source:0,provider:0,file:0,messages:0,released:0,reservations:0,settlements:[],conditions:[]};let sessions=0;
 const rows=table=>table===tables.lessonsDb?[{id:"lesson-a"}]:table===tables.users?[{id:1}]:table===tables.aiFiles?[{id:3,userId:1,sourceResourceId:2}]:table===tables.aiConversations?[{id:4,userId:1,status:"active"}]:[];
 const chain=result=>{const query={where(value){calls.conditions.push(value);return query;},orderBy:()=>query,limit:()=>query,for:()=>query,returning:()=>query,then:(yes,no)=>Promise.resolve(result).then(yes,no)};return query;};
 const db={select:()=>({from:table=>chain(rows(table))}),execute:async()=>({}),transaction:async fn=>fn(db),update:table=>({set:()=>chain(rows(table))}),insert:table=>({values:values=>{if(table===tables.aiMessages)calls.messages++;return chain(values.map((row,i)=>({...row,id:10+i})));}})};
 const dependencies={...tables,randomUUID,createHash,AiPlatformError,AiBusyError,GeminiProviderError,
  and:(...values)=>({and:values}),eq:(column,value)=>({column,value}),desc:value=>value,sql:()=>({}),
  getDb:()=>db,getSessionUser:async()=>{sessions++;return options.user===undefined?(sessions>1&&options.revoked?null:person):options.user;},
  sameOriginRequest:()=>options.origin!==false,checkRateLimit:async()=>true,isNativeAppRequest:()=>false,
  activeStudyResource:async()=>{calls.source++;if(options.denied)throw new AiPlatformError("SOURCE_DENIED","denied",403);return {...resource,...options.resource,...(calls.source>1&&options.changed?{updatedAt:"2026-09-22T01:00:00Z"}:{})};},
  AI_FILE_TYPES:new Set(["text/plain"]),resolveAiSource:async()=>({}),activeStorageProvider:()=>"local",
  readAiFileBytes:async()=>{calls.file++;return Buffer.from("مرجع اصطناعي");},
  acquireAiWorkLease:async()=>async()=>{calls.released++;},
  beginAiUsage:async()=>{calls.reservations++;return {eventId:5,config:{maxFileBytes:1000}};},
  finishAiUsage:async value=>calls.settlements.push(value.status),clientAiRequestId:()=>"synthetic",
  generateLessonTutor:async()=>{calls.provider++;return {text:"شرح اصطناعي",keyId:1,model:"synthetic"};},
  readBoundedJsonObject:request=>request.json(),aiJson:value=>Response.json(value),aiError:error=>Response.json({code:error.code||"UNKNOWN"},{status:error.status||500})};
 return {api:await pureSource("app/api/course-resources/[id]/tutor/route.ts",dependencies),calls};
}
const context={params:Promise.resolve({id:"2"})};
const request=(method="POST")=>new Request("https://maras.example/api/course-resources/2/tutor?lesson=lesson-a",{method,...(method==="POST"?{body:JSON.stringify({text:"اشرح المفهوم"})}:{})});
test("lesson tutor denies foreign origins and absent/instructor sessions before file/provider work",async()=>{
 for(const [options,status] of [[{origin:false},403],[{user:null},401],[{user:{...person,role:"instructor"}},403]]){
  const h=await harness(options);assert.equal((await h.api.POST(request(),context)).status,status);assert.equal(h.calls.source,0);assert.equal(h.calls.provider,0);assert.equal(h.calls.file,0);
 }
});
test("lesson tutor rejects missing entitlement, mismatched lesson and unsupported source before reserving AI quota",async()=>{
 for(const [options,status] of [[{denied:true},403],[{resource:{lessonId:"another-lesson"}},404],[{resource:{contentType:"application/octet-stream"}},404]]){
  const h=await harness(options);assert.equal((await h.api.POST(request(),context)).status,status);assert.equal(h.calls.provider,0);assert.equal(h.calls.reservations,0);
 }
});
test("history revalidates the current source under a lock before exposing any saved text",async()=>{
 const h=await harness({changed:true});const result=await h.api.GET(request("GET"),context);assert.equal(result.status,409);assert.equal(h.calls.source,2);assert.equal(h.calls.provider,0);assert.equal(h.calls.messages,0);
});
test("a changed source or revoked session after generation never publishes or saves the answer",async()=>{
 for(const options of [{changed:true},{revoked:true}]){
  const h=await harness(options),result=await h.api.POST(request(),context);assert.equal(result.status,options.changed?409:403);assert.equal(h.calls.provider,1);assert.equal(h.calls.messages,0);assert.equal(h.calls.released,1);assert.deepEqual(h.calls.settlements,["succeeded"]);
 }
});
test("current-source answer is saved as an atomic user/assistant pair and quota is settled once",async()=>{
 const h=await harness(),result=await h.api.POST(request(),context);assert.equal(result.status,200);const value=await result.json();assert.deepEqual(value.messages.map(row=>row.role),["user","assistant"]);assert.equal(value.source.id,2);assert.equal(value.source.lessonId,"lesson-a");assert.equal(h.calls.source,2);assert.equal(h.calls.messages,1);assert.equal(h.calls.released,1);assert.deepEqual(h.calls.settlements,["succeeded"]);
 assert.ok(h.calls.conditions.some(value=>JSON.stringify(value).includes('"column":"aiConversations.userId","value":1')));
});
