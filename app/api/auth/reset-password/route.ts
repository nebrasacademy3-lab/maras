import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { authSessions, passwordResetTokens, users } from "@/db/schema";
import { checkRateLimit, clientIp, hashOpaqueToken, hashPassword, sameOriginRequest, validPassword } from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  if (!await checkRateLimit("reset-password", clientIp(request), 8, 60 * 60)) return jsonError("محاولات كثيرة. حاول لاحقًا.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات غير صالحة"); }

  const token = cleanText(payload.token, 300);
  const password = typeof payload.password === "string" ? payload.password : "";
  if (token.length < 32) return jsonError("رابط الاستعادة غير صالح أو منتهي", 400);
  if (!validPassword(password)) return jsonError("كلمة المرور يجب أن تكون 10 أحرف مع رقم ورمز خاص");

  const db = getDb();
  const now = new Date().toISOString();
  const tokenHash = await hashOpaqueToken(token);
  const passwordHash = await hashPassword(password);
  const changed = await db.transaction(async (tx) => {
    const [claimed] = await tx.update(passwordResetTokens).set({ usedAt: now }).where(and(
      eq(passwordResetTokens.tokenHash, tokenHash),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, now),
    )).returning({ userId: passwordResetTokens.userId });
    if (!claimed) return false;
    await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, claimed.userId));
    await tx.update(authSessions).set({ revokedAt: now }).where(eq(authSessions.userId, claimed.userId));
    return true;
  });
  if (!changed) return jsonError("رابط الاستعادة غير صالح أو منتهي", 400);
  return Response.json({ ok: true, next: "/login?reset=success" }, { headers: { "cache-control": "no-store" } });
}
