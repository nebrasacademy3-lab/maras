import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { authSessions, pushDevices } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, hashOpaqueToken, requestSessionToken, sameOriginRequest } from "@/lib/auth";
import { isNativeAppRequest } from "@/lib/mobile-api";

async function currentSessionHash(request: Request) {
  const token = requestSessionToken(request);
  return token ? await hashOpaqueToken(token) : "";
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول أولًا", 401);
  const now = new Date().toISOString();
  const currentHash = await currentSessionHash(request);
  const rows = await getDb().select({ id: authSessions.id, deviceId: authSessions.deviceId, deviceLabel: authSessions.deviceLabel, platform: authSessions.platform, ipAddress: authSessions.ipAddress, lastSeenAt: authSessions.lastSeenAt, createdAt: authSessions.createdAt, expiresAt: authSessions.expiresAt, tokenHash: authSessions.tokenHash })
    .from(authSessions).where(and(eq(authSessions.userId, user.id), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, now))).orderBy(desc(authSessions.lastSeenAt)).limit(50);
  return Response.json({
    ok: true,
    sessions: rows.map((row) => ({ id: row.id, deviceLabel: row.deviceLabel, platform: row.platform, ipAddress: row.ipAddress, lastSeenAt: row.lastSeenAt, createdAt: row.createdAt, expiresAt: row.expiresAt, current: Boolean(currentHash && row.tokenHash === currentHash) })),
  }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request) {
  if (!sameOriginRequest(request) && !isNativeAppRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول أولًا", 401);
  if (!await checkRateLimit("revoke-own-session", `user:${user.id}`, 20, 60)) return jsonError("محاولات كثيرة. حاول بعد قليل.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات غير صالحة"); }
  const id = Math.floor(Number(payload.id));
  if (!id) return jsonError("معرّف الجلسة غير صالح");
  const currentHash = await currentSessionHash(request);
  const db = getDb();
  const [target] = await db.select({ id: authSessions.id, deviceId: authSessions.deviceId, tokenHash: authSessions.tokenHash, revokedAt: authSessions.revokedAt }).from(authSessions).where(and(eq(authSessions.id, id), eq(authSessions.userId, user.id))).limit(1);
  if (!target) return jsonError("الجلسة غير موجودة", 404);
  if (currentHash && target.tokenHash === currentHash) return jsonError("استخدم تسجيل الخروج لإنهاء جلسة هذا الجهاز", 409);
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx.update(authSessions).set({ revokedAt: now }).where(eq(authSessions.id, id));
    if (target.deviceId) await tx.update(pushDevices).set({ status: "revoked", lastSeenAt: now }).where(and(eq(pushDevices.userId, user.id), eq(pushDevices.deviceId, target.deviceId)));
  });
  return Response.json({ ok: true, revokedAt: now }, { headers: { "cache-control": "no-store" } });
}
