import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { authSessions, passwordResetTokens, users } from "@/db/schema";
import { checkRateLimit, clientIp, hashOpaqueToken, hashPassword, sameOriginRequest, validPassword } from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";

export async function POST(request:Request){
  if(!sameOriginRequest(request))return jsonError("تعذر التحقق من مصدر الطلب",403);if(!await checkRateLimit("reset-password",clientIp(request),8,60*60))return jsonError("محاولات كثيرة. حاول لاحقًا.",429);let payload:Record<string,unknown>;try{payload=await request.json() as Record<string,unknown>;}catch{return jsonError("بيانات غير صالحة");}
  const token=cleanText(payload.token,300);const password=typeof payload.password==="string"?payload.password:"";if(token.length<32)return jsonError("رابط الاستعادة غير صالح أو منتهي",400);if(!validPassword(password))return jsonError("كلمة المرور يجب أن تكون 10 أحرف مع رقم ورمز خاص");const db=getDb();const now=new Date().toISOString();const[row]=await db.select().from(passwordResetTokens).where(and(eq(passwordResetTokens.tokenHash,await hashOpaqueToken(token)),isNull(passwordResetTokens.usedAt),gt(passwordResetTokens.expiresAt,now))).limit(1);if(!row)return jsonError("رابط الاستعادة غير صالح أو منتهي",400);
  await db.update(users).set({passwordHash:await hashPassword(password),updatedAt:now}).where(eq(users.id,row.userId));await db.update(passwordResetTokens).set({usedAt:now}).where(eq(passwordResetTokens.id,row.id));await db.update(authSessions).set({revokedAt:now}).where(eq(authSessions.userId,row.userId));return Response.json({ok:true,next:"/login?reset=success"});
}
