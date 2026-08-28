import { and, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { notificationReads, notificationsDb } from "@/db/schema";
import type { SessionUser } from "@/lib/auth";

export function visibleNotificationFilter(user: Pick<SessionUser, "email" | "role">, now = new Date().toISOString()) {
  return and(
    or(
      eq(notificationsDb.userEmail, user.email),
      and(
        isNull(notificationsDb.userEmail),
        or(eq(notificationsDb.audience, user.role), eq(notificationsDb.audience, "public")),
      ),
    ),
    or(isNull(notificationsDb.startsAt), lte(notificationsDb.startsAt, now)),
    or(isNull(notificationsDb.expiresAt), gt(notificationsDb.expiresAt, now)),
  );
}

export async function getVisibleNotifications(user: SessionUser, limit = 100) {
  const safeLimit = Math.max(1, Math.min(250, Math.floor(limit)));
  const rows = await getDb().select({
    notification: notificationsDb,
    userReadAt: notificationReads.readAt,
  }).from(notificationsDb).leftJoin(notificationReads, and(
    eq(notificationReads.notificationId, notificationsDb.id),
    eq(notificationReads.userId, user.id),
  )).where(visibleNotificationFilter(user)).orderBy(desc(notificationsDb.createdAt)).limit(safeLimit);

  return rows.map(({ notification, userReadAt }) => ({
    ...notification,
    // The legacy column is only relevant to an old direct notification. Role
    // campaigns always use the per-user row above.
    readAt: userReadAt || (notification.userEmail ? notification.readAt : null),
  }));
}

export async function countUnreadVisibleNotifications(user: SessionUser) {
  const [row] = await getDb().select({ count: sql<number>`count(*)::int` }).from(notificationsDb).leftJoin(notificationReads, and(
    eq(notificationReads.notificationId, notificationsDb.id),
    eq(notificationReads.userId, user.id),
  )).where(and(
    visibleNotificationFilter(user),
    isNull(notificationReads.readAt),
    // Preserve migration compatibility for direct notifications that were read
    // before per-user read rows existed. Broadcasts never use the global column.
    or(isNull(notificationsDb.userEmail), isNull(notificationsDb.readAt)),
  ));
  return row?.count || 0;
}

export async function markVisibleNotificationsRead(user: SessionUser, input: { all?: boolean; id?: number }, readAt = new Date().toISOString()) {
  const db = getDb();
  const count = await db.transaction(async (tx) => {
    const rows = await tx.select({ id: notificationsDb.id }).from(notificationsDb).where(and(
      visibleNotificationFilter(user),
      input.all === true ? undefined : eq(notificationsDb.id, input.id || 0),
    ));
    // Keep each insert well below PostgreSQL's bind-parameter ceiling. Keeping
    // every chunk in this transaction prevents a half-applied mark-all.
    for (let offset = 0; offset < rows.length; offset += 500) {
      await tx.insert(notificationReads).values(rows.slice(offset, offset + 500).map((row) => ({ notificationId: row.id, userId: user.id, readAt }))).onConflictDoUpdate({
        target: [notificationReads.notificationId, notificationReads.userId],
        set: { readAt },
      });
    }
    return rows.length;
  });
  return { count, readAt };
}
