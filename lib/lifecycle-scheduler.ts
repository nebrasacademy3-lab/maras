import { sql } from "drizzle-orm";
import { logEvent } from "@/lib/observability";

// Fixed advisory-lock key shared by every server instance so only one of them
// runs the automations per tick even without an external cron.
const SCHEDULER_LOCK_KEY = 7_412_009_113;
const MIN_INTERVAL_MS = 60_000;
const DEFAULT_INTERVAL_MS = 5 * 60_000;

declare global {
  var __merasLifecycleScheduler: { timer: ReturnType<typeof setInterval>; running: boolean } | undefined;
}

export function lifecycleSchedulerEnabled() {
  return process.env.LIFECYCLE_SCHEDULER_ENABLED?.trim().toLowerCase() !== "false" && Boolean(process.env.DATABASE_URL?.trim());
}

export function lifecycleSchedulerIntervalMs() {
  const configured = Number(process.env.LIFECYCLE_SCHEDULER_INTERVAL_MS);
  return Number.isFinite(configured) && configured > 0 ? Math.max(MIN_INTERVAL_MS, Math.floor(configured)) : DEFAULT_INTERVAL_MS;
}

async function runTick() {
  const state = globalThis.__merasLifecycleScheduler;
  if (!state || state.running) return;
  state.running = true;
  try {
    const [{ getDb }, { runLifecycleAutomations }, { dispatchDuePushNotifications }] = await Promise.all([
      import("@/db"),
      import("@/lib/lifecycle-automation"),
      import("@/lib/push-campaigns"),
    ]);
    const db = getDb();
    const locked = await db.execute(sql`SELECT pg_try_advisory_lock(${SCHEDULER_LOCK_KEY}) AS locked`);
    const acquired = Boolean((locked.rows[0] as { locked?: boolean } | undefined)?.locked);
    if (!acquired) return;
    try {
      const startedAt = Date.now();
      const lifecycle = await runLifecycleAutomations();
      const push = await dispatchDuePushNotifications(100);
      logEvent("info", "lifecycle.scheduler.tick", { durationMs: Date.now() - startedAt, ...lifecycle, pushAttempted: push.attempted, pushAccepted: push.accepted, pushRejected: push.rejected });
    } finally {
      await db.execute(sql`SELECT pg_advisory_unlock(${SCHEDULER_LOCK_KEY})`).catch(() => undefined);
    }
  } catch (error) {
    logEvent("warn", "lifecycle.scheduler.failed", { message: error instanceof Error ? error.message : "unknown error" });
  } finally {
    if (globalThis.__merasLifecycleScheduler) globalThis.__merasLifecycleScheduler.running = false;
  }
}

export function startLifecycleScheduler() {
  if (!lifecycleSchedulerEnabled() || globalThis.__merasLifecycleScheduler) return false;
  const interval = lifecycleSchedulerIntervalMs();
  const timer = setInterval(() => { void runTick(); }, interval);
  timer.unref?.();
  globalThis.__merasLifecycleScheduler = { timer, running: false };
  const firstRun = setTimeout(() => { void runTick(); }, Math.min(interval, 45_000));
  firstRun.unref?.();
  logEvent("info", "lifecycle.scheduler.started", { intervalMs: interval });
  return true;
}
