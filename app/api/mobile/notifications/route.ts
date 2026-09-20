import { readBoundedJsonObject } from "@/lib/request-body";
import { notificationRecipientWhere } from "@/lib/notification-visibility";
import { and, count, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import { notificationReads, notificationsDb } from "@/db/schema";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { mobileNoStoreHeaders } from "@/lib/mobile-api";

function visibleFor(user: { id: number; email: string; role: string }, now = new Date().toISOString()) {
  return and(notificationRecipientWhere(user), or(eq(notificationsDb.presentation, "inbox"), eq(notificationsDb.presentation, "all")), or(isNull(notificationsDb.startsAt), lte(notificationsDb.startsAt, now)), or(isNull(notificationsDb.expiresAt), gt(notificationsDb.expiresAt, now)));
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  const actingUser = request.headers.get("x-meras-acting-user");
  if (actingUser && actingUser !== String(user.id)) return jsonError("تغيّر الحساب أثناء الطلب. حدّث الصفحة.", 409);
  if (!await checkRateLimit("notification-inbox", `user:${user.id}`, 120, 60)) return jsonError("طلبات إشعارات كثيرة. حاول بعد قليل.", 429);
  const db = getDb();
  const visibility = visibleFor(user);
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
  return Response.json({ ok: true, ownerId: user.id, unreadCount: Number(unreadRow?.value || 0), notifications: rows }, { headers: mobileNoStoreHeaders });
}

export async function PATCH(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  const actingUser = request.headers.get("x-meras-acting-user");
  if (actingUser && actingUser !== String(user.id)) return jsonError("تغيّر الحساب أثناء الطلب. حدّث الصفحة.", 409);
  if (!await checkRateLimit("notification-read-state", `user:${user.id}`, 120, 60)) return jsonError("تحديثات كثيرة للإشعارات. حاول بعد قليل.", 429);
  let payload: Record<string, unknown>;
  try { payload = await readBoundedJsonObject(request, 2048); } catch { return jsonError("بيانات غير صالحة"); }
  const now = new Date().toISOString();
  const db = getDb();
  const requestedId = payload.all === true ? null : Number(payload.id);
  if (payload.all !== true && (!Number.isSafeInteger(requestedId) || requestedId! <= 0)) return jsonError("الإشعار غير صالح");
  const visibleRows = await db.select({ id: notificationsDb.id }).from(notificationsDb)
    .where(requestedId ? and(eq(notificationsDb.id, requestedId), visibleFor(user)) : visibleFor(user))
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
    .where(and(visibleFor(user), isNull(notificationReads.readAt)));
  return Response.json({ ok: true, readAt: now, unreadCount: Number(remaining?.value || 0), markedIds: visibleRows.map((row) => row.id) }, { headers: mobileNoStoreHeaders });
}
