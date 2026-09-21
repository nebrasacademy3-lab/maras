// Historical store records and entitlement reconciliation remain for existing purchasers.
// New purchases, catalog creation and provider network synchronization are retired.
import type { PoolClient } from "pg";
import { getPool } from "@/db";
import { nextStorePeriod, StoreError, storeTransactionKey, type VerifiedStorePurchase } from "@/lib/store-contracts";

type StoreUser = { id: number; email: string };
export type StoreProductRow = { product_key:string; ios_product_id:string|null; android_product_id:string|null; kind:"course"|"bundle"|"ai"; target_slug:string|null; title:string; course_slugs_json:string; duration_days:number|null; status:string; created_at:string; updated_at:string };
type TransactionRow = {id:string; user_id:number; status:string; kind:string; title:string; duration_days:number|null; course_slugs_json:string; purchased_at:string};
async function audit(client:PoolClient,userId:number,action:string,id:string,details:unknown) {
  await client.query("INSERT INTO audit_logs(actor_email,action,entity_type,entity_id,after_json,created_at) VALUES($1,$2,'store_purchase',$3,$4,$5)",["revenuecat:user:"+userId,action,id,JSON.stringify(details),new Date().toISOString()]);
}
export async function applyVerifiedStorePurchase(client:PoolClient,user:StoreUser,purchase:VerifiedStorePurchase,product:StoreProductRow) {
  const id=storeTransactionKey(purchase);
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",["store-transaction:"+id]);
  const before=(await client.query<TransactionRow>("SELECT * FROM store_transactions WHERE id=$1 FOR UPDATE",[id])).rows[0];
  if(before && before.user_id!==user.id) throw new StoreError("STORE_OWNER_MISMATCH","المعاملة مرتبطة بحساب آخر.",409);
  if(before && before.status===purchase.status) {
    await client.query("UPDATE store_transactions SET verified_at=$2 WHERE id=$1",[id,new Date().toISOString()]);
    return false;
  }
  const now=new Date().toISOString();
  if(!before) {
    await client.query("INSERT INTO store_transactions(id,user_id,product_key,provider_purchase_id,transaction_id,store,environment,kind,title,course_slugs_json,duration_days,status,purchased_at,verified_at,refunded_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$14)",
      [id,user.id,product.product_key,purchase.providerPurchaseId,purchase.transactionId,purchase.store,purchase.environment,product.kind,product.title,product.course_slugs_json,product.duration_days,purchase.status,purchase.purchasedAt,now,purchase.status==="refunded"?now:null]);
  } else await client.query("UPDATE store_transactions SET status=$2,verified_at=$3,refunded_at=$4 WHERE id=$1",[id,purchase.status,now,purchase.status==="refunded"?now:null]);
  const snapshot=before||{kind:product.kind,duration_days:product.duration_days,course_slugs_json:product.course_slugs_json,purchased_at:purchase.purchasedAt,title:product.title};
  const active=purchase.status==="owned";
  if(snapshot.kind==="ai") {
    const existing=(await client.query("SELECT id FROM ai_entitlements WHERE user_id=$1 AND source='revenuecat' AND external_ref=$2",[user.id,id])).rows[0];
    if(existing) await client.query("UPDATE ai_entitlements SET status=$2,updated_at=$3 WHERE id=$1",[existing.id,active?"active":"revoked",now]);
    else if(active) {
      const prior=await client.query<{expires_at:string|null}>("SELECT expires_at FROM ai_entitlements WHERE user_id=$1 AND status='active' AND expires_at>$2",[user.id,snapshot.purchased_at]);
      const period=nextStorePeriod(snapshot.purchased_at,30,prior.rows.map(r=>r.expires_at));
      await client.query("INSERT INTO ai_entitlements(user_id,source,external_ref,status,starts_at,expires_at,created_by,created_at,updated_at) VALUES($1,'revenuecat',$2,'active',$3,$4,'revenuecat',$5,$5)",[user.id,id,period.startsAt,period.expiresAt,now]);
    }
  } else {
    const slugs=JSON.parse(snapshot.course_slugs_json) as string[];
    for(const slug of [...slugs].sort()) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",["course-access:"+user.id+":"+slug]);
      const existing=(await client.query("SELECT id FROM store_course_grants WHERE transaction_id=$1 AND course_slug=$2",[id,slug])).rows[0];
      if(existing) await client.query("UPDATE store_course_grants SET status=$2 WHERE id=$1",[existing.id,active?"active":"refunded"]);
      else if(active) {
        const prior=await client.query<{expires_at:string|null}>("SELECT expires_at FROM store_course_grants WHERE user_id=$1 AND course_slug=$2 AND status='active' AND expires_at>$3 UNION ALL SELECT expires_at FROM course_access WHERE user_id=$1 AND course_slug=$2 AND source<>'revenuecat' AND revoked_at IS NULL AND expires_at>$3",[user.id,slug,snapshot.purchased_at]);
        const period=nextStorePeriod(snapshot.purchased_at,snapshot.duration_days,prior.rows.map(r=>r.expires_at));
        await client.query("INSERT INTO store_course_grants(transaction_id,user_id,user_email,course_slug,starts_at,expires_at,status) VALUES($1,$2,$3,$4,$5,$6,'active')",[id,user.id,user.email,slug,period.startsAt,period.expiresAt]);
      }
      if(active) {
        // Only create the identity anchor. Independent manual/Tap rights and administrative blocks are never overwritten.
        await client.query("INSERT INTO course_access(user_id,user_email,course_slug,source,starts_at,expires_at,updated_at) VALUES($1,$2,$3,'revenuecat',$4,$4,$5) ON CONFLICT(user_id,course_slug) DO NOTHING",[user.id,user.email,slug,snapshot.purchased_at,now]);
        await client.query("DELETE FROM cart_items WHERE user_id=$1 AND course_slug=$2",[user.id,slug]);
        await client.query("UPDATE course_waitlist SET status='converted',converted_at=$3,updated_at=$3 WHERE user_id=$1 AND course_slug=$2 AND status IN ('active','notified')",[user.id,slug,now]);
      }
      await client.query("INSERT INTO course_access_events(event_key,user_id,user_email,course_slug,action,actor_email,reason,after_json,created_at) VALUES($1,$2,$3,$4,$5,'revenuecat',$6,$7,$8) ON CONFLICT(event_key) DO NOTHING",["store:"+id+":"+slug+":"+purchase.status+":"+now,user.id,user.email,slug,active?"store-grant":"store-refund","شراء موثق من المتجر",JSON.stringify({transactionId:id,status:purchase.status}),now]);
    }
  }
  if(before?.status==="refunded" && active)await resequenceRestoredStorePeriods(client,user,snapshot.kind,now);
  await audit(client,user.id,active?"store-purchase-verified":"store-purchase-refunded",id,{status:purchase.status,previousStatus:before?.status||null});
  await client.query("INSERT INTO notifications(target_user_id,title,body,action_url,dedupe_key,push_enabled,created_at) VALUES($1,$2,$3,$4,$5,true,$6) ON CONFLICT(dedupe_key) DO NOTHING",[user.id,active?"تم تفعيل مشتريات التطبيق":"تم تحديث استرداد المتجر",snapshot.title, snapshot.kind==="ai"?"/study-tools":"/dashboard","store:"+id+":"+purchase.status,now]);
  return true;
}
export async function storeHistory(userId:number,page=1) {
  const limit=30;
  const [rows,total]=await Promise.all([getPool().query("SELECT id,title,kind,store,environment,status,purchased_at,refunded_at,duration_days FROM store_transactions WHERE user_id=$1 ORDER BY purchased_at DESC,id DESC LIMIT $2 OFFSET $3",[userId,limit,(page-1)*limit]),getPool().query("SELECT COUNT(*)::int AS total FROM store_transactions WHERE user_id=$1",[userId])]);
  return {items:rows.rows,page,pageSize:limit,total:total.rows[0].total};
}

