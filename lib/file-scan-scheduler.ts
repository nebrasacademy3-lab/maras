import { logEvent } from "@/lib/observability";
import { runFileScanBatch } from "@/lib/file-scan-queue";
declare global { var __merasFileScanScheduler: { timer: ReturnType<typeof setInterval>; running: boolean } | undefined; }
export function startFileScanScheduler() {
  if (globalThis.__merasFileScanScheduler || !process.env.DATABASE_URL?.trim() || process.env.FILE_SCAN_SCHEDULER_ENABLED === "false") return false;
  const tick = async () => {
    const state = globalThis.__merasFileScanScheduler;
    if (!state || state.running) return;
    state.running = true;
  try {
  const summary = await runFileScanBatch(5);

  if (summary.scanned) {
    logEvent("info", "files.scan.completed", {
      scanned: summary.scanned,
      clean: summary.clean,
      quarantined: summary.quarantined,
      pending: summary.pending,
      skipped: summary.skipped,
      busy: summary.busy,
      configured: summary.configured,
      configurationError: summary.configurationError,
      resultsCount: summary.results.length,
    });
  }
} catch {
  logEvent("warn", "files.scan.failed", {
    code: "scan_worker_failed",
  });
}
  };
  const timer = setInterval(() => { void tick(); }, 60_000);
  timer.unref?.();
  globalThis.__merasFileScanScheduler = { timer, running: false };
  const initial = setTimeout(() => { void tick(); }, 10_000);
  initial.unref?.();
  return true;
}
