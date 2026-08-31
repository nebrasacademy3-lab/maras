import { and, asc, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { notificationsDb } from "@/db/schema";
import { sendPushNotification, type PushDeliveryResult } from "@/lib/push";

export type CampaignDispatchResult = PushDeliveryResult & { campaigns: number };

const MAX_PUSH_ATTEMPTS = 3;
const PROCESSING_LEASE_MS = 30 * 60_000;
const RETRY_BACKOFF_MS = [0, 2 * 60_000, 10 * 60_000] as const;

type ClaimedNotification = {
  id: number;
  userEmail: string | null;
  audience: string;
  title: string;
  body: string;
  actionUrl: string | null;
  claimTime: string;
};

function emptyDelivery(error: unknown): PushDeliveryResult {
  return {
    attempted: 0,
    accepted: 0,
    rejected: 0,
    invalidated: 0,
    providerErrors: [error instanceof Error ? error.message : "Push delivery failed"],
  };
}

async function claimDuePushNotifications(limit: number, now: Date): Promise<ClaimedNotification[]> {
  const db = getDb();
  const claimTime = now.toISOString();
  const staleBefore = new Date(now.getTime() - PROCESSING_LEASE_MS).toISOString();
  const firstRetryBefore = new Date(now.getTime() - RETRY_BACKOFF_MS[1]).toISOString();
  const secondRetryBefore = new Date(now.getTime() - RETRY_BACKOFF_MS[2]).toISOString();

  return db.transaction(async (tx) => {
    // A worker that died after its final claim must not leave the row looking active forever.
    await tx.update(notificationsDb).set({
      pushStatus: "failed",
      pushLastError: "Push delivery lease expired after the final attempt",
    }).where(and(
      eq(notificationsDb.pushStatus, "processing"),
      gte(notificationsDb.pushAttempts, MAX_PUSH_ATTEMPTS),
      lte(notificationsDb.pushClaimedAt, staleBefore),
    ));

    const rows = await tx.select({
      id: notificationsDb.id,
      userEmail: notificationsDb.userEmail,
      audience: notificationsDb.audience,
      title: notificationsDb.title,
      body: notificationsDb.body,
      actionUrl: notificationsDb.actionUrl,
    }).from(notificationsDb).where(and(
      eq(notificationsDb.pushEnabled, true),
      lt(notificationsDb.pushAttempts, MAX_PUSH_ATTEMPTS),
      or(
        eq(notificationsDb.pushStatus, "pending"),
        and(
          eq(notificationsDb.pushStatus, "failed"),
          or(
            isNull(notificationsDb.pushClaimedAt),
            eq(notificationsDb.pushAttempts, 0),
            and(eq(notificationsDb.pushAttempts, 1), lte(notificationsDb.pushClaimedAt, firstRetryBefore)),
            and(eq(notificationsDb.pushAttempts, 2), lte(notificationsDb.pushClaimedAt, secondRetryBefore)),
          ),
        ),
        and(
          eq(notificationsDb.pushStatus, "processing"),
          lte(notificationsDb.pushClaimedAt, staleBefore),
        ),
      ),
      or(isNull(notificationsDb.startsAt), lte(notificationsDb.startsAt, claimTime)),
      or(isNull(notificationsDb.expiresAt), gt(notificationsDb.expiresAt, claimTime)),
    )).orderBy(asc(notificationsDb.startsAt), asc(notificationsDb.createdAt))
      .limit(limit)
      .for("update", { skipLocked: true });

    if (!rows.length) return [];

    await tx.update(notificationsDb).set({
      pushStatus: "processing",
      pushAttempts: sql`${notificationsDb.pushAttempts} + 1`,
      pushClaimedAt: claimTime,
      pushLastError: null,
    }).where(inArray(notificationsDb.id, rows.map((row) => row.id)));

    return rows.map((row) => ({ ...row, claimTime }));
  });
}

export async function dispatchDuePushNotifications(limit = 50): Promise<CampaignDispatchResult> {
  const rows = await claimDuePushNotifications(Math.max(1, Math.min(100, limit)), new Date());

  const summary: CampaignDispatchResult = { campaigns: 0, attempted: 0, accepted: 0, rejected: 0, invalidated: 0, providerErrors: [] };
  for (const row of rows) {
    let delivery: PushDeliveryResult;
    try {
      delivery = await sendPushNotification({ userEmail: row.userEmail, audience: row.audience }, row.title, row.body, { route: row.actionUrl || "/notifications", notificationId: row.id });
    } catch (error) {
      delivery = emptyDelivery(error);
    }
    const pushStatus = delivery.accepted > 0
      ? "accepted"
      : delivery.attempted === 0 && delivery.providerErrors.length === 0
        ? "no_devices"
        : "failed";
    const deliveredAt = delivery.accepted > 0 ? new Date().toISOString() : null;
    await getDb().update(notificationsDb).set({
      pushStatus,
      pushLastError: delivery.providerErrors.join(" | ").slice(0, 1000) || null,
      pushDeliveredAt: deliveredAt,
    }).where(and(
      eq(notificationsDb.id, row.id),
      eq(notificationsDb.pushStatus, "processing"),
      eq(notificationsDb.pushClaimedAt, row.claimTime),
    ));
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
