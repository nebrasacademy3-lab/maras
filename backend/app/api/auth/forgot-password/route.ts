import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { checkRateLimit, clientIp, createOpaqueToken, hashOpaqueToken, sameOriginRequest, validEmail } from "@/lib/auth";
import { cleanText, jsonError, requestOrigin } from "@/lib/api";

export async function POST(request:Request){
  if(!sameOriginRequest(request))return jsonError("تعذر التحقق من مصدر الطلب",403);let payload:Record<string,unknown>;try{payload=await request.json() as Record<string,unknown>;}catch{return jsonError("بيانات غير صالحة");}
  const email=cleanText(payload.email,180).toLowerCase();if(!validEmail(email))return jsonError("أدخل بريدًا صالحًا");const limiter=`${clientIp(request)}:${email}`;if(!await checkRateLimit("forgot-password",limiter,5,60*60))return jsonError("محاولات كثيرة. حاول لاحقًا.",429);
  const db=getDb();const[user]=await db.select().from(users).where(and(eq(users.email,email),eq(users.status,"active"))).limit(1);
  if(user){const token=createOpaqueToken();const now=Date.now();await db.insert(passwordResetTokens).values({userId:user.id,tokenHash:await hashOpaqueToken(token),expiresAt:new Date(now+15*60*1000).toISOString(),createdAt:new Date(now).toISOString()});const apiKey=process.env.RESEND_API_KEY?.trim();const from=process.env.EMAIL_FROM?.trim();if(apiKey&&from){const origin=(process.env.APP_URL||requestOrigin(request)).replace(/\/$/,"");const link=`${origin}/reset-password?token=${encodeURIComponent(token)}`;await fetch("https://api.resend.com/emails",{method:"POST",headers:{authorization:`Bearer ${apiKey}`,"content-type":"application/json","idempotency-key":`reset-${user.id}-${now}`},body:JSON.stringify({from,to:[email],subject:"استعادة كلمة مرور مراس العلم",text:`مرحبًا ${user.fullName}،\n\nاستخدم الرابط التالي لتعيين كلمة مرور جديدة خلال 15 دقيقة:\n${link}\n\nإذا لم تطلب الاستعادة فتجاهل الرسالة.`})}).catch(()=>undefined);}}
  return Response.json({ok:true,message:"إذا كان البريد مسجلًا فستصلك رسالة الاستعادة."});
}
