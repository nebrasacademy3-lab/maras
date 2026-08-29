import { checkRateLimit, clientIp, getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { isAdminRequest, jsonError } from "@/lib/api";
import { dispatchDuePushNotifications } from "@/lib/push-campaigns";

export async function POST(request: Request) {
  const machineAuthorized = isAdminRequest(request);
  const user = machineAuthorized ? null : await getSessionUser(request);
  if (!machineAuthorized && (!roleAllowed(user, ["admin"]) || !sameOriginRequest(request))) return jsonError("غير مصرح", 403);
  const identity = machineAuthorized ? `machine:${clientIp(request)}` : `user:${user!.id}`;
  if (!await checkRateLimit("scheduled-push-dispatch", identity, 12, 60)) return jsonError("محاولات تشغيل كثيرة. حاول بعد دقيقة.", 429);
  const result = await dispatchDuePushNotifications(50);
  return Response.json({ ok: true, result, dispatchedAt: new Date().toISOString() }, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
