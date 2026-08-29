import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import { notificationReads, notificationsDb } from "@/db/schema";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { mobileNoStoreHeaders } from "@/lib/mobile-api";

function visibleFor(userEmail: string, role: string, now = new Date().toISOString()) {
  return and(or(eq(notificationsDb.userEmail, userEmail), and(isNull(notificationsDb.userEmail), or(eq(notificationsDb.audience, role), eq(notificationsDb.audience, "public")))), or(isNull(notificationsDb.startsAt), lte(notificationsDb.startsAt, now)), or(isNull(notificationsDb.expiresAt), gt(notificationsDb.expiresAt, now)));
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  const selected = await getDb().select({ notification: notificationsDb, readAt: notificationReads.readAt })
    .from(notificationsDb)
    .leftJoin(notificationReads, and(eq(notificationReads.notificationId, notificationsDb.id), eq(notificationReads.userId, user.id)))
    .where(visibleFor(user.email, user.role)).orderBy(desc(notificationsDb.createdAt)).limit(500);
  const rows = selected.map((row) => ({ ...row.notification, readAt: row.readAt }));
  return Response.json({ ok: true, unreadCount: rows.filter((row) => !row.readAt).length, notifications: rows }, { headers: mobileNoStoreHeaders });
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
    .limit(payload.all === true ? 1000 : 1);
  if (!visibleRows.length) return payload.all === true ? Response.json({ ok: true, readAt: now, unreadCount: 0, markedIds: [] }, { headers: mobileNoStoreHeaders }) : jsonError("الإشعار غير موجود", 404);
  await db.insert(notificationReads).values(visibleRows.map((row) => ({ notificationId: row.id, userId: user.id, readAt: now })))
    .onConflictDoUpdate({ target: [notificationReads.notificationId, notificationReads.userId], set: { readAt: now } });
  return Response.json({ ok: true, readAt: now, unreadCount: 0, markedIds: visibleRows.map((row) => row.id) }, { headers: mobileNoStoreHeaders });
}
