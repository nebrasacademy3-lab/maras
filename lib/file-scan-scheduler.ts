import { fileScanService } from "@/lib/file-scan-queue";
import { logEvent } from "@/lib/observability";

declare global { var __merasFileScanScheduler: { timer: ReturnType<typeof setInterval>; running: boolean; lastRunAt: string | null } | undefined; }
export function fileScanSchedulerEnabled() { return process.env.FILE_SCAN_SCHEDULER_ENABLED?.trim().toLowerCase() !== "false" && Boolean(process.env.DATABASE_URL?.trim()); }
export function fileScanIntervalMs() { const value = Number(process.env.FILE_SCAN_INTERVAL_MS || 30_000); return Number.isFinite(value) ? Math.max(10_000, Math.min(300_000, value)) : 30_000; }
export async function runFileScanTick() {
  const state = globalThis.__merasFileScanScheduler;
  if (!state || state.running) return;
  state.running = true;
  try {
    const summary = await fileScanService.runBatch();
    state.lastRunAt = new Date().toISOString();
    if (summary.scanned || summary.failed) logEvent("info", "files.scheduler.tick", summary);
  } catch { logEvent("warn", "files.scheduler.failed", { code: "scan_queue_unavailable" }); }
  finally { state.running = false; }
}
export function startFileScanScheduler() {
  if (!fileScanSchedulerEnabled() || globalThis.__merasFileScanScheduler) return false;
  const timer = setInterval(() => { void runFileScanTick(); }, fileScanIntervalMs());
  timer.unref?.();
  globalThis.__merasFileScanScheduler = { timer, running: false, lastRunAt: null };
  const initial = setTimeout(() => { void runFileScanTick(); }, 5_000); initial.unref?.();
  logEvent("info", "files.scheduler.started", { intervalMs: fileScanIntervalMs() });
  return true;
}