export async function reflowFutureStorePeriods(client:PoolClient,user:StoreUser,now=new Date().toISOString()) {
  const ai=await client.query<{id:number;starts_at:string;expires_at:string}>("SELECT id,starts_at,expires_at FROM ai_entitlements WHERE user_id=$1 AND source='revenuecat' AND status='active' AND starts_at>$2 ORDER BY starts_at,id FOR UPDATE",[user.id,now]);
  if(ai.rows.length){
    const occupied=await client.query<{expires_at:string|null}>("SELECT expires_at FROM ai_entitlements WHERE user_id=$1 AND status='active' AND (source<>'revenuecat' OR starts_at<=$2) AND (expires_at IS NULL OR expires_at>$2)",[user.id,now]);
    if(!occupied.rows.some(r=>r.expires_at===null)){
      let start=Math.max(Date.parse(now),...occupied.rows.map(r=>Date.parse(r.expires_at!)));
      for(const row of ai.rows){const end=start+Date.parse(row.expires_at)-Date.parse(row.starts_at);await client.query("UPDATE ai_entitlements SET starts_at=$2,expires_at=$3,updated_at=$4 WHERE id=$1",[row.id,new Date(start).toISOString(),new Date(end).toISOString(),now]);start=end;}
    }
  }
  const future=await client.query<{id:number;course_slug:string;starts_at:string;expires_at:string}>("SELECT id,course_slug,starts_at,expires_at FROM store_course_grants WHERE user_id=$1 AND status='active' AND starts_at>$2 AND expires_at IS NOT NULL ORDER BY course_slug,starts_at,id FOR UPDATE",[user.id,now]);
  const ends=new Map<string,number|null>();
  for(const row of future.rows){
    if(!ends.has(row.course_slug)){
      const occupied=await client.query<{expires_at:string|null}>("SELECT expires_at FROM store_course_grants WHERE user_id=$1 AND course_slug=$2 AND status='active' AND starts_at<=$3 AND (expires_at IS NULL OR expires_at>$3) UNION ALL SELECT expires_at FROM course_access WHERE user_id=$1 AND course_slug=$2 AND source<>'revenuecat' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>$3)",[user.id,row.course_slug,now]);
      ends.set(row.course_slug,occupied.rows.some(r=>r.expires_at===null)?null:Math.max(Date.parse(now),...occupied.rows.map(r=>Date.parse(r.expires_at!))));
    }
    const start=ends.get(row.course_slug);if(start===null||start===undefined)continue;
    const end=start+Date.parse(row.expires_at)-Date.parse(row.starts_at);
    await client.query("UPDATE store_course_grants SET starts_at=$2,expires_at=$3 WHERE id=$1",[row.id,new Date(start).toISOString(),new Date(end).toISOString()]);ends.set(row.course_slug,end);
  }
}

