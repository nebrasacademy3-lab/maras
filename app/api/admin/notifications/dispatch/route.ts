import { checkRateLimit, clientIp, sameOriginRequest } from "@/lib/auth";
import { AdminMfaError, requireAdminStepUp } from "@/lib/admin-mfa";
import { isScheduledTaskRequest, jsonError } from "@/lib/api";
import { observeRequest } from "@/lib/observability";
import { ADMIN_PERMISSIONS, authorizePermission } from "@/lib/permissions";
import { dispatchDuePushNotifications } from "@/lib/push-campaigns";

export async function POST(request: Request) {
  return observeRequest(request, "notifications.dispatch", async () => {
    const machineAuthorized = isScheduledTaskRequest(request);
    const user = machineAuthorized ? null : await authorizePermission(request, ADMIN_PERMISSIONS.NOTIFICATIONS_DISPATCH);
    if (!machineAuthorized && (!user || !sameOriginRequest(request))) return jsonError("غير مصرح", 403);
    if (user) {
      try {
        await requireAdminStepUp(request, user);
      } catch (error) {
        if (error instanceof AdminMfaError) {
          return Response.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
        }
        throw error;
      }
    }
    const identity = machineAuthorized ? `machine:${clientIp(request)}` : `user:${user!.id}`;
    if (!await checkRateLimit("scheduled-push-dispatch", identity, 12, 60)) return jsonError("محاولات تشغيل كثيرة. حاول بعد دقيقة.", 429);
    const result = await dispatchDuePushNotifications(50);
    return Response.json({ ok: true, result, dispatchedAt: new Date().toISOString() }, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  });
}
