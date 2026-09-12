import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { adminControlGuard } from "@/lib/admin-control-guard";
import { jsonError } from "@/lib/api";
import { validEmail } from "@/lib/auth";
import { escapedLike } from "@/lib/course-audience-contract";
export const dynamic="force-dynamic";
// Identifiers come ONLY from this server-owned allowlist, never from the request.
const SOURCES = {
 subscriptions:{table:"course_access",owner:"user_email",label:"course_slug",status:"source",date:"updated_at",course:true},
 entitlements:{table:"ai_entitlements",owner:"user_id",label:"source",status:"status",date:"created_at"},
 waitlist:{table:"course_waitlist",owner:"user_email",label:"course_slug",status:"status",date:"created_at",course:true},
 tracks:{table:"learning_track_interests",owner:"user_id",label:"track_id",status:"status",date:"created_at",track:true},
 favorites:{table:"favorites",owner:"user_email",label:"course_slug",date:"created_at",course:true},
 cart:{table:"cart_items",owner:"user_email",label:"course_slug",date:"created_at",course:true},
 support:{table:"support_tickets",owner:"user_email",label:"title",status:"status",date:"created_at",number:"ticket_number"},
 requests:{table:"course_requests",owner:"user_id",label:"course_name",status:"status",date:"created_at"},
 notifications:{table:"notifications",owner:"user_email",label:"title",status:"push_status",date:"created_at"},
 sessions:{table:"auth_sessions",owner:"user_id",label:"device_label",date:"created_at",session:true},
 pushDevices:{table:"push_devices",owner:"user_id",label:"device_label",status:"status",date:"created_at"},
} satisfies Record<string,{table:string;owner:string;label:string;status?:string;date:string;course?:boolean;track?:boolean;number?:string;session?:boolean}>;
export async function GET(request:Request,{params}:{params:Promise<{email:string}>}) {
 const guard=await adminControlGuard(request);if(guard.response)return guard.response;
 const email=(await params).email.trim().toLowerCase();if(!validEmail(email))return jsonError("البريد غير صالح");
 const query=new URL(request.url).searchParams;const kind=query.get("kind")||"";
 if(!Object.prototype.hasOwnProperty.call(SOURCES,kind))return jsonError("نوع السجل غير مدعوم");
 const config:SOURCESValue=SOURCES[kind as keyof typeof SOURCES];
 const search=(query.get("q")||"").trim().slice(0,160);const requested=Number(query.get("page")||1);const requestedPage=Number.isSafeInteger(requested)&&requested>0?Math.min(requested,100000):1;const pageSize=100;
 try {
  const db=getDb();const [student]=await db.select({id:users.id,role:users.role}).from(users).where(eq(users.email,email)).limit(1);if(!student||student.role!=="student")return jsonError("الطالب غير موجود",404);
  const column=(name:string)=>sql`${sql.identifier(config.table)}.${sql.identifier(name)}`;
  const id=column("id");let title=sql`coalesce(${column(config.label)}::text,'سجل')`;
  if(config.course)title=sql`coalesce((SELECT title FROM catalog_courses WHERE slug=${column("course_slug")}),${column("course_slug")})`;
  if(config.track)title=sql`coalesce((SELECT title FROM learning_tracks WHERE id=${column("track_id")}),${column("track_id")}::text)`;
  if(config.number)title=sql`${column(config.number)} || ' · ' || ${title}`;
  const status=config.status?column(config.status):config.session?sql`CASE WHEN ${column("revoked_at")} IS NOT NULL THEN 'revoked' WHEN ${column("expires_at")}::timestamptz<=now() THEN 'expired' ELSE 'active' END`:sql`'saved'`;
  const owner=config.owner==="user_id"?student.id:email;
  const filter=sql`${column(config.owner)} = ${owner} ${search?sql`AND (${title} ILIKE ${escapedLike(search)} OR ${id}::text ILIKE ${escapedLike(search)})`:sql``}`;
  return await db.transaction(async tx=>{
   const counted=await tx.execute<{total:string}>(sql`SELECT count(*)::text AS total FROM ${sql.identifier(config.table)} WHERE ${filter}`);
   const total=Number(counted.rows[0]?.total||0);const totalPages=Math.max(1,Math.ceil(total/pageSize));const page=Math.min(requestedPage,totalPages);
   const records=await tx.execute<{id:number;title:string;status:string;createdAt:string}>(sql`SELECT ${id} AS id, ${title} AS title, ${status} AS status, ${column(config.date)} AS "createdAt" FROM ${sql.identifier(config.table)} WHERE ${filter} ORDER BY ${id} DESC LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`);
   return Response.json({ok:true,kind,total,page,pageSize,totalPages,items:records.rows.map(row=>({value:String(row.id),label:`${row.title} · #${row.id}`,status:row.status,createdAt:row.createdAt}))},{headers:{"cache-control":"private, no-store","x-content-type-options":"nosniff"}});
  },{isolationLevel:"repeatable read",readOnly:true});
 }catch{return jsonError("تعذر البحث في سجلات الطالب",503);}
}
type SOURCESValue={table:string;owner:string;label:string;status?:string;date:string;course?:boolean;track?:boolean;number?:string;session?:boolean};
