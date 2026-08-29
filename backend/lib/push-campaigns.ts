import { and, asc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import { notificationsDb } from "@/db/schema";
import { sendPushNotification, type PushDeliveryResult } from "@/lib/push";

export type CampaignDispatchResult = PushDeliveryResult & { campaigns: number };

export async function dispatchDuePushNotifications(limit = 50): Promise<CampaignDispatchResult> {
  const now = new Date().toISOString();
  const rows = await getDb().select({
    id: notificationsDb.id,
    userEmail: notificationsDb.userEmail,
    audience: notificationsDb.audience,
    title: notificationsDb.title,
    body: notificationsDb.body,
    actionUrl: notificationsDb.actionUrl,
  }).from(notificationsDb).where(and(
    eq(notificationsDb.pushEnabled, true),
    isNull(notificationsDb.pushDeliveredAt),
    or(isNull(notificationsDb.startsAt), lte(notificationsDb.startsAt, now)),
    or(isNull(notificationsDb.expiresAt), gt(notificationsDb.expiresAt, now)),
  )).orderBy(asc(notificationsDb.startsAt), asc(notificationsDb.createdAt)).limit(Math.max(1, Math.min(100, limit)));

  const summary: CampaignDispatchResult = { campaigns: 0, attempted: 0, accepted: 0, rejected: 0, invalidated: 0, providerErrors: [] };
  for (const row of rows) {
    const delivery = await sendPushNotification({ userEmail: row.userEmail, audience: row.audience }, row.title, row.body, { route: row.actionUrl || "/notifications", notificationId: row.id });
    await getDb().update(notificationsDb).set({ pushDeliveredAt: now }).where(and(eq(notificationsDb.id, row.id), isNull(notificationsDb.pushDeliveredAt)));
    summary.campaigns += 1;
    summary.attempted += delivery.attempted;
    summary.accepted += delivery.accepted;
    summary.rejected += delivery.rejected;
    summary.invalidated += delivery.invalidated;
    summary.providerErrors.push(...delivery.providerErrors);
  }
  summary.providerErrors = [...new Set(summary.providerErrors)].slice(0, 12);
  return summary;
}
