import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { notificationsDb } from "@/db/schema";
import { sendPushNotification, type PushDeliveryResult } from "@/lib/push";

type NotificationValues = Omit<
  typeof notificationsDb.$inferInsert,
  "id" | "pushEnabled" | "pushStatus" | "pushAttempts" | "pushLastError" | "pushDeliveredAt"
>;

type PushTarget = Parameters<typeof sendPushNotification>[0];
type PushData = Parameters<typeof sendPushNotification>[3];

export type ImmediateNotificationResult = PushDeliveryResult & {
  notificationId: number | null;
  saved: boolean;
  persistenceError: string | null;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Notification persistence failed";
}

function emptyDelivery(error?: unknown): PushDeliveryResult {
  return {
    attempted: 0,
    accepted: 0,
    rejected: 0,
    invalidated: 0,
    providerErrors: error ? [errorMessage(error)] : [],
  };
}

/**
 * Persists an immediate notification as `processing` before contacting Expo.
 * The background campaign dispatcher only claims pending/failed rows, so it
 * cannot race the immediate delivery and send the same notification twice.
 * Notification failures never roll back the business operation that triggered
 * them; failed pushes remain eligible for the bounded background retry.
 */
export async function createAndSendNotification({
  values,
  target,
  data = {},
}: {
  values: NotificationValues;
  target: PushTarget;
  data?: PushData;
}): Promise<ImmediateNotificationResult> {
  const explicitId = Object.prototype.hasOwnProperty.call(values, "targetUserId");
  const targetId = Object.prototype.hasOwnProperty.call(target, "userId");
  if ((explicitId && (!Number.isSafeInteger(values.targetUserId) || !values.targetUserId || values.targetUserId < 1))
    || (targetId && (!explicitId || target.userId !== values.targetUserId))
    || (!explicitId && typeof target.userEmail === "string" && target.userEmail.trim().toLowerCase() !== values.userEmail?.trim().toLowerCase())) {
    return { notificationId: null, saved: false, persistenceError: "NOTIFICATION_RECIPIENT_UNRESOLVED", ...emptyDelivery() };
  }
  const db = getDb();
  let persistedTarget: PushTarget | null = null;
  let notificationId: number | null = null;
  let persistenceError: string | null = null;

  try {
    const [created] = await db.insert(notificationsDb).values({
      ...values,
      pushEnabled: true,
      pushStatus: "processing",
      pushAttempts: 0,
      pushClaimedAt: new Date().toISOString(),
      pushLastError: null,
      pushDeliveredAt: null,
    }).returning({ id: notificationsDb.id, targetUserId: notificationsDb.targetUserId, userEmail: notificationsDb.userEmail, audience: notificationsDb.audience });
    notificationId = created?.id ?? null;
    if (created) persistedTarget = created.targetUserId != null
      ? { userId: created.targetUserId }
      : created.userEmail != null ? { userId: null } : { audience: created.audience };
  } catch (error) {
    persistenceError = errorMessage(error);
  }

  // Deliver only the recorded recipient, never a historical email resolved anew.
  // Without a durable row there is no safe campaign identity or retry boundary.
  if (!notificationId || !persistedTarget) return { notificationId, saved: false, persistenceError: persistenceError || "NOTIFICATION_NOT_SAVED", ...emptyDelivery() };
  let delivery = emptyDelivery();
  try {
    delivery = await sendPushNotification(
      persistedTarget,
      values.title,
      values.body,
      notificationId ? { ...data, notificationId } : data,
    );
  } catch (error) {
    delivery = emptyDelivery(error);
  }

  if (notificationId) {
    const pushStatus = delivery.accepted > 0
      ? "accepted"
      : delivery.attempted === 0 && delivery.providerErrors.length === 0
        ? "no_devices"
        : "failed";
    try {
      await db.update(notificationsDb).set({
        pushStatus,
        pushAttempts: 1,
        pushLastError: delivery.providerErrors.join(" | ").slice(0, 1000) || null,
        pushDeliveredAt: delivery.accepted > 0 ? new Date().toISOString() : null,
      }).where(eq(notificationsDb.id, notificationId));
    } catch (error) {
      persistenceError = persistenceError || errorMessage(error);
    }
  }

  return {
    notificationId,
    saved: notificationId !== null,
    persistenceError,
    ...delivery,
  };
}
