import { and, eq, isNull, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { authDevices, authSessions, auditLogs, pushDevices } from "@/db/schema";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export const STUDENT_DEVICE_LIMIT = 2;
export class DeviceLimitError extends Error {
  readonly limit = STUDENT_DEVICE_LIMIT;
  constructor() { super("DEVICE_LIMIT:2"); this.name = "DeviceLimitError"; }
}

// The caller holds the account advisory lock. Enrollment outlives every session.
export async function enrollStudentDeviceTx(tx: Tx, userId: number, device: { deviceId: string; deviceLabel: string; platform: string }, now: string) {
  const [known] = await tx.select().from(authDevices).where(and(eq(authDevices.userId, userId), eq(authDevices.deviceId, device.deviceId))).limit(1);
  if (known?.revokedAt) throw new DeviceLimitError();
  if (known) {
    await tx.update(authDevices).set({ lastSeenAt: now, deviceLabel: device.deviceLabel }).where(eq(authDevices.id, known.id));
    return known.id;
  }
  const enrolled = await tx.select({ id: authDevices.id }).from(authDevices).where(and(eq(authDevices.userId, userId), isNull(authDevices.revokedAt))).limit(STUDENT_DEVICE_LIMIT);
  if (enrolled.length >= STUDENT_DEVICE_LIMIT) throw new DeviceLimitError();
  const [created] = await tx.insert(authDevices).values({ userId, deviceId: device.deviceId, deviceLabel: device.deviceLabel, platform: device.platform, firstSeenAt: now, lastSeenAt: now }).returning({ id: authDevices.id });
  return created.id;
}

export async function revokeRegisteredDeviceTx(tx: Tx, input: { userId: number; deviceId: number; actorEmail: string; reason: string; ipAddress: string; now: string }) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${input.userId})`);
  const [device] = await tx.select().from(authDevices).where(and(eq(authDevices.id, input.deviceId), eq(authDevices.userId, input.userId))).limit(1);
  if (!device) return { found: false, changed: false };
  if (device.revokedAt) return { found: true, changed: false };
  await tx.update(authDevices).set({ revokedAt: input.now, revokedBy: input.actorEmail, revocationReason: input.reason }).where(eq(authDevices.id, device.id));
  await tx.update(authSessions).set({ revokedAt: input.now }).where(and(eq(authSessions.userId, input.userId), eq(authSessions.deviceId, device.deviceId), isNull(authSessions.revokedAt)));
  await tx.update(pushDevices).set({ status: "revoked", lastSeenAt: input.now }).where(and(eq(pushDevices.userId, input.userId), eq(pushDevices.deviceId, device.deviceId)));
  await tx.insert(auditLogs).values({ actorEmail: input.actorEmail, action: "revoke_registered_device", entityType: "auth_device", entityId: String(device.id), beforeJson: JSON.stringify({ userId: input.userId, revokedAt: null }), afterJson: JSON.stringify({ userId: input.userId, revokedAt: input.now, reason: input.reason }), ipAddress: input.ipAddress, createdAt: input.now });
  return { found: true, changed: true };
}
