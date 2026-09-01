import { checkRateLimit, clientIp, getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { isScheduledTaskRequest, jsonError } from "@/lib/api";
import { runLifecycleAutomations } from "@/lib/lifecycle-automation";
import { observeRequest } from "@/lib/observability";
import { dispatchDuePushNotifications } from "@/lib/push-campaigns";

export async function POST(request: Request) {
  return observeRequest(request, "lifecycle.dispatch", async () => {
    const machineAuthorized = isScheduledTaskRequest(request);
    const user = machineAuthorized ? null : await getSessionUser(request);
    if (!machineAuthorized && (!roleAllowed(user, ["admin"]) || !sameOriginRequest(request))) {
      return jsonError("غير مصرح بتشغيل الأتمتة", 403);
    }

    const identity = machineAuthorized ? `machine:${clientIp(request)}` : `user:${user!.id}`;
    if (!await checkRateLimit("lifecycle-dispatch", identity, 6, 60)) {
      return jsonError("تم تشغيل الأتمتة مؤخرًا. حاول بعد دقيقة.", 429);
    }

    const lifecycle = await runLifecycleAutomations();
    const push = await dispatchDuePushNotifications(100);
    return Response.json({ ok: true, lifecycle, push, dispatchedAt: new Date().toISOString() }, {
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  });
}
