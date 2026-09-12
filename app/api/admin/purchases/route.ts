import { getPool } from "@/db";
import { checkRateLimit,getSessionUser,sameOriginRequest } from "@/lib/auth";
import { ADMIN_PERMISSIONS,hasPermission } from "@/lib/permissions";
import { AdminMfaError,requireAdminStepUp } from "@/lib/admin-mfa";
import { readBoundedJsonObject } from "@/lib/request-body";
import { getCoursesCatalog } from "@/lib/catalog-store";
import { listActiveCourseBundles } from "@/lib/course-bundles";
import { StoreError } from "@/lib/store-contracts";
import { storeApiError } from "@/lib/store-api";
import { mobileNoStoreHeaders } from "@/lib/mobile-api";
import { revenuecatConfig } from "@/lib/revenuecat";
import { syncStorePurchases } from "@/lib/store-purchases";
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
  const [products,transactions,total,courses,bundles,events,productTotal]=await Promise.all([
   db.query("SELECT * FROM store_products WHERE ($1='' OR title ILIKE $2 OR product_key ILIKE $2) ORDER BY created_at DESC,product_key DESC LIMIT 30 OFFSET $3",[search,filter,(productPage-1)*30]),
   db.query("SELECT t.*,u.email,u.full_name FROM store_transactions t JOIN users u ON u.id=t.user_id WHERE ($1='' OR u.email ILIKE $2 OR t.title ILIKE $2 OR t.transaction_id ILIKE $2) ORDER BY t.purchased_at DESC,t.id DESC LIMIT 30 OFFSET $3",[search,filter,(page-1)*30]),
   db.query("SELECT COUNT(*)::int AS total FROM store_transactions t JOIN users u ON u.id=t.user_id WHERE ($1='' OR u.email ILIKE $2 OR t.title ILIKE $2 OR t.transaction_id ILIKE $2)",[search,filter]),
   getCoursesCatalog(),listActiveCourseBundles(),
   db.query("SELECT event_type,status,COUNT(*)::int AS count FROM store_webhook_events GROUP BY event_type,status"),
   db.query("SELECT COUNT(*)::int AS total FROM store_products WHERE ($1='' OR title ILIKE $2 OR product_key ILIKE $2)",[search,filter]),
  ]);
  let configured=true;try{revenuecatConfig();}catch{configured=false;}
  return Response.json({ok:true,configured,productPagination:{page:productPage,pageSize:30,total:productTotal.rows[0].total},products:products.rows,transactions:transactions.rows,events:events.rows,pagination:{page,pageSize:30,total:total.rows[0].total},courses:courses.filter(c=>c.availableForPurchase).map(c=>({slug:c.slug,title:c.title})),bundles:bundles.map(b=>({slug:b.slug,title:b.title}))},{headers:mobileNoStoreHeaders});
 }catch(error){return errorResponse(error);}
}
export async function POST(request:Request){
 let client;
 try {
  const user=await guard(request,true);const body=await readBoundedJsonObject(request,8192);const db=getPool();
  if(body.action==="sync") {
   const id=Number(body.userId);if(!Number.isSafeInteger(id)||id<1)throw new StoreError("INVALID_USER","رقم الطالب غير صالح.");
   const student=(await db.query("SELECT id,email FROM users WHERE id=$1 AND status='active'",[id])).rows[0];if(!student)throw new StoreError("NOT_FOUND","الطالب غير موجود.",404);
   const result=await syncStorePurchases(student);
   await db.query("INSERT INTO audit_logs(actor_email,action,entity_type,entity_id,after_json,created_at) VALUES($1,'admin-store-sync','user',$2,$3,$4)",[user.email,String(id),JSON.stringify(result),new Date().toISOString()]);
   return Response.json({ok:true,...result},{headers:mobileNoStoreHeaders});
  }
  const key=typeof body.productKey==="string"?body.productKey.trim():"";
  if(!/^[a-zA-Z0-9._-]{3,100}$/.test(key))throw new StoreError("INVALID_PRODUCT","معرف المنتج غير صالح.");
  const now=new Date().toISOString();
  client=await db.connect();await client.query("BEGIN");
  if(body.action==="status"){
   if(!["draft","active","archived"].includes(String(body.status)))throw new StoreError("INVALID_STATUS","الحالة غير صالحة.");
   const before=(await client.query("SELECT * FROM store_products WHERE product_key=$1 FOR UPDATE",[key])).rows[0];
   if(!before)throw new StoreError("NOT_FOUND","المنتج غير موجود.",404);
   if(before.updated_at!==body.expectedUpdatedAt)throw new StoreError("CONFLICT","عدّل شخص آخر المنتج. حدّث القائمة.",409);
   await client.query("UPDATE store_products SET status=$2,updated_at=$3 WHERE product_key=$1",[key,body.status,now]);
  }else if(body.action==="create"){
   const identifier=(value:unknown)=>typeof value==="string"&&/^[a-zA-Z0-9._:-]{3,255}$/.test(value.trim())?value.trim():null;
   const ios=identifier(body.iosProductId),android=identifier(body.androidProductId);
   if(!ios&&!android)throw new StoreError("INVALID_PRODUCT","أدخل معرف المتجر لمنتج واحد على الأقل.");
   const kind=String(body.kind),slug=typeof body.targetSlug==="string"?body.targetSlug:"";
   let title="",slugs:string[]=[];
   if(kind==="ai"){title="أدوات مراس · ٣٠ يومًا";}
   else if(kind==="course"){const course=(await getCoursesCatalog()).find(c=>c.slug===slug&&c.availableForPurchase);if(!course)throw new StoreError("INVALID_COURSE","اختر مادة منشورة ومتاحة.");title=course.title;slugs=[slug];}
   else if(kind==="bundle"){const bundle=(await listActiveCourseBundles()).find(b=>b.slug===slug);if(!bundle)throw new StoreError("INVALID_BUNDLE","اختر باقة منشورة ومتاحة.");title=bundle.title;slugs=bundle.courseSlugs;}
   else throw new StoreError("INVALID_KIND","نوع المنتج غير صالح.");
   const days=kind==="ai"?30:body.durationDays===null?null:Number(body.durationDays);
   if(days!==null&&(!Number.isInteger(days)||days<1||days>3650))throw new StoreError("INVALID_DURATION","اختر وصولًا دائمًا أو مدة من يوم إلى ٣٦٥٠ يومًا.");
   await client.query("INSERT INTO store_products(product_key,ios_product_id,android_product_id,kind,target_slug,title,course_slugs_json,duration_days,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9,$9)",[key,ios,android,kind,kind==="ai"?null:slug,title,JSON.stringify(slugs),days,now]);
  }else throw new StoreError("INVALID_ACTION","الإجراء غير صالح.");
  await client.query("INSERT INTO audit_logs(actor_email,action,entity_type,entity_id,after_json,created_at) VALUES($1,$2,'store_product',$3,$4,$5)",[user.email,"store-product-"+body.action,key,JSON.stringify({status:body.status||"draft"}),now]);
  await client.query("COMMIT");return Response.json({ok:true},{headers:mobileNoStoreHeaders});
 }catch(error){if(client)await client.query("ROLLBACK");if(error&&typeof error==="object"&&"code" in error&&error.code==="23505")return errorResponse(new StoreError("CONFLICT","معرف المنتج مستخدم. أنشئ معرفًا مختلفًا.",409));return errorResponse(error);}finally{client?.release();}
}