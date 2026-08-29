import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import { notificationsDb } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export async function GET(request: Request) {
  const now = new Date().toISOString();
  const user = await getSessionUser(request);
  const audience = user
    ? or(
        eq(notificationsDb.userEmail, user.email),
        and(isNull(notificationsDb.userEmail), or(eq(notificationsDb.audience, user.role), eq(notificationsDb.audience, "public"))),
      )
    : and(isNull(notificationsDb.userEmail), eq(notificationsDb.audience, "public"));

  const rows = await getDb().select({
    id: notificationsDb.id,
    title: notificationsDb.title,
    body: notificationsDb.body,
    actionUrl: notificationsDb.actionUrl,
    actionLabel: notificationsDb.actionLabel,
    presentation: notificationsDb.presentation,
    dismissible: notificationsDb.dismissible,
    createdAt: notificationsDb.createdAt,
  })
    .from(notificationsDb)
    .where(and(
      audience,
      or(eq(notificationsDb.presentation, "banner"), eq(notificationsDb.presentation, "modal"), eq(notificationsDb.presentation, "all")),
      or(isNull(notificationsDb.startsAt), lte(notificationsDb.startsAt, now)),
      or(isNull(notificationsDb.expiresAt), gt(notificationsDb.expiresAt, now)),
    ))
    .orderBy(desc(notificationsDb.createdAt))
    .limit(12);

  return Response.json({ ok: true, announcements: rows }, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
