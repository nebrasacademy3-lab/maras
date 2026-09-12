import test from "node:test";
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {isolatedSource} from "./helpers/isolated-source.mjs";
import {controlDatabase} from "./helpers/control-database.mjs";
const contract=await isolatedSource("lib/student-control-contract.ts");
const body=await isolatedSource("lib/request-body.ts");
const initialUser={id:1,email:"student@example.test",role:"student",status:"active",fullName:"طالب",phone:"+966500000001",phoneVerifiedAt:"2026-01-01",updatedAt:"2026-09-01"};
const actor={id:99,email:"admin@example.test",role:"admin"};
const jsonError=(error,status=400,code)=>Response.json({ok:false,error,code},{status});
async function setup(initial={}){
 const fake=controlDatabase({users:[initialUser],...initial});let courseExists=true;
 const route=await isolatedSource("app/api/admin/students/[email]/actions/route.ts",{...fake.tables,...fake.operators,...contract,...body,createHash,getDb:()=>fake.db,adminControlGuard:async()=>({user:actor,response:null}),clientIp:()=>"127.0.0.1",validEmail:value=>/^[^@]+@[^@]+\.[^@]+$/.test(value),validAcademicLevel:value=>value==="المستوى الأول",getCourseCatalog:async slug=>courseExists?{slug,title:"مادة اختبار",availableForPurchase:true}:null,getInstitutionsCatalog:async()=>[{slug:"uni"}],getProgramsCatalog:async()=>({programs:[{name:"تمريض"}]}),invalidateCatalogCache:()=>{},isUniqueConstraintError:()=>false,jsonError});
 const post=(payload,email=initialUser.email)=>route.POST(new Request("https://platform.test/api/admin/students/test/actions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({operationKey:randomUUID(),reason:"سبب إداري واضح",...payload})}),{params:Promise.resolve({email})});
 return {...fake,post,setCourseExists:value=>{courseExists=value;}};
}
function recordPayload(action,id=7){return {action,id,operation:"pause",days:30,status:action==="ai.status"?"revoked":"closed",visibility:"internal",body:"ملاحظة تجريبية"};}
const targets=[["course.access","courseAccess","userEmail"],["ai.status","aiEntitlements","userId"],["waitlist.cancel","courseWaitlist","userEmail"],["track.cancel","learningTrackInterests","userId"],["favorite.remove","favorites","userEmail"],["cart.remove","cartItems","userEmail"],["support.reply","supportTickets","userEmail"],["support.status","supportTickets","userEmail"],["request.status","courseRequests","userId"],["notification.cancel","notificationsDb","userEmail"],["notification.retry","notificationsDb","userEmail"],["session.revoke","authSessions","userId"],["push.disable","pushDevices","userId"]];
for(const [action,table,owner] of targets)test(`${action}: another student's record cannot be mutated`,async()=>{
 const row={id:7,[owner]:owner==="userId"?2:"other@example.test",status:"active",pushStatus:"pending",revokedAt:null};
 const s=await setup({[table]:[row]});const payload=recordPayload(action);if(action==="request.status")payload.status="reviewing";
 const res=await s.post(payload);assert.equal(res.status,404);assert.deepEqual(s.state[table],[row]);assert.equal(s.state.auditLogs.length,0);assert.equal(s.state.adminOperations.length,0);
});
test("grant retries are idempotent even after the catalog changes",async()=>{
 const s=await setup();const payload={action:"course.grant",courseSlug:"math",days:30,operationKey:randomUUID()};
 assert.equal((await s.post(payload)).status,200);s.setCourseExists(false);const replay=await s.post(payload);assert.equal(replay.status,200);assert.equal((await replay.json()).replayed,true);
 assert.equal(s.state.courseAccess.length,1);assert.equal(s.state.notificationsDb.length,1);assert.equal(s.state.auditLogs.length,1);assert.equal(s.state.courseAccess[0].source,"admin");
});
test("reuse of an operation key for a different body or student returns conflict",async()=>{
 const s=await setup();const key=randomUUID();assert.equal((await s.post({action:"ai.grant",days:5,operationKey:key})).status,200);
 assert.equal((await s.post({action:"ai.grant",days:6,operationKey:key})).status,409);
 assert.equal((await s.post({action:"ai.grant",days:5,operationKey:key},"other@example.test")).status,409);assert.equal(s.state.aiEntitlements.length,1);
});
test("failed outbox insert rolls back grant, access event and audit/idempotency rows",async()=>{
 const s=await setup();s.controls.failInsert="notificationsDb";const r=await s.post({action:"course.grant",courseSlug:"math",days:30});assert.equal(r.status,503);
 for(const name of ["courseAccess","courseAccessEvents","auditLogs","adminOperations"])assert.equal(s.state[name].length,0,name);
});
test("internal support replies never create a student notification or reopen a ticket",async()=>{
 const s=await setup({supportTickets:[{id:7,userEmail:initialUser.email,status:"closed",ticketNumber:"SUP-7"}]});const r=await s.post(recordPayload("support.reply"));assert.equal(r.status,200);assert.equal(s.state.supportReplies[0].internal,true);assert.equal(s.state.notificationsDb.length,0);assert.equal(s.state.supportTickets[0].status,"closed");
});
test("profile updates reject stale data and invalidate phone verification only on change",async()=>{
 const s=await setup();const payload={action:"profile.update",fullName:"طالب جديد",phone:"+966500000002",universitySlug:"uni",specialty:"تمريض",academicLevel:"المستوى الأول",expectedUpdatedAt:"stale"};assert.equal((await s.post(payload)).status,409);
 payload.expectedUpdatedAt=initialUser.updatedAt;assert.equal((await s.post(payload)).status,200);assert.equal(s.state.users[0].phoneVerifiedAt,null);assert.equal(s.state.users[0].email,initialUser.email);
});
test("suspension revokes sessions and Push without deleting durable device records",async()=>{
 const s=await setup({authSessions:[{id:7,userId:1,revokedAt:null},{id:8,userId:2,revokedAt:null}],pushDevices:[{id:7,userId:1,status:"active"}]});assert.equal((await s.post({action:"account.status",status:"suspended"})).status,200);assert.ok(s.state.authSessions[0].revokedAt);assert.equal(s.state.authSessions[1].revokedAt,null);assert.equal(s.state.pushDevices[0].status,"revoked");assert.equal(s.state.users[0].status,"suspended");
});
test("single-session revocation disables only Push registered to that device",async()=>{
 const s=await setup({authSessions:[{id:7,userId:1,deviceId:"device-a",revokedAt:null}],pushDevices:[{id:1,userId:1,deviceId:"device-a",status:"active"},{id:2,userId:1,deviceId:"device-b",status:"active"}]});assert.equal((await s.post({action:"session.revoke",id:7})).status,200);assert.equal(s.state.pushDevices[0].status,"revoked");assert.equal(s.state.pushDevices[1].status,"active");
});
test("cancelled waitlist opt-in cancels only its own unclaimed launch notice",async()=>{
 const s=await setup({courseWaitlist:[{id:7,userEmail:initialUser.email,status:"notified",activationVersion:2}],notificationsDb:[{id:1,userEmail:initialUser.email,dedupeKey:"waitlist:7:v2:launched",pushStatus:"pending",pushEnabled:true},{id:2,userEmail:initialUser.email,dedupeKey:"waitlist:7:v1:launched",pushStatus:"accepted",pushEnabled:true}]});assert.equal((await s.post({action:"waitlist.cancel",id:7})).status,200);assert.equal(s.state.notificationsDb[0].pushStatus,"cancelled");assert.equal(s.state.notificationsDb[1].pushStatus,"accepted");
});
test("accepted/processing notifications cannot be retracted or retried",async()=>{
 for(const pushStatus of ["accepted","processing"]) {const s=await setup({notificationsDb:[{id:7,userEmail:initialUser.email,pushStatus,pushEnabled:true}]});for(const action of ["notification.cancel","notification.retry"])assert.equal((await s.post({action,id:7})).status,409);assert.equal(s.state.notificationsDb[0].pushStatus,pushStatus);}
});
test("existing paid access cannot be overwritten by an administrative grant",async()=>{
 const paid={id:7,userEmail:initialUser.email,courseSlug:"math",source:"purchase",orderNumber:"PAID-1"};const s=await setup({courseAccess:[paid]});assert.equal((await s.post({action:"course.grant",courseSlug:"math",days:20})).status,409);assert.deepEqual(s.state.courseAccess,[paid]);
});
test("unknown financial/verification actions and oversized requests are rejected",async()=>{
 const s=await setup();for(const action of ["order.markPaid","profile.verifyEmail","user.promote","arbitrary.sql"])assert.equal((await s.post({action})).status,400);assert.equal((await s.post({action:"notification.send",body:"x".repeat(30000)})).status,413);assert.equal(s.state.auditLogs.length,0);
});
