import { and, eq, isNull, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { authDevices, authSessions, auditLogs, pushDevices } from "@/db/schema";
import { deviceActionPolicy, deviceReturnDecision, type DeviceCommand } from "@/lib/device-access-policy";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export const STUDENT_DEVICE_LIMIT = 2;
export class DeviceLimitError extends Error {
  readonly limit = STUDENT_DEVICE_LIMIT;
  readonly code: string;
  readonly status: number;
  readonly userMessage: string;
  constructor(reason: "limit" | "blocked" | "approval" | "temporary" = "limit") {
    super(reason === "limit" ? "DEVICE_LIMIT:2" : `DEVICE_${reason.toUpperCase()}`);
    this.name = "DeviceLimitError";
    this.code = { limit: "DEVICE_LIMIT_REACHED", blocked: "DEVICE_RETURN_BLOCKED", approval: "DEVICE_APPROVAL_REQUIRED", temporary: "DEVICE_TEMPORARILY_BLOCKED" }[reason];
    this.status = reason === "temporary" ? 423 : reason === "limit" ? 409 : 403;
    this.userMessage = {
      limit: "اكتمل عدد الأجهزة المعتمدة. تسجيل الخروج لا يحرر اعتماد جهاز؛ راجع الأجهزة أو تواصل مع الدعم.",
      blocked: "سُحب اعتماد هذا الجهاز ومنعت عودته. اطلب من الإدارة مراجعة السماح له بدل إنشاء حساب جديد.",
      approval: "عودة هذا الجهاز تحتاج موافقة الإدارة. لا تعيد محاولة الرموز لتجاوز الموافقة.",
      temporary: "هذا الجهاز محظور مؤقتًا. انتظر انتهاء المدة أو اطلب مراجعة الحالة من الدعم.",
    }[reason];
  }
}
export class DeviceManagementError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "DEVICE_ACTION_INVALID") { super(message); this.name = "DeviceManagementError"; }
}

// createSession holds the account advisory lock across MFA, enrollment and session insertion.
export async function enrollStudentDeviceTx(tx: Tx, userId: number, device: { deviceId: string; deviceLabel: string; platform: string }, now: string) {
  const [known] = await tx.select().from(authDevices).where(and(eq(authDevices.userId, userId), eq(authDevices.deviceId, device.deviceId))).limit(1);
  const state = known ? deviceReturnDecision(known, Date.parse(now)) : null;
  if (state === "blocked" || state === "approval" || state === "temporary") throw new DeviceLimitError(state);
  if (known && !known.revokedAt) {
    await tx.update(authDevices).set({ lastSeenAt: now, deviceLabel: device.deviceLabel }).where(eq(authDevices.id, known.id));
    return known.id;
  }
  const enrolled = await tx.select({ id: authDevices.id }).from(authDevices).where(and(eq(authDevices.userId, userId), isNull(authDevices.revokedAt))).limit(STUDENT_DEVICE_LIMIT);
  if (enrolled.length >= STUDENT_DEVICE_LIMIT) throw new DeviceLimitError();
  if (known) {
    // Only the device enrollment changes. No old session or push token is restored.
    const restored = await tx.update(authDevices).set({ revokedAt: null, revokedBy: null, revocationReason: null, returnPolicy: "blocked", blockedUntil: null, policyVersion: sql`${authDevices.policyVersion} + 1`, lastSeenAt: now, deviceLabel: device.deviceLabel, platform: device.platform }).where(and(eq(authDevices.id, known.id), eq(authDevices.userId, userId))).returning({ id: authDevices.id });
    if (!restored.length) throw new DeviceManagementError("تغير سجل الجهاز. أعد تسجيل الدخول.", 409, "DEVICE_CONFLICT");
    await tx.insert(auditLogs).values({ actorEmail: "system:authenticated-device-return", action: "device.readmitted", entityType: "auth_device", entityId: String(known.id), beforeJson: JSON.stringify({ userId, revokedAt: known.revokedAt, revokedBy: known.revokedBy, reason: known.revocationReason, returnPolicy: known.returnPolicy, blockedUntil: known.blockedUntil }), afterJson: JSON.stringify({ userId, approvedAt: now, previousSessionsRestored: false }), createdAt: now });
    return known.id;
  }
  const [created] = await tx.insert(authDevices).values({ userId, deviceId: device.deviceId, deviceLabel: device.deviceLabel, platform: device.platform, firstSeenAt: now, lastSeenAt: now }).returning({ id: authDevices.id });
  return created.id;
}

export async function manageRegisteredDeviceTx(tx: Tx, input: DeviceCommand & { userId: number; actorEmail: string; ipAddress: string; now: string }) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${input.userId})`);
  const [device] = await tx.select().from(authDevices).where(and(eq(authDevices.id, input.deviceId), eq(authDevices.userId, input.userId))).for("update");
  if (!device) return { found: false, changed: false, sessionsRevoked: 0 };
  const version = device.policyVersion || 0;
  if (input.expectedRevision !== undefined && input.expectedRevision !== version) throw new DeviceManagementError("تغير الجهاز أثناء عملك. حدّث القائمة وراجع الحالة قبل إعادة الإجراء.", 409, "DEVICE_CONFLICT");
  // Preserve idempotence for older app versions. A repeated DELETE must not overwrite a newer return permission.
  if (input.expectedRevision === undefined && device.revokedAt && input.action === "revoke_block") return { found: true, changed: false, sessionsRevoked: 0 };
  if (input.action === "allow_return" && !device.revokedAt) throw new DeviceManagementError("الجهاز معتمد بالفعل؛ لا يحتاج رفع منع.");
  const policy = deviceActionPolicy(input, Date.parse(input.now));
  const sessions = await tx.update(authSessions).set({ revokedAt: input.now }).where(and(eq(authSessions.userId, input.userId), eq(authSessions.deviceId, device.deviceId), isNull(authSessions.revokedAt))).returning({ id: authSessions.id });
  await tx.update(pushDevices).set({ status: "revoked", lastSeenAt: input.now }).where(and(eq(pushDevices.userId, input.userId), eq(pushDevices.deviceId, device.deviceId)));
  await tx.update(authDevices).set({ policyVersion: version + 1, ...(policy ? { ...policy, revokedAt: device.revokedAt || input.now, revokedBy: input.actorEmail, revocationReason: input.reason } : {}) }).where(and(eq(authDevices.id, device.id), eq(authDevices.userId, input.userId)));
  await tx.insert(auditLogs).values({ actorEmail: input.actorEmail, action: input.action === "revoke_block" ? "revoke_registered_device" : `device.${input.action}`, entityType: "auth_device", entityId: String(device.id), beforeJson: JSON.stringify({ userId: input.userId, revokedAt: device.revokedAt, returnPolicy: device.returnPolicy || "blocked", blockedUntil: device.blockedUntil, revision: version }), afterJson: JSON.stringify({ userId: input.userId, reason: input.reason, returnPolicy: policy?.returnPolicy || device.returnPolicy || "blocked", blockedUntil: policy?.blockedUntil || null, revision: version + 1, enrollmentRestored: false, sessionsRevoked: sessions.length }), ipAddress: input.ipAddress, createdAt: input.now });
  return { found: true, changed: true, sessionsRevoked: sessions.length };
}

/** Compatibility for existing callers; omitted policy keeps revoked legacy devices blocked. */
export async function revokeRegisteredDeviceTx(tx: Tx, input: { userId: number; deviceId: number; actorEmail: string; reason: string; ipAddress: string; now: string }) {
  return manageRegisteredDeviceTx(tx, { ...input, action: "revoke_block" });
}
