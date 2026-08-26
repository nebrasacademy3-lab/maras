import { and, desc, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { notificationsDb } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { isMobileRequest, mobileNoStoreHeaders } from "@/lib/mobile-api";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  const rows = await getDb().select().from(notificationsDb).where(or(eq(notificationsDb.userEmail, user.email), and(isNull(notificationsDb.userEmail), eq(notificationsDb.audience, user.role)))).orderBy(desc(notificationsDb.createdAt)).limit(100);
  return Response.json({ ok: true, notifications: rows }, { headers: mobileNoStoreHeaders });
}

export async function PATCH(request: Request) {
  if (!isMobileRequest(request)) return jsonError("طلب تطبيق غير صالح", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات غير صالحة"); }
  const now = new Date().toISOString();
  const db = getDb();
  if (payload.all === true) await db.update(notificationsDb).set({ readAt: now }).where(eq(notificationsDb.userEmail, user.email));
  else {
    const id = Math.floor(Number(payload.id));
    if (!id) return jsonError("الإشعار غير صالح");
    await db.update(notificationsDb).set({ readAt: now }).where(and(eq(notificationsDb.id, id), eq(notificationsDb.userEmail, user.email)));
  }
  return Response.json({ ok: true, readAt: now }, { headers: mobileNoStoreHeaders });
}

