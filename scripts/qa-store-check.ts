import assert from "node:assert/strict";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {getPool,getDb,closeDb} from "../db/index";
import {courseAccess} from "../db/schema";
import {activeCourseAccessWhere} from "../lib/course-access";
import {applyVerifiedStorePurchase,reflowFutureStorePeriods,type StoreProductRow} from "../lib/store-purchases";
import {parseStorePurchase,storeTransactionKey,validWebhookAuthorization,type VerifiedStorePurchase} from "../lib/store-contracts";
const config=JSON.parse(readFileSync(".data/qa-database.json","utf8"));
const url=new URL(config.url);
if(!["127.0.0.1","localhost"].includes(url.hostname)||!url.pathname.startsWith("/maras_qa"))throw new Error("Synthetic local database required");
process.env.DATABASE_URL=config.url;
const pool=getPool(),prefix="qa-store-"+randomUUID().slice(0,8),now=new Date().toISOString();
const checks:Array<{name:string;passed:boolean}>=[];
async function check(name:string,fn:()=>Promise<void>|void){await fn();checks.push({name,passed:true});console.log("PASS "+name);}
const makeUser=async(suffix:string)=>{const email=prefix+suffix+"@example.test";const r=await pool.query("INSERT INTO users(email,full_name,role) VALUES($1,'اختبار متجر','student') RETURNING id,email",[email]);return r.rows[0] as {id:number;email:string};};
const a=await makeUser("-a"),b=await makeUser("-b");
async function product(kind:"course"|"ai",duration:number|null):Promise<StoreProductRow>{
 const key=prefix+"-"+kind+"-"+String(duration);
 const r=await pool.query<StoreProductRow>("INSERT INTO store_products(product_key,ios_product_id,kind,target_slug,title,course_slugs_json,duration_days,status,created_at,updated_at) VALUES($1,$1,$2,$3,'منتج اختبار',$4,$5,'active',$6,$6) RETURNING *",[key,kind,kind==="course"?"qa-physics":null,JSON.stringify(kind==="course"?["qa-physics"]:[]),duration,now]);return r.rows[0];
}
const course=await product("course",30),ai=await product("ai",30);
const purchase=(suffix:string):VerifiedStorePurchase=>({providerPurchaseId:"purch-"+prefix+suffix,transactionId:prefix+suffix,productId:"prodQA",store:"app_store",environment:"sandbox",purchasedAt:now,status:"owned"});
async function apply(user:typeof a,p:VerifiedStorePurchase,prod:StoreProductRow,reflow=false){
 const c=await pool.connect();try{await c.query("BEGIN");await c.query("SELECT pg_advisory_xact_lock(hashtext($1))",["store-account:"+user.id]);const result=await applyVerifiedStorePurchase(c,user,p,prod);if(reflow)await reflowFutureStorePeriods(c,user,new Date().toISOString());await c.query("COMMIT");return result;}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
}
try{
 await check("provider payload rejects another owner and wrong environment",()=>{
  const raw={id:"purch1",customer_id:"a",original_customer_id:"a",ownership:"purchased",environment:"sandbox",store:"app_store",status:"owned",quantity:1,purchased_at:Date.now(),store_purchase_identifier:"123",product_id:"prod1"};
  assert.equal(parseStorePurchase(raw,"a","sandbox").transactionId,"123");
  assert.throws(()=>parseStorePurchase(raw,"b","sandbox"));assert.throws(()=>parseStorePurchase(raw,"a","production"));
  assert.throws(()=>parseStorePurchase({...raw,status:"pending"},"a","sandbox"));
  assert.equal(validWebhookAuthorization("Bearer "+ "q".repeat(32),"q".repeat(32)),true);
  assert.equal(validWebhookAuthorization("Bearer wrong","q".repeat(32)),false);
 });
 await pool.query("INSERT INTO course_access(user_email,course_slug,source,starts_at,expires_at) VALUES($1,'qa-physics','admin_complimentary',$2,NULL)",[a.email,now]);
 await check("lifetime baseline survives store purchase and refund",async()=>{
  const p=purchase("-lifetime");await apply(a,p,course);await apply(a,{...p,status:"refunded"},course,true);
  const r=await getDb().select().from(courseAccess).where(activeCourseAccessWhere(a.email,"qa-physics"));
  assert.equal(r.length,1);assert.equal(r[0].expiresAt,null);assert.equal(r[0].source,"admin_complimentary");
 });
 await check("concurrent duplicate transaction creates one 30-day entitlement",async()=>{
  const p=purchase("-ai1");await Promise.all([apply(a,p,ai),apply(a,p,ai),apply(a,p,ai)]);
  const rows=(await pool.query("SELECT starts_at,expires_at FROM ai_entitlements WHERE user_id=$1 AND source='revenuecat'",[a.id])).rows;
  assert.equal(rows.length,1);assert.equal(Date.parse(rows[0].expires_at)-Date.parse(rows[0].starts_at),30*86400000);
 });
 await check("manual AI renewal appends a second 30 days",async()=>{
  await apply(a,purchase("-ai2"),ai);
  const rows=(await pool.query("SELECT starts_at,expires_at FROM ai_entitlements WHERE user_id=$1 AND source='revenuecat' ORDER BY starts_at",[a.id])).rows;
  assert.equal(rows.length,2);assert.equal(rows[1].starts_at,rows[0].expires_at);assert.equal(Date.parse(rows[1].expires_at)-Date.parse(now),60*86400000);
 });
 await check("refund revokes only its AI entitlement and advances queued paid time",async()=>{
  await apply(a,{...purchase("-ai1"),status:"refunded"},ai,true);
  const rows=(await pool.query("SELECT external_ref,status,starts_at,expires_at FROM ai_entitlements WHERE user_id=$1 AND source='revenuecat'",[a.id])).rows;
  assert.equal(rows.filter(r=>r.status==="active").length,1);const active=rows.find(r=>r.status==="active")!;
  assert.equal(Date.parse(active.expires_at)-Date.parse(active.starts_at),30*86400000);assert.ok(Date.parse(active.starts_at)<=Date.now());
 });
 await check("transaction cannot transfer to another account",async()=>{
  await assert.rejects(()=>apply(b,purchase("-ai2"),ai),/حساب آخر/);
  assert.equal((await pool.query("SELECT count(*)::int count FROM ai_entitlements WHERE user_id=$1",[b.id])).rows[0].count,0);
 });
 await check("store course access respects suspension and explicit admin revocation",async()=>{
  const p=purchase("-courseb");await apply(b,p,course);
  assert.equal((await getDb().select().from(courseAccess).where(activeCourseAccessWhere(b.email,"qa-physics"))).length,1);
  await pool.query("UPDATE course_access SET suspended_at=$2 WHERE user_email=$1",[b.email,now]);
  assert.equal((await getDb().select().from(courseAccess).where(activeCourseAccessWhere(b.email,"qa-physics"))).length,0);
  await pool.query("UPDATE course_access SET suspended_at=NULL,store_access_blocked_at=$2 WHERE user_email=$1",[b.email,now]);
  assert.equal((await getDb().select().from(courseAccess).where(activeCourseAccessWhere(b.email,"qa-physics"))).length,0);
  await pool.query("UPDATE course_access SET store_access_blocked_at=NULL,revoked_at=$2 WHERE user_email=$1",[b.email,now]);
  assert.equal((await getDb().select().from(courseAccess).where(activeCourseAccessWhere(b.email,"qa-physics"))).length,1);
 });
 await check("refund and reversal retain original expiry rather than issuing new time",async()=>{
  const p=purchase("-courseb"),id=storeTransactionKey(p);
  const before=(await pool.query("SELECT expires_at FROM store_course_grants WHERE transaction_id=$1",[id])).rows[0];
  await apply(b,{...p,status:"refunded"},course,true);
  assert.equal((await getDb().select().from(courseAccess).where(activeCourseAccessWhere(b.email,"qa-physics"))).length,0);
  await apply(b,p,course);const after=(await pool.query("SELECT expires_at FROM store_course_grants WHERE transaction_id=$1",[id])).rows[0];assert.equal(after.expires_at,before.expires_at);
 });
 await check("second course purchase remains usable after first purchase refund",async()=>{
  const p=purchase("-courseb");await apply(b,purchase("-courseb2"),course);await apply(b,{...p,status:"refunded"},course,true);
  assert.equal((await getDb().select().from(courseAccess).where(activeCourseAccessWhere(b.email,"qa-physics"))).length,1);
  const grants=(await pool.query("SELECT * FROM store_course_grants WHERE user_email=$1 AND status='active'",[b.email])).rows;assert.equal(grants.length,1);assert.equal(Date.parse(grants[0].expires_at)-Date.parse(grants[0].starts_at),30*86400000);
 });
 mkdirSync("outputs/verification",{recursive:true});writeFileSync("outputs/verification/store-integration.json",JSON.stringify({at:new Date().toISOString(),provider:"synthetic verified payloads; no real store purchase",database:"real local PostgreSQL",checks},null,2));
}finally{await closeDb();}
