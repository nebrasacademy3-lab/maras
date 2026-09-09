import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { authDevices, users } from "@/db/schema";
import { cleanText, finiteNumber, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { AdminMfaError, requireAdminStepUp } from "@/lib/admin-mfa";
import { revokeRegisteredDeviceTx, STUDENT_DEVICE_LIMIT } from "@/lib/auth-devices";
import { isNativeAppRequest } from "@/lib/mobile-api";
import { readBoundedJsonObject } from "@/lib/request-body";

type Context = { params: Promise<{ email: string }> };
async function authorize(request: Request, mutation: boolean) {
  const admin = await getSessionUser(request);
  if (!admin || admin.role !== "admin") return { error: jsonError("غير مصرح بإدارة أجهزة الطالب", 403), admin: null };
  if (mutation && !sameOriginRequest(request) && !isNativeAppRequest(request)) return { error: jsonError("تعذر التحقق من مصدر الطلب", 403), admin: null };
  if (!await checkRateLimit(mutation ? "admin-device-replace" : "admin-devices", String(admin.id), mutation ? 20 : 90, 60)) return { error: jsonError("محاولات كثيرة. حاول بعد دقيقة.", 429), admin: null };
  if (mutation) {
    try { await requireAdminStepUp(request, admin); }
    catch (error) { return { error: error instanceof AdminMfaError ? jsonError(error.message, error.status, error.code) : jsonError("مطلوب تحقق إداري إضافي", 403), admin: null }; }
  }
  return { error: null, admin };
}
async function studentFor(context: Context) {
  const email = cleanText((await context.params).email, 180).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return null;
  const [student] = await getDb().select({ id: users.id }).from(users).where(and(eq(users.email, email), eq(users.role, "student"))).limit(1);
  return student || null;
}
export async function GET(request: Request, context: Context) {
  const auth = await authorize(request, false); if (auth.error) return auth.error;
  const student = await studentFor(context); if (!student) return jsonError("الطالب غير موجود", 404);
  const registeredDevices = await getDb().select({ id: authDevices.id, deviceLabel: authDevices.deviceLabel, platform: authDevices.platform, firstSeenAt: authDevices.firstSeenAt, lastSeenAt: authDevices.lastSeenAt, revokedAt: authDevices.revokedAt, revokedBy: authDevices.revokedBy, revocationReason: authDevices.revocationReason }).from(authDevices).where(eq(authDevices.userId, student.id)).orderBy(asc(authDevices.firstSeenAt));
  return Response.json({ registeredDevices, deviceLimit: STUDENT_DEVICE_LIMIT }, { headers: { "cache-control": "private, no-store" } });
}
export async function DELETE(request: Request, context: Context) {
  const auth = await authorize(request, true); if (auth.error) return auth.error;
  let body: Record<string, unknown>; try { body = await readBoundedJsonObject(request, 8192); } catch { return jsonError("بيانات غير صالحة"); }
  const deviceId = finiteNumber(body.deviceId); const reason = cleanText(body.reason, 600);
  if (!Number.isSafeInteger(deviceId) || deviceId < 1 || reason.length < 4) return jsonError("اختر جهازًا واكتب سبب الاستبدال بوضوح");
  const student = await studentFor(context); if (!student) return jsonError("الطالب غير موجود", 404);
  const result = await getDb().transaction(tx => revokeRegisteredDeviceTx(tx, { userId: student.id, deviceId, reason, actorEmail: auth.admin!.email, ipAddress: clientIp(request), now: new Date().toISOString() }));
  if (!result.found) return jsonError("الجهاز غير موجود في حساب الطالب", 404);
  return Response.json({ ok: true, changed: result.changed, deviceLimit: STUDENT_DEVICE_LIMIT }, { headers: { "cache-control": "no-store" } });
}
