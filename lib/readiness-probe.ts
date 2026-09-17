export type ReadinessState = "ready" | "unavailable";

/** One bounded probe per process, including when a timed-out dependency ignores abort. */
export function createReadinessProbe(check: (signal: AbortSignal) => Promise<boolean>, { timeoutMs = 3500, ttlMs = 2000 } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || !Number.isSafeInteger(ttlMs) || ttlMs < 0) throw new Error("Invalid readiness timing");
  let pending: Promise<ReadinessState> | null = null;
  let cached: { state: ReadinessState; expiresAt: number } | null = null;
  return function probe(): Promise<ReadinessState> {
    if (pending) return pending;
    if (cached && performance.now() < cached.expiresAt) return Promise.resolve(cached.state);
    const controller = new AbortController();
    let complete!: (state: ReadinessState) => void;
    let completed = false;
    const result = new Promise<ReadinessState>(resolve => { complete = resolve; });
    pending = result;
    const finish = (state: ReadinessState) => {
      if (completed) return;
      completed = true;
      cached = { state, expiresAt: performance.now() + ttlMs };
      complete(state);
    };
    const timer = setTimeout(() => {
      controller.abort();
      finish("unavailable");
    }, timeoutMs);
    // Keep the reservation until the underlying work actually settles. Merely
    // racing a timeout and releasing it would admit unlimited abandoned probes.
    void Promise.resolve().then(() => check(controller.signal)).then(
      ready => finish(ready === true && !controller.signal.aborted ? "ready" : "unavailable"),
      () => finish("unavailable"),
    ).finally(() => {
      clearTimeout(timer);
      if (pending === result) pending = null;
    });
    return result;
  };
}
