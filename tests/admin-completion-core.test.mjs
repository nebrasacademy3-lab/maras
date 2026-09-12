import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {isolatedSource} from "./helpers/isolated-source.mjs";
import {controlDatabase} from "./helpers/control-database.mjs";
const contract=await isolatedSource("lib/student-control-contract.ts");
const enrollment=await isolatedSource("lib/course-enrollment.ts");
const audience=await isolatedSource("lib/course-audience-contract.ts");
const lock=await isolatedSource("lib/advisory-lock.ts");
const jsonError=(error,status=400,code)=>Response.json({error,code},{status});
test("all 19 actions belong to eight groups, have unique IDs and no unsafe financial/identity writes",()=>{
 assert.equal(contract.STUDENT_CONTROL_ACTIONS.length,19);assert.equal(new Set(contract.STUDENT_CONTROL_ACTIONS.map(x=>x.action)).size,19);assert.equal(new Set(contract.STUDENT_CONTROL_ACTIONS.map(x=>x.group)).size,8);
 assert.equal(contract.STUDENT_CONTROL_ACTIONS.find(x=>x.action==="ai.status").fields[1].options[1].value,"revoked");
});
for(const value of ["https://evil.test/","//evil.test/","/\\evil.test/","/%2f%2fevil.test/","/%252f%252fevil.test/","/admin/users","/%61dmin/users","/api/auth","/x/../admin","/bad%00","/bad%","/\n"])test(`unsafe notification URL rejected: ${JSON.stringify(value)}`,()=>assert.throws(()=>contract.safeInternalActionUrl(value)));
test("internal Unicode URLs and harmless query parameters are preserved",()=>{
 assert.equal(contract.safeInternalActionUrl("/courses/math?tab=notes#lesson"),"/courses/math?tab=notes#lesson");assert.equal(contract.safeInternalActionUrl(""),null);
});
test("admin form parser rejects invalid IDs, nonprimitive values and unbounded durations",()=>{
 const base={action:"course.access",id:"7",operation:"extend",days:30,reason:"سبب واضح",operationKey:"0123456789abcdef"};
 for(const patch of [{id:"2147483648"},{id:"1 OR 1=1"},{days:3651},{days:0},{days:1.5},{days:{}},{reason:""},{operationKey:"short"},{operation:"delete"}])assert.throws(()=>contract.parseStudentControl({...base,...patch}));
 assert.equal(contract.parseStudentControl(base).fields.days,30);assert.equal(contract.canonicalControlJson({b:2,a:1}),contract.canonicalControlJson({a:1,b:2}));
});
test("automatic enrollment preserves ready-lesson rule; explicit open never publishes a draft",()=>{
 assert.equal(enrollment.enrollmentAvailable("auto",0),false);assert.equal(enrollment.enrollmentAvailable("auto",1),true);assert.equal(enrollment.enrollmentAvailable("open",0),true);assert.equal(enrollment.enrollmentAvailable("closed",4),false);for(const state of ["draft","hidden","archived"])assert.equal(enrollment.enrollmentAvailable("open",4,state),false);
});
test("audience filters cap pages, reject injected statuses and escape LIKE wildcards",()=>{
 const q=audience.audienceQuery(new URLSearchParams({kind:"waitlist",status:"active OR true",page:"999999999",pageSize:"10000",q:"x".repeat(500)}));assert.equal(q.status,"all");assert.equal(q.pageSize,100);assert.equal(q.search.length,160);assert.equal(q.page,100000);assert.equal(audience.escapedLike("a%b_c\\"),"%a\\%b\\_c\\\\%");
});
test("scheduled, suspended, revoked and malformed access never counts as active",()=>{
 const now=Date.parse("2026-09-11T00:00:00Z");const row={startsAt:"2026-01-01",expiresAt:null,suspendedAt:null,revokedAt:null};assert.equal(audience.courseAccessState(row,now),"active");for(const [patch,status] of [[{startsAt:"2027-01-01"},"scheduled"],[{startsAt:"bad"},"expired"],[{expiresAt:"bad"},"expired"],[{expiresAt:"2026-09-11T00:00:00Z"},"expired"],[{suspendedAt:"now"},"suspended"],[{revokedAt:"now"},"revoked"]])assert.equal(audience.courseAccessState({...row,...patch},now),status);
});
for(const scenario of ["success","busy","work_error","acquire_error","unlock_error","unlock_false"])test(`advisory lock releases its own connection correctly: ${scenario}`,async()=>{
 const calls=[];let work=0;let destroyed;
 const client={query:async sql=>{calls.push(sql);if(sql.includes("try_")){if(scenario==="acquire_error")throw new Error("network");return {rows:[{locked:scenario!=="busy"}]};}if(scenario==="unlock_error")throw new Error("network");return {rows:[{unlocked:scenario!=="unlock_false"}]};},release:destroy=>{assert.equal(destroyed,undefined);destroyed=destroy;}};
 const run=()=>lock.withSessionAdvisoryLock({connect:async()=>client},7412009113,async()=>{work++;if(scenario==="work_error")throw new Error("work");return 42;});
 if(["work_error","acquire_error"].includes(scenario))await assert.rejects(run);else assert.equal(await run(),scenario==="busy"?null:42);
 assert.equal(work,["busy","acquire_error"].includes(scenario)?0:1);assert.equal(destroyed,["acquire_error","unlock_error","unlock_false"].includes(scenario));assert.equal(calls.length,["busy","acquire_error"].includes(scenario)?1:2);
});
test("admin guard rejects nonadmin, bad origin, missing step-up and excessive traffic before mutations",async()=>{
 class AdminMfaError extends Error{constructor(){super("MFA");this.status=403;this.code="ADMIN_MFA_REQUIRED";}}
 for(const options of [{role:"student"},{role:null},{origin:false},{mfa:false},{rate:false}]){
  let stepUps=0;const guard=await isolatedSource("lib/admin-control-guard.ts",{jsonError,AdminMfaError,getSessionUser:async()=>options.role===null?null:{id:1,role:options.role||"admin"},roleAllowed:(user,roles)=>Boolean(user&&roles.includes(user.role)),sameOriginRequest:()=>options.origin!==false,checkRateLimit:async()=>options.rate!==false,requireAdminStepUp:async()=>{stepUps++;if(options.mfa===false)throw new AdminMfaError();}});
  const result=await guard.adminControlGuard(new Request("https://platform.test/"),true);assert.equal(result.user,null);assert.equal(result.response.status,options.rate===false?429:403);if(options.mfa!==false)assert.equal(stepUps,0);
 }
});
async function launcher(initial,courses){const fake=controlDatabase(initial);const service=await isolatedSource("lib/course-launch-notifications.ts",{...fake.operators,...fake.tables,getDb:()=>fake.db,getCoursesCatalog:async()=>courses});return {...fake,...service};}
test("eligible old waitlist entries are not starved by thousands of unavailable recent courses",async()=>{
 const rows=Array.from({length:2100},(_,i)=>({id:i+2,userEmail:"s@test",courseSlug:"closed",status:"active",activationVersion:1,updatedAt:"2026-09-10"}));rows.push({id:1,userEmail:"s@test",courseSlug:"open",status:"active",activationVersion:1,updatedAt:"2026-01-01"});
 const s=await launcher({users:[{id:1,email:"s@test",role:"student",status:"active"}],courseWaitlist:rows},[{slug:"open",title:"Open",availableForPurchase:true},{slug:"closed",availableForPurchase:false}]);const result=await s.queueCourseLaunchNotifications(undefined,1);assert.equal(result.queued,1);assert.equal(s.state.notificationsDb[0].dedupeKey,"waitlist:1:v1:launched");assert.equal(s.state.courseWaitlist.find(x=>x.id===2).status,"active");assert.deepEqual(s.controls.locks.find(x=>x.table==="courseWaitlist").options,{skipLocked:true});
});
test("launch outbox is idempotent, versioned and rolls back a failed notification insert",async()=>{
 const s=await launcher({users:[{id:1,email:"s@test",role:"student",status:"active"}],courseWaitlist:[{id:1,userEmail:"s@test",courseSlug:"open",status:"active",activationVersion:1,updatedAt:"2026-01-01"}]},[{slug:"open",title:"Open",availableForPurchase:true}]);s.controls.failInsert="notificationsDb";await assert.rejects(s.queueCourseLaunchNotifications());assert.equal(s.state.courseWaitlist[0].status,"active");s.controls.failInsert=null;
 assert.equal((await s.queueCourseLaunchNotifications()).queued,1);assert.equal((await s.queueCourseLaunchNotifications()).queued,0);s.state.courseWaitlist[0].activationVersion=2;s.state.courseWaitlist[0].status="active";assert.equal((await s.queueCourseLaunchNotifications()).queued,1);assert.equal(new Set(s.state.notificationsDb.map(x=>x.dedupeKey)).size,2);
});
test("database administrative closure blocks launches even when catalog cache is stale",async()=>{
 const s=await launcher({users:[{id:1,email:"s@test",role:"student",status:"active"}],catalogCourses:[{slug:"open",status:"published",enrollmentMode:"closed"}],courseWaitlist:[{id:1,userEmail:"s@test",courseSlug:"open",status:"active",activationVersion:1}]},[{slug:"open",title:"Open",availableForPurchase:true}]);assert.equal((await s.queueCourseLaunchNotifications()).queued,0);assert.equal(s.state.courseWaitlist[0].status,"active");
});
test("migration snapshot, journal, schema indexes and student-scoped sync triggers agree",async()=>{
 const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");const journal=JSON.parse(await read("drizzle/meta/_journal.json"));assert.equal(journal.entries.find(entry=>entry.idx===29).tag,"0029_admin_control_completion");const snapshot=JSON.parse(await read("drizzle/meta/0029_snapshot.json"));const previous=JSON.parse(await read("drizzle/meta/0028_snapshot.json"));assert.equal(snapshot.prevId,previous.id);
 const migration=await read("drizzle/0029_admin_control_completion.sql");const schema=await read("db/schema.ts");for(const name of ["admin_operations_student_created_idx","course_waitlist_dispatch_idx","course_access_course_user_idx","audit_created_idx"]) {assert.ok(migration.includes(name));assert.ok(schema.includes(name));assert.ok(JSON.stringify(snapshot).includes(name));}
 for(const table of ["ai_entitlements","course_waitlist","push_devices"])assert.ok(migration.includes(`sync_${table}_account`));assert.ok(snapshot.tables["public.catalog_courses"].columns.enrollment_mode);assert.ok(snapshot.tables["public.course_waitlist"].columns.activation_version);
});
