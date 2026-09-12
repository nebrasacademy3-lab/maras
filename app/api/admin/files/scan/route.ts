import { getPool } from "@/db";
import { isScheduledTaskRequest, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { FILE_SCAN_TABLES, fileScanService } from "@/lib/file-scan-queue";
import { fileScanSchedulerEnabled } from "@/lib/file-scan-scheduler";
import { probeClamd, scannerConfig } from "@/lib/malware-scanner";
import { observeRequest } from "@/lib/observability";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!roleAllowed(user, ["admin"])) return jsonError("غير مصرح بعرض فحص الملفات", 403);
  if (!await checkRateLimit("file-scan-status", `user:${user!.id}`, 30, 60)) return jsonError("طلبات كثيرة، حاول لاحقًا", 429);
  const config = scannerConfig();
  const configured = config.mode === "clamd" || config.mode === "remote";
  const reachable = config.mode === "clamd" ? await probeClamd(config) : null;
  const queues = await Promise.all(Object.entries(FILE_SCAN_TABLES).map(async ([kind, table]) => {
    const counts = await getPool().query(`SELECT scan_status AS status, count(*)::int AS total FROM ${table} GROUP BY scan_status`);
    const pending = await getPool().query(`SELECT id, original_name AS "originalName", scan_status AS "scanStatus", scan_error AS "scanError", scan_provider AS "scanProvider", scan_attempts AS attempts, scan_next_attempt_at AS "nextAttemptAt", created_at AS "createdAt" FROM ${table} WHERE scan_status <> 'clean' ORDER BY id DESC LIMIT 30`);
    return { kind, counts: Object.fromEntries(counts.rows.map(row => [row.status, row.total])), files: pending.rows };
  }));
  return Response.json({ ok: true, scanner: { provider: config.mode, configured, reachable }, scheduler: { enabled: fileScanSchedulerEnabled(), lastRunAt: globalThis.__merasFileScanScheduler?.lastRunAt || null }, queues, generatedAt: new Date().toISOString() }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  return observeRequest(request, "files.scan", async () => {
    const machine = isScheduledTaskRequest(request);
    const user = machine ? null : await getSessionUser(request);
    if (!machine && (!roleAllowed(user, ["admin"]) || !sameOriginRequest(request))) return jsonError("غير مصرح بتشغيل فحص المرفقات", 403);
    const identity = machine ? `machine:${clientIp(request)}` : `user:${user!.id}`;
    if (!await checkRateLimit("file-scan", identity, 4, 60)) return jsonError("تم تشغيل الفحص مؤخرًا", 429);
    const config = scannerConfig();
    if (config.mode === "unconfigured" || config.mode === "invalid") return Response.json({ ok: false, error: "محرك الفحص غير مهيأ. شغّل ClamAV المرفق أو اضبط MALWARE_SCAN_URL ثم أعد المحاولة. لم يتم تجاوز حماية أي ملف.", code: "SCANNER_NOT_CONFIGURED" }, { status: 503, headers: { "cache-control": "no-store" } });
    // Administrator resume is useful immediately after repairing scanner configuration.
    // Machine ticks respect the backoff; neither path can release a quarantined file.
    if (!machine) await fileScanService.wakePending();
    const summary = await fileScanService.runBatch();
    return Response.json({ ok: true, summary, completedAt: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
  });
}
