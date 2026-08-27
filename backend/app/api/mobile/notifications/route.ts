import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import { notificationsDb } from "@/db/schema";
import { getSessionUser, sameOriginRequest } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { mobileNoStoreHeaders } from "@/lib/mobile-api";

function visibleFor(userEmail: string, role: string, now = new Date().toISOString()) {
  return and(or(eq(notificationsDb.userEmail, userEmail), and(isNull(notificationsDb.userEmail), or(eq(notificationsDb.audience, role), eq(notificationsDb.audience, "public")))), or(isNull(notificationsDb.startsAt), lte(notificationsDb.startsAt, now)), or(isNull(notificationsDb.expiresAt), gt(notificationsDb.expiresAt, now)));
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  const rows = await getDb().select().from(notificationsDb).where(visibleFor(user.email, user.role)).orderBy(desc(notificationsDb.createdAt)).limit(100);
  return Response.json({ ok: true, unreadCount: rows.filter((row) => !row.readAt).length, notifications: rows }, { headers: mobileNoStoreHeaders });
}

export async function PATCH(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات غير صالحة"); }
  const now = new Date().toISOString();
  const db = getDb();
  const visible = visibleFor(user.email, user.role);
  if (payload.all === true) await db.update(notificationsDb).set({ readAt: now }).where(and(visible, isNull(notificationsDb.readAt)));
  else {
    const id = Math.floor(Number(payload.id));
    if (!id) return jsonError("الإشعار غير صالح");
    await db.update(notificationsDb).set({ readAt: now }).where(and(eq(notificationsDb.id, id), visible));
  }
  return Response.json({ ok: true, readAt: now }, { headers: mobileNoStoreHeaders });
}
