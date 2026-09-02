import { and, eq, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { authSessions, pushDevices, users } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, hashOpaqueToken, hashPassword, requestSessionToken, sameOriginRequest, validPassword, verifyPassword } from "@/lib/auth";
import { isNativeAppRequest } from "@/lib/mobile-api";

export async function POST(request: Request) {
  if (!sameOriginRequest(request) && !isNativeAppRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول أولًا", 401);
  if (!await checkRateLimit("change-password", `user:${user.id}`, 6, 15 * 60)) return jsonError("محاولات كثيرة. حاول بعد قليل.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات غير صالحة"); }
  const currentPassword = typeof payload.currentPassword === "string" ? payload.currentPassword : "";
  const newPassword = typeof payload.newPassword === "string" ? payload.newPassword : "";
  if (!currentPassword) return jsonError("أدخل كلمة المرور الحالية");
  if (!validPassword(newPassword)) return jsonError("كلمة المرور الجديدة يجب أن تكون 10 أحرف مع رقم ورمز خاص");
  if (newPassword === currentPassword) return jsonError("اختر كلمة مرور مختلفة عن الحالية");
  const db = getDb();
  const [row] = await db.select({ id: users.id, passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
  if (!row || !await verifyPassword(currentPassword, row.passwordHash)) return jsonError("كلمة المرور الحالية غير صحيحة", 401);
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(newPassword);
  const token = requestSessionToken(request);
  const currentTokenHash = token ? await hashOpaqueToken(token) : "";
  const revokedSessions = await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, user.id));
    const revoked = await tx.update(authSessions).set({ revokedAt: now }).where(and(eq(authSessions.userId, user.id), isNull(authSessions.revokedAt), currentTokenHash ? ne(authSessions.tokenHash, currentTokenHash) : undefined)).returning({ deviceId: authSessions.deviceId });
    for (const session of revoked) {
      if (session.deviceId) await tx.update(pushDevices).set({ status: "revoked", lastSeenAt: now }).where(and(eq(pushDevices.userId, user.id), eq(pushDevices.deviceId, session.deviceId)));
    }
    return revoked.length;
  });
  return Response.json({ ok: true, revokedSessions }, { headers: { "cache-control": "no-store" } });
}
