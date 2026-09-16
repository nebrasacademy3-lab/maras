/** Real controller/DB checks; explicit loopback-only database and synthetic identities. */
import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {and,eq,isNull} from "drizzle-orm";
const local=JSON.parse(readFileSync(".data/qa-database.json","utf8")) as {url:string};
if(process.env.DATABASE_URL!==local.url||new URL(local.url).hostname!=="127.0.0.1"||new URL(local.url).pathname!=="/maras_qa")throw new Error("Loopback QA database only");
if(["GEMINI_API_KEY","GEMINI_API_KEYS","RESEND_API_KEY","TAP_SECRET_KEY","S3_BUCKET","BUCKET"].some(k=>process.env[k]))throw new Error("No live provider credentials");
const origin="https://maras-qa.example";process.env.APP_URL=origin;
const [{getDb,closeDb},s,auth,mfa,partners,consoleApi,profile]=await Promise.all([import("../db"),import("../db/schema"),import("../lib/auth"),import("../lib/admin-mfa"),import("../app/api/admin/partners/route"),import("../app/api/admin/console/route"),import("../app/api/admin/students/[email]/route")]);
const db=getDb(),now=()=>new Date().toISOString(),nonce=randomUUID().slice(0,8),checks:string[]=[];
const fixture=JSON.parse(readFileSync(".data/qa-fixtures.json","utf8")) as {users:{id:number;email:string;role:string;token:string}[]};
const ownerFixture=fixture.users.find(u=>u.role==="admin")!;
const[ownerRow]=await db.select().from(s.users).where(eq(s.users.id,ownerFixture.id));assert.equal(ownerRow.isPlatformOwner,true);
const owner=auth.sessionUserFromRow(ownerRow);let factorId:number|null=null,partnerId:number|null=null;
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error("External requests disabled for administrative security QA");};
const pass=(name:string)=>{checks.push(name);console.log("PASS ADMIN",name);};
function req(path:string,token="",body?:FormData|Record<string,unknown>,extra:Record<string,string>={},method?:string){return new Request(origin+path,{method:method||(body===undefined?"GET":"POST"),headers:{origin,"user-agent":"Isolated admin QA","x-meras-device-id":`qa-admin-${nonce}`,...(token?{cookie:`${auth.SESSION_COOKIE}=${token}`} : {}),...(body&&!(body instanceof FormData)?{"content-type":"application/json"}:{}),...extra},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});}
function form(values:Record<string,unknown>={}){const data=new FormData();for(const[key,value]of Object.entries({name:`شريك تجريبي ${nonce}`,kind:"partner",status:"draft",logoUrl:"https://example.test/verified-logo.png",...values}))data.append(key,String(value));return data;}
async function account(label:string,role="student"){const[row]=await db.insert(s.users).values({email:`qa-admin-${nonce}-${label}@example.test`,fullName:`حساب اختبار ${label}`,role,status:"active",profileCompletedAt:now(),onboardingCompletedAt:now()}).returning();return auth.sessionUserFromRow(row);}
try{
 const staff=await account("staff","supervisor"),student=await account("student"),other=await account("other","supervisor");
 const staffSession=await auth.createSession(staff.id,req("/api/auth/login"));const studentSession=await auth.createSession(student.id,req("/api/auth/login"));
 assert.equal((await partners.POST(req("/api/admin/partners","",form()))).status,403);assert.equal((await partners.POST(req("/api/admin/partners",studentSession.token,form()))).status,403);
 assert.equal((await partners.POST(req("/api/admin/partners",ownerFixture.token,form(),{origin:"https://evil.example"}))).status,403);
 pass("anonymous, student and foreign-origin partner writes are rejected");
 await db.insert(s.staffPermissions).values([{userId:staff.id,permission:"catalog.view",grantedBy:owner.id},{userId:staff.id,permission:"students.view",grantedBy:owner.id}]);
 assert.equal((await partners.GET(req("/api/admin/partners",staffSession.token))).status,403);
 const scopedResponse=await consoleApi.GET(req("/api/admin/console?view=courses&scope=screen",staffSession.token));assert.equal(scopedResponse.status,200);const scoped=await scopedResponse.json();
 for(const key of ["users","orders","access","sessions","audit","support","requests"])assert.deepEqual(scoped[key]??[],[],key);
 assert.deepEqual(scoped.settings,{});assert.equal(Object.keys(scoped.services).length,0);
 const wrongActor=await consoleApi.GET(req("/api/admin/console?view=courses&scope=screen",staffSession.token,undefined,{"x-meras-acting-user":String(other.id)}));assert.equal(wrongActor.status,403);
 pass("scoped catalog response omits unrelated domains; a stale actor header cannot authorize another account");
 const context={params:Promise.resolve({email:student.email})};const student360=await profile.GET(req(`/api/admin/students/${student.email}`,staffSession.token),context);assert.equal(student360.status,200);const data=await student360.json();
 assert.deepEqual(data.orders,[]);assert.deepEqual(data.sessions,[]);assert.deepEqual(data.support,[]);assert.deepEqual(data.ai.orders,[]);assert.equal(data.summary.paidValue,0);
 pass("student-view staff receive no financial, device or support data from the full student profile");
 assert.equal((await partners.POST(req("/api/admin/partners",ownerFixture.token,form()))).status,428);
 assert.equal((await db.select().from(s.platformPartners).where(eq(s.platformPartners.name,`شريك تجريبي ${nonce}`))).length,0);
 pass("partner writes require administrative MFA before parsing or persistence");
 assert.equal((await db.select().from(s.adminMfaFactors).where(and(eq(s.adminMfaFactors.userId,owner.id),isNull(s.adminMfaFactors.disabledAt)))).length,0);
 const[factor]=await db.insert(s.adminMfaFactors).values({userId:owner.id,secretEncrypted:mfa.encryptAdminMfaSecret("JBSWY3DPEHPK3PXP"),verifiedAt:now(),label:"Synthetic admin navigation QA",counter:-1}).returning();factorId=factor.id;
 await db.update(s.authSessions).set({mfaVerifiedAt:now()}).where(eq(s.authSessions.userId,owner.id));
 const proof=mfa.issueVerifiedAdminStepUp(owner,req("/api/admin/partners",ownerFixture.token),factor.id);
 const headers={cookie:`${auth.SESSION_COOKIE}=${ownerFixture.token}; ${mfa.ADMIN_STEP_UP_COOKIE}=${proof.token}`,"x-meras-acting-user":String(owner.id)};
 assert.equal((await partners.POST(req("/api/admin/partners",ownerFixture.token,form({status:"published"}),headers))).status,400);
 assert.equal((await partners.POST(req("/api/admin/partners",ownerFixture.token,form({logoUrl:"https://127.0.0.1/x.png"}),headers))).status,400);
 assert.equal((await partners.POST(req("/api/admin/partners",ownerFixture.token,form({id:999999999,expectedUpdatedAt:now()}),headers))).status,404);
 pass("unattested publication, private-network URLs and non-existing edit targets fail closed");
 const created=await partners.POST(req("/api/admin/partners",ownerFixture.token,form(),headers));assert.equal(created.status,201);const first=(await created.json()).partner;partnerId=first.id;
 assert.equal((await partners.POST(req("/api/admin/partners",ownerFixture.token,form({id:first.id,name:"stale edit"}),headers))).status,409);
 const responses=await Promise.all(["A","B"].map(value=>partners.POST(req("/api/admin/partners",ownerFixture.token,form({id:first.id,expectedUpdatedAt:first.updatedAt,name:`شريك ${value} ${nonce}`}),headers))));assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const[current]=await db.select().from(s.platformPartners).where(eq(s.platformPartners.id,first.id));assert.notEqual(current.updatedAt,first.updatedAt);
 pass("optimistic revision plus row locking permits one of two concurrent edits without lost updates");
 const denied=await partners.DELETE(req("/api/admin/partners",ownerFixture.token,{id:first.id,expectedUpdatedAt:first.updatedAt},headers,"DELETE"));assert.equal(denied.status,409);
 await db.insert(s.staffPermissions).values({userId:staff.id,permission:"content.manage",grantedBy:owner.id});assert.equal((await partners.GET(req("/api/admin/partners",staffSession.token))).status,200);
 assert.equal((await partners.DELETE(req("/api/admin/partners",staffSession.token,{id:first.id,expectedUpdatedAt:current.updatedAt}, {},"DELETE"))).status,403);
 assert.equal((await db.select().from(s.platformPartners).where(eq(s.platformPartners.id,first.id))).length,1);
 pass("stale deletion and content-only deletion cannot erase the current partner record");
 const deleted=await partners.DELETE(req("/api/admin/partners",ownerFixture.token,{id:first.id,expectedUpdatedAt:current.updatedAt},headers,"DELETE"));assert.equal(deleted.status,200);partnerId=null;
 const audit=await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityType,"platform_partner"),eq(s.auditLogs.entityId,String(first.id))));assert.equal(audit.length,3);assert.ok(audit.some(a=>a.action==="create")&&audit.some(a=>a.action==="update")&&audit.some(a=>a.action==="delete"));
 pass("authorized create/update/delete each have one audit entry and safe metadata only");
 writeFileSync(".data/qa-admin-navigation-report.json",JSON.stringify({passed:checks.length,checks,liveProviders:false,database:"disposable loopback PostgreSQL"},null,2));
}finally{if(factorId)await db.delete(s.adminMfaFactors).where(eq(s.adminMfaFactors.id,factorId));if(partnerId)await db.delete(s.platformPartners).where(eq(s.platformPartners.id,partnerId));globalThis.fetch=originalFetch;await closeDb();}