/** Reversing a refund restores only unexpired time and serializes remaining paid periods. */
export async function resequenceRestoredStorePeriods(client:PoolClient,user:StoreUser,kind:string,now=new Date().toISOString()) {
  if(kind==="ai"){
    const rows=await client.query<{id:number;starts_at:string;expires_at:string}>("SELECT e.id,e.starts_at,e.expires_at FROM ai_entitlements e JOIN store_transactions t ON t.id=e.external_ref WHERE e.user_id=$1 AND e.source='revenuecat' AND e.status='active' AND e.expires_at>$2 ORDER BY t.purchased_at,t.id FOR UPDATE OF e",[user.id,now]);
    const baseline=await client.query<{expires_at:string|null}>("SELECT expires_at FROM ai_entitlements WHERE user_id=$1 AND source<>'revenuecat' AND status='active' AND (expires_at IS NULL OR expires_at>$2)",[user.id,now]);
    if(baseline.rows.some(r=>r.expires_at===null))return;
    let start=Math.max(Date.parse(now),...baseline.rows.map(r=>Date.parse(r.expires_at!)));
    for(const row of rows.rows){const remaining=Date.parse(row.expires_at)-Math.max(Date.parse(now),Date.parse(row.starts_at));const end=start+remaining;await client.query("UPDATE ai_entitlements SET starts_at=$2,expires_at=$3,updated_at=$4 WHERE id=$1",[row.id,new Date(start).toISOString(),new Date(end).toISOString(),now]);start=end;}
    return;
  }
  const rows=await client.query<{id:number;course_slug:string;starts_at:string;expires_at:string}>("SELECT g.id,g.course_slug,g.starts_at,g.expires_at FROM store_course_grants g JOIN store_transactions t ON t.id=g.transaction_id WHERE g.user_id=$1 AND g.status='active' AND g.expires_at>$2 ORDER BY g.course_slug,t.purchased_at,t.id FOR UPDATE OF g",[user.id,now]);
  const ends=new Map<string,number|null>();
  for(const row of rows.rows){
    if(!ends.has(row.course_slug)){
      const baseline=await client.query<{expires_at:string|null}>("SELECT expires_at FROM course_access WHERE user_id=$1 AND course_slug=$2 AND source<>'revenuecat' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>$3) UNION ALL SELECT expires_at FROM store_course_grants WHERE user_id=$1 AND course_slug=$2 AND status='active' AND expires_at IS NULL",[user.id,row.course_slug,now]);
      ends.set(row.course_slug,baseline.rows.some(r=>r.expires_at===null)?null:Math.max(Date.parse(now),...baseline.rows.map(r=>Date.parse(r.expires_at!))));
    }
    const start=ends.get(row.course_slug);if(start===null||start===undefined)continue;
    const remaining=Date.parse(row.expires_at)-Math.max(Date.parse(now),Date.parse(row.starts_at));const end=start+remaining;
    await client.query("UPDATE store_course_grants SET starts_at=$2,expires_at=$3 WHERE id=$1",[row.id,new Date(start).toISOString(),new Date(end).toISOString()]);ends.set(row.course_slug,end);
  }
}
