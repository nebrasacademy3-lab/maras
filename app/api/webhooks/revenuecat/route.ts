import { getPool } from "@/db";
import { readBoundedJsonObject } from "@/lib/request-body";
import { revenuecatConfig } from "@/lib/revenuecat";
import { syncStorePurchases } from "@/lib/store-purchases";
import { StoreError,validWebhookAuthorization } from "@/lib/store-contracts";
import { storeApiError } from "@/lib/store-api";
export async function POST(request:Request) {
 try {
  if(!validWebhookAuthorization(request.headers.get("authorization"),process.env.REVENUECAT_WEBHOOK_SECRET||""))throw new StoreError("UNAUTHORIZED","غير مصرح.",401);
  const payload=await readBoundedJsonObject(request,65536);
  const event=payload.event as Record<string,unknown>|undefined;
  if(payload.api_version!=="1.0"||!event||typeof event.id!=="string"||event.id.length>255||typeof event.type!=="string")throw new StoreError("INVALID_EVENT","حدث غير صالح.");
  const config=revenuecatConfig();
  if(event.type==="TEST")return Response.json({ok:true,test:true});
  if(String(event.environment).toLowerCase()!==config.environment||!config.appIds.includes(String(event.app_id)))throw new StoreError("STORE_ENVIRONMENT_MISMATCH","البيئة غير مطابقة.",409);
  if(event.type==="TRANSFER")throw new StoreError("STORE_TRANSFER_BLOCKED","نقل المشتريات يحتاج مراجعة إدارية.",409);
  if(!["NON_RENEWING_PURCHASE","CANCELLATION","REFUND_REVERSED"].includes(event.type))return Response.json({ok:true,ignored:true});
  const db=getPool();
  const existing=await db.query("SELECT status FROM store_webhook_events WHERE event_id=$1",[event.id]);
  if(existing.rows[0]?.status==="processed")return Response.json({ok:true,duplicate:true});
  const user=(await db.query("SELECT u.id,u.email FROM store_purchase_accounts a JOIN users u ON u.id=a.user_id WHERE a.revenuecat_user_id=$1",[String(event.app_user_id)])).rows[0];
  if(!user)throw new StoreError("STORE_ACCOUNT_UNMAPPED","الحساب يحتاج مراجعة الربط.",409);
  await db.query("INSERT INTO store_webhook_events(event_id,event_type,revenuecat_user_id,status,received_at) VALUES($1,$2,$3,'pending',$4) ON CONFLICT(event_id) DO NOTHING",[event.id,event.type,event.app_user_id,new Date().toISOString()]);
  // The signed provider event is a trigger; current server-verified purchases decide access.
  const result=await syncStorePurchases(user);
  const expected=event.type==="CANCELLATION"?"refunded":"owned";
  const matched=(await db.query("SELECT status FROM store_transactions WHERE user_id=$1 AND environment=$2 AND transaction_id=$3 AND store=$4",[user.id,config.environment,String(event.transaction_id),String(event.store).toLowerCase()])).rows[0];
  if(!matched||matched.status!==expected)throw new StoreError("STORE_EVENT_PENDING","لم تنعكس المعاملة بعد لدى المزود. أعد إرسال الحدث.",503);
  await db.query("UPDATE store_webhook_events SET status='processed',processed_at=$2 WHERE event_id=$1",[event.id,new Date().toISOString()]);
  return Response.json({ok:true,...result});
 }catch(error){return storeApiError(error);}
}