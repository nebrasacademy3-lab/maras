import { and, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import { notificationReads, notificationsDb } from "@/db/schema";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { mobileNoStoreHeaders } from "@/lib/mobile-api";

function visibleFor(userEmail: string, role: string, now = new Date().toISOString()) {
  return and(
    or(
      eq(notificationsDb.userEmail, userEmail),
      and(isNull(notificationsDb.userEmail), or(eq(notificationsDb.audience, role), eq(notificationsDb.audience, "public"))),
    ),
    or(isNull(notificationsDb.startsAt), lte(notificationsDb.startsAt, now)),
    or(isNull(notificationsDb.expiresAt), gt(notificationsDb.expiresAt, now)),
  );
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  const db = getDb();
  const rows = await db.select().from(notificationsDb).where(visibleFor(user.email, user.role)).orderBy(desc(notificationsDb.createdAt)).limit(100);
  const ids = rows.map((row) => row.id);
  const readRows = ids.length
    ? await db.select({ notificationId: notificationReads.notificationId, readAt: notificationReads.readAt }).from(notificationReads).where(and(eq(notificationReads.userEmail, user.email), inArray(notificationReads.notificationId, ids)))
    : [];
  const readMap = new Map(readRows.map((row) => [row.notificationId, row.readAt]));
  const notifications = rows.map((row) => ({ ...row, readAt: readMap.get(row.id) || null }));
  return Response.json({ ok: true, unreadCount: notifications.filter((row) => !row.readAt).length, notifications }, { headers: mobileNoStoreHeaders });
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
  const visible = visibleFor(user.email, user.role, now);

  let ids: number[] = [];
  if (payload.all === true) {
    ids = (await db.select({ id: notificationsDb.id }).from(notificationsDb).where(visible).limit(500)).map((row) => row.id);
  } else {
    const id = Math.floor(Number(payload.id));
    if (!id) return jsonError("الإشعار غير صالح");
    const [row] = await db.select({ id: notificationsDb.id }).from(notificationsDb).where(and(eq(notificationsDb.id, id), visible)).limit(1);
    if (!row) return jsonError("الإشعار غير موجود", 404);
    ids = [row.id];
  }

  if (ids.length) {
    await db.insert(notificationReads).values(ids.map((notificationId) => ({ notificationId, userEmail: user.email, readAt: now }))).onConflictDoUpdate({
      target: [notificationReads.notificationId, notificationReads.userEmail],
      set: { readAt: now },
    });
  }
  return Response.json({ ok: true, readAt: now, count: ids.length }, { headers: mobileNoStoreHeaders });
}
