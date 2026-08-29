import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import { notificationsDb } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { normalizeInternalActionPath } from "@/lib/internal-action-route";
import { visibleNotificationFilter } from "@/lib/notifications";

export async function GET(request: Request) {
  const now = new Date().toISOString();
  const user = await getSessionUser(request).catch(() => null);
  const visibility = user
    ? visibleNotificationFilter(user, now)
    : and(
      eq(notificationsDb.audience, "public"),
      isNull(notificationsDb.userEmail),
      or(isNull(notificationsDb.startsAt), lte(notificationsDb.startsAt, now)),
      or(isNull(notificationsDb.expiresAt), gt(notificationsDb.expiresAt, now)),
    );
  const rows = await getDb().select({ id: notificationsDb.id, title: notificationsDb.title, body: notificationsDb.body, actionUrl: notificationsDb.actionUrl, actionLabel: notificationsDb.actionLabel, presentation: notificationsDb.presentation, dismissible: notificationsDb.dismissible, createdAt: notificationsDb.createdAt })
    .from(notificationsDb)
    .where(and(visibility, or(eq(notificationsDb.presentation, "banner"), eq(notificationsDb.presentation, "modal"), eq(notificationsDb.presentation, "all"))))
    .orderBy(desc(notificationsDb.createdAt)).limit(8);
  const announcements = rows.map((row) => {
    const actionUrl = normalizeInternalActionPath(row.actionUrl);
    // Legacy rows created before strict route validation must never trap users
    // in a modal with neither a close control nor a working destination.
    return { ...row, actionUrl, dismissible: row.dismissible || !actionUrl };
  });
  return Response.json({ ok: true, announcements }, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
