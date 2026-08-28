import { checkRateLimit, getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { isMobileRequest, mobileNoStoreHeaders } from "@/lib/mobile-api";
import { countUnreadVisibleNotifications, getVisibleNotifications, markVisibleNotificationsRead } from "@/lib/notifications";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  const requestedLimit = Math.floor(Number(new URL(request.url).searchParams.get("limit") || 100));
  const limit = Math.max(1, Math.min(250, requestedLimit || 100));
  const [rows, unreadCount] = await Promise.all([getVisibleNotifications(user, limit), countUnreadVisibleNotifications(user)]);
  return Response.json({ ok: true, unreadCount, notifications: rows, hasMore: rows.length === limit }, { headers: mobileNoStoreHeaders });
}

export async function PATCH(request: Request) {
  if (!isMobileRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  if (!await checkRateLimit("notification-read-state", `user:${user.id}`, 120, 60)) return jsonError("تحديثات كثيرة للإشعارات. حاول بعد قليل.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات غير صالحة"); }
  const id = Math.floor(Number(payload.id));
  if (payload.all !== true && !id) return jsonError("الإشعار غير صالح");
  const result = await markVisibleNotificationsRead(user, { all: payload.all === true, id });
  if (payload.all !== true && result.count === 0) return jsonError("الإشعار غير موجود أو غير متاح لهذا الحساب", 404);
  return Response.json({ ok: true, readAt: result.readAt, updated: result.count }, { headers: mobileNoStoreHeaders });
}
