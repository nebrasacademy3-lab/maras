import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";
import { isScheduledTaskRequest, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { AdminMfaError, requireAdminStepUp } from "@/lib/admin-mfa";
import { fileScanOverview, retryFileScan, runFileScanBatch, type ScanSource } from "@/lib/file-scan-queue";
import { observeRequest } from "@/lib/observability";
import { readBoundedJsonObject } from "@/lib/request-body";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!roleAllowed(user, ["admin"])) return jsonError("غير مصرح بعرض فحص المرفقات", 403);
  if (!await checkRateLimit("file-scan-read", "user:" + user!.id, 60, 60)) return jsonError("طلبات كثيرة، حاول بعد قليل", 429);
  return Response.json({ ok: true, ...await fileScanOverview() }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  return observeRequest(request, "files.scan", async () => {
    const machine = isScheduledTaskRequest(request);
    const user = machine ? null : await getSessionUser(request);
    if (!machine && (!roleAllowed(user, ["admin"]) || !sameOriginRequest(request))) return jsonError("غير مصرح بتشغيل فحص المرفقات", 403);
    const identity = machine ? "machine:" + clientIp(request) : "user:" + user!.id;
    if (!await checkRateLimit("file-scan", identity, 8, 60)) return jsonError("تم تشغيل الفحص مؤخرًا", 429);
    if (user) {
      try { await requireAdminStepUp(request, user); }
      catch (error) { return error instanceof AdminMfaError ? jsonError(error.message, error.status, error.code) : jsonError("مطلوب تحقق إداري إضافي", 403); }
    }
    let payload: Record<string, unknown> = {};
    if (request.body) {
      try { payload = await readBoundedJsonObject(request, 4096); } catch { return jsonError("بيانات غير صالحة"); }
    }
    if (payload.action === "retry") {
      const source = payload.source as ScanSource;
      const id = Number(payload.id);
      if (!["request", "support", "resource", "ai"].includes(source) || !Number.isSafeInteger(id) || id < 1) return jsonError("حدد ملفًا صالحًا");
      const queued = await retryFileScan(source, id);
      if (!queued) return jsonError("الملف غير موجود أو لا ينتظر الفحص", 409);
      await getDb().insert(auditLogs).values({ actorEmail: user?.email || "scheduled-task", action: "retry_scan", entityType: source + "_file", entityId: String(id), ipAddress: clientIp(request) });
      return Response.json({ ok: true, queued: true }, { headers: { "cache-control": "no-store" } });
    }
    if (payload.action && payload.action !== "run") return jsonError("إجراء غير معروف");
    const summary = await runFileScanBatch(1);
    return Response.json({ ok: true, summary, completedAt: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
  });
}
