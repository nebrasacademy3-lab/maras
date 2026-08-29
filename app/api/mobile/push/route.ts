import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pushDevices } from "@/db/schema";
import { checkRateLimit, clientIp, getSessionUser } from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";
import { isMobileRequest, mobileNoStoreHeaders } from "@/lib/mobile-api";

function validExpoToken(value: string) {
  return /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/.test(value);
}

export async function POST(request: Request) {
  if (!isMobileRequest(request)) return jsonError("طلب تطبيق غير صالح", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  if (!await checkRateLimit("push-device-write", `user:${user.id}:${clientIp(request)}`, 20, 60 * 60)) return jsonError("طلبات الأجهزة كثيرة. حاول لاحقًا.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات الجهاز غير صالحة"); }
  const token = cleanText(payload.token, 260);
  const platform = cleanText(payload.platform, 20);
  const deviceLabel = cleanText(payload.deviceLabel, 120) || null;
  if (!validExpoToken(token) || !["ios", "android"].includes(platform)) return jsonError("رمز الإشعارات أو النظام غير صالح");
  const now = new Date().toISOString();
  await getDb().insert(pushDevices).values({ userId: user.id, token, platform, deviceLabel, status: "active", lastSeenAt: now, createdAt: now }).onConflictDoUpdate({ target: pushDevices.token, set: { userId: user.id, platform, deviceLabel, status: "active", lastSeenAt: now } });
  return Response.json({ ok: true }, { headers: mobileNoStoreHeaders });
}

export async function DELETE(request: Request) {
  if (!isMobileRequest(request)) return jsonError("طلب تطبيق غير صالح", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  if (!await checkRateLimit("push-device-write", `user:${user.id}:${clientIp(request)}`, 20, 60 * 60)) return jsonError("طلبات الأجهزة كثيرة. حاول لاحقًا.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات الجهاز غير صالحة"); }
  const token = cleanText(payload.token, 260);
  if (!validExpoToken(token)) return jsonError("رمز الإشعارات غير صالح");
  await getDb().update(pushDevices).set({ status: "revoked", lastSeenAt: new Date().toISOString() }).where(and(eq(pushDevices.token, token), eq(pushDevices.userId, user.id)));
  return Response.json({ ok: true }, { headers: mobileNoStoreHeaders });
}
