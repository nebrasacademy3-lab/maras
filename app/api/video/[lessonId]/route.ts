import { authorizeVideoRequest } from "@/lib/video-access";
import { jsonError, cleanText } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = {params:Promise<{lessonId:string}>};
export async function GET(request:Request, context:Context) {
  const url=new URL(request.url),id=cleanText((await context.params).lessonId,120);
  const authorization=await authorizeVideoRequest(request,id,cleanText(url.searchParams.get("course"),120),cleanText(url.searchParams.get("token"),4096));
  if(!authorization.ok)return authorization.response;
  return jsonError("الملف الأصلي غير متاح للتنزيل. استخدم البث المشفّر داخل مشغل مراس.",403);
}
export async function HEAD(request:Request,context:Context){const response=await GET(request,context);await response.body?.cancel();return new Response(null,{status:response.status,headers:response.headers});}
