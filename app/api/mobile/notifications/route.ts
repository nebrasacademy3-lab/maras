import { and, count, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import { notificationReads, notificationsDb } from "@/db/schema";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { mobileNoStoreHeaders } from "@/lib/mobile-api";

function visibleFor(userEmail: string, role: string, now = new Date().toISOString()) {
  return and(or(eq(notificationsDb.userEmail, userEmail), and(isNull(notificationsDb.userEmail), or(eq(notificationsDb.audience, role), eq(notificationsDb.audience, "public")))), or(eq(notificationsDb.presentation, "inbox"), eq(notificationsDb.presentation, "all")), or(isNull(notificationsDb.startsAt), lte(notificationsDb.startsAt, now)), or(isNull(notificationsDb.expiresAt), gt(notificationsDb.expiresAt, now)));
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  const db = getDb();
  const visibility = visibleFor(user.email, user.role);
  const readJoin = and(eq(notificationReads.notificationId, notificationsDb.id), eq(notificationReads.userId, user.id));
  const [selected, [unreadRow]] = await Promise.all([
    db.select({ notification: notificationsDb, readAt: notificationReads.readAt })
      .from(notificationsDb)
      .leftJoin(notificationReads, readJoin)
      .where(visibility).orderBy(desc(notificationsDb.createdAt)).limit(500),
    db.select({ value: count() }).from(notificationsDb)
      .leftJoin(notificationReads, readJoin)
      .where(and(visibility, isNull(notificationReads.readAt))),
  ]);
  const rows = selected.map((row) => ({ ...row.notification, readAt: row.readAt }));
  return Response.json({ ok: true, unreadCount: Number(unreadRow?.value || 0), notifications: rows }, { headers: mobileNoStoreHeaders });
}

export async function PATCH(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  if (!await checkRateLimit("notification-read-state", `user:${user.id}`, 120, 60)) return jsonError("تحديثات كثيرة للإشعارات. حاول بعد قليل.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات غير صالحة"); }
  const now = new Date().toISOString();
  const db = getDb();
  const requestedId = payload.all === true ? null : Math.floor(Number(payload.id));
  if (payload.all !== true && !requestedId) return jsonError("الإشعار غير صالح");
  const visibleRows = await db.select({ id: notificationsDb.id }).from(notificationsDb)
    .where(requestedId ? and(eq(notificationsDb.id, requestedId), visibleFor(user.email, user.role)) : visibleFor(user.email, user.role))
    .orderBy(desc(notificationsDb.id));
  if (!visibleRows.length) return payload.all === true ? Response.json({ ok: true, readAt: now, unreadCount: 0, markedIds: [] }, { headers: mobileNoStoreHeaders }) : jsonError("الإشعار غير موجود", 404);
  await db.transaction(async (tx) => {
    for (let index = 0; index < visibleRows.length; index += 400) {
      await tx.insert(notificationReads).values(visibleRows.slice(index, index + 400).map((row) => ({ notificationId: row.id, userId: user.id, readAt: now })))
        .onConflictDoUpdate({ target: [notificationReads.notificationId, notificationReads.userId], set: { readAt: now } });
    }
  });
  const [remaining] = await db.select({ value: count() }).from(notificationsDb)
    .leftJoin(notificationReads, and(eq(notificationReads.notificationId, notificationsDb.id), eq(notificationReads.userId, user.id)))
    .where(and(visibleFor(user.email, user.role), isNull(notificationReads.readAt)));
  return Response.json({ ok: true, readAt: now, unreadCount: Number(remaining?.value || 0), markedIds: visibleRows.map((row) => row.id) }, { headers: mobileNoStoreHeaders });
}
