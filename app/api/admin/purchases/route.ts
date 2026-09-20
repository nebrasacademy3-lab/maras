import { getPool } from "@/db";
import { checkRateLimit,getSessionUser,sameOriginRequest } from "@/lib/auth";
import { ADMIN_PERMISSIONS,hasPermission } from "@/lib/permissions";
import { AdminMfaError,requireAdminStepUp } from "@/lib/admin-mfa";
import { StoreError } from "@/lib/store-contracts";
import { storeApiError } from "@/lib/store-api";
import { mobileNoStoreHeaders } from "@/lib/mobile-api";
async function guard(request:Request,write=false) {
 const user=await getSessionUser(request);
 if(!user||!await hasPermission(user,write?ADMIN_PERMISSIONS.FINANCE_MANAGE:ADMIN_PERMISSIONS.FINANCE_VIEW))throw new StoreError("FORBIDDEN","غير مصرح بإدارة مشتريات التطبيقات.",403);
 if(write){if(!sameOriginRequest(request))throw new StoreError("FORBIDDEN","مصدر الطلب غير صالح.",403);await requireAdminStepUp(request,user);}
 if(!await checkRateLimit("admin-store","user:"+user.id,write?20:90,60))throw new StoreError("RATE_LIMITED","طلبات كثيرة. أعد المحاولة بعد دقيقة.",429);
 return user;
}
function errorResponse(error:unknown){if(error instanceof AdminMfaError)return Response.json({error:error.message,code:error.code},{status:error.status,headers:mobileNoStoreHeaders});return storeApiError(error);}
export async function GET(request:Request) {
 try {
  await guard(request);const url=new URL(request.url);const page=Math.max(1,Math.min(100000,parseInt(url.searchParams.get("page")||"1")||1));
  const productPage=Math.max(1,Math.min(100000,parseInt(url.searchParams.get("productPage")||"1")||1));
  const search=(url.searchParams.get("search")||"").trim().slice(0,120);
  const db=getPool();
  const filter="%"+search.replace(/[\\%_]/g,"\\$&")+"%";
  const [products,transactions,total,events,productTotal]=await Promise.all([
   db.query("SELECT * FROM store_products WHERE ($1='' OR title ILIKE $2 OR product_key ILIKE $2) ORDER BY created_at DESC,product_key DESC LIMIT 30 OFFSET $3",[search,filter,(productPage-1)*30]),
   db.query("SELECT t.*,u.email,u.full_name FROM store_transactions t JOIN users u ON u.id=t.user_id WHERE ($1='' OR u.email ILIKE $2 OR t.title ILIKE $2 OR t.transaction_id ILIKE $2) ORDER BY t.purchased_at DESC,t.id DESC LIMIT 30 OFFSET $3",[search,filter,(page-1)*30]),
   db.query("SELECT COUNT(*)::int AS total FROM store_transactions t JOIN users u ON u.id=t.user_id WHERE ($1='' OR u.email ILIKE $2 OR t.title ILIKE $2 OR t.transaction_id ILIKE $2)",[search,filter]),
   db.query("SELECT event_type,status,COUNT(*)::int AS count FROM store_webhook_events GROUP BY event_type,status"),
   db.query("SELECT COUNT(*)::int AS total FROM store_products WHERE ($1='' OR title ILIKE $2 OR product_key ILIKE $2)",[search,filter]),
  ]);
  return Response.json({ok:true,configured:false,retired:true,productPagination:{page:productPage,pageSize:30,total:productTotal.rows[0].total},products:products.rows,transactions:transactions.rows,events:events.rows,pagination:{page,pageSize:30,total:total.rows[0].total}},{headers:mobileNoStoreHeaders});
 }catch(error){return errorResponse(error);}
}
export async function POST(request: Request) {
 try {
  await guard(request, true);
  return Response.json({ ok: false, code: "STORE_PURCHASES_RETIRED", error: "أوقف تكامل المتاجر؛ هذا القسم مخصص لسجل المشتريات السابقة فقط." }, { status: 410, headers: mobileNoStoreHeaders });
 } catch (error) { return errorResponse(error); }
}
