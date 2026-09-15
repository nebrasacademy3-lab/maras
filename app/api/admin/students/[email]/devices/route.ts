import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { authDevices, users } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { AdminMfaError, requireAdminStepUp } from "@/lib/admin-mfa";
import { DeviceManagementError, manageRegisteredDeviceTx, STUDENT_DEVICE_LIMIT } from "@/lib/auth-devices";
import { parseDeviceCommand } from "@/lib/device-access-policy";
import { isNativeAppRequest } from "@/lib/mobile-api";
import { readBoundedJsonObject, RequestBodyTooLargeError } from "@/lib/request-body";

export const dynamic = "force-dynamic";
const HEADERS = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
type Context = { params: Promise<{ email: string }> };
async function authorize(request: Request, mutation: boolean) {
  // getSessionUser checks the exact device permission for this route before returning staff.
  const admin = await getSessionUser(request);
  if (!admin || !["admin", "supervisor"].includes(admin.role)) return { error: jsonError("غير مصرح بإدارة أجهزة الطالب", 403), admin: null };
  const nativeBearer = isNativeAppRequest(request) && /^Bearer [A-Za-z0-9_-]+$/i.test(request.headers.get("authorization") || "") && !request.headers.get("cookie");
  if (mutation && !sameOriginRequest(request) && !nativeBearer) return { error: jsonError("تعذر التحقق من مصدر الطلب", 403), admin: null };
  if (!await checkRateLimit(mutation ? "admin-device-replace" : "admin-devices", String(admin.id), mutation ? 20 : 90, 60)) return { error: jsonError("محاولات كثيرة. حاول بعد دقيقة.", 429), admin: null };
  if (mutation) {
    try { await requireAdminStepUp(request, admin); }
    catch (error) { return { error: error instanceof AdminMfaError ? jsonError(error.message, error.status, error.code) : jsonError("تعذر التحقق الإداري الإضافي", 503), admin: null }; }
  }
  return { error: null, admin };
}
async function studentFor(context: Context) {
  const raw = (await context.params).email;
  let email: string;
  try { email = cleanText(decodeURIComponent(raw), 180).toLowerCase(); } catch { return null; }
  if (!/^\S+@\S+\.\S+$/.test(email)) return null;
  const [student] = await getDb().select({ id: users.id }).from(users).where(and(eq(users.email, email), eq(users.role, "student"))).limit(1);
  return student || null;
}
async function snapshot(userId: number) {
  const registeredDevices = await getDb().select({ id: authDevices.id, deviceLabel: authDevices.deviceLabel, platform: authDevices.platform, firstSeenAt: authDevices.firstSeenAt, lastSeenAt: authDevices.lastSeenAt, revokedAt: authDevices.revokedAt, revokedBy: authDevices.revokedBy, revocationReason: authDevices.revocationReason, returnPolicy: authDevices.returnPolicy, blockedUntil: authDevices.blockedUntil, policyVersion: authDevices.policyVersion }).from(authDevices).where(eq(authDevices.userId, userId)).orderBy(asc(authDevices.firstSeenAt)).limit(500);
  return { registeredDevices, deviceLimit: STUDENT_DEVICE_LIMIT, serverTime: new Date().toISOString(), historyMayBeTruncated: registeredDevices.length === 500 };
}
export async function GET(request: Request, context: Context) {
  const auth = await authorize(request, false); if (auth.error) return auth.error;
  const student = await studentFor(context); if (!student) return jsonError("الطالب غير موجود", 404);
  return Response.json(await snapshot(student.id), { headers: HEADERS });
}
async function mutate(request: Request, context: Context, legacyDelete: boolean) {
  const auth = await authorize(request, true); if (auth.error) return auth.error;
  try {
    const command = parseDeviceCommand(await readBoundedJsonObject(request, 8192), legacyDelete);
    const student = await studentFor(context); if (!student) return jsonError("الطالب غير موجود", 404);
    const result = await getDb().transaction(tx => manageRegisteredDeviceTx(tx, { ...command, userId: student.id, actorEmail: auth.admin!.email, ipAddress: clientIp(request), now: new Date().toISOString() }));
    if (!result.found) return jsonError("الجهاز غير موجود في حساب الطالب", 404);
    return Response.json({ ok: true, changed: result.changed, sessionsRevoked: result.sessionsRevoked, ...await snapshot(student.id) }, { headers: HEADERS });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return jsonError("بيانات الطلب أكبر من المسموح", 413);
    if (error instanceof TypeError || error instanceof SyntaxError) return jsonError(error.message, 400);
    if (error instanceof DeviceManagementError) return jsonError(error.message, error.status, error.code);
    return jsonError("تعذر تعديل سياسة الجهاز بأمان. حدّث الحالة قبل إعادة الطلب.", 500);
  }
}
export function POST(request: Request, context: Context) { return mutate(request, context, false); }
export function DELETE(request: Request, context: Context) { return mutate(request, context, true); }
