"use client";

import { useEffect } from "react";

export const REALTIME_SYNC_EVENT = "meras:sync";

export type SyncPayload = { ok: true; version: string; serverTime: string; channels?: Record<string, string> };

export function useRealtimeSync(callback: (payload: SyncPayload) => void) {
  useEffect(() => {
    const listener = (event: Event) => callback((event as CustomEvent<SyncPayload>).detail);
    window.addEventListener(REALTIME_SYNC_EVENT, listener);
    return () => window.removeEventListener(REALTIME_SYNC_EVENT, listener);
  }, [callback]);
}

export function RealtimeSync({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let inFlight = false;
    let lastSignature = "";
    let delay = 15_000;

    const schedule = (nextDelay = delay) => {
      if (!stopped) timer = window.setTimeout(() => void poll(), nextDelay);
    };
    const poll = async () => {
      if (stopped || inFlight) return;
      if (document.visibilityState === "hidden") { schedule(60_000); return; }
      inFlight = true;
      try {
        const response = await fetch("/api/sync", { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
        if (response.status === 401) { delay = 60_000; return; }
        if (!response.ok) throw new Error("sync-failed");
        const payload = await response.json() as SyncPayload;
        const nextSignature = JSON.stringify(payload.channels || { version: payload.version });
        if (lastSignature && nextSignature !== lastSignature) window.dispatchEvent(new CustomEvent(REALTIME_SYNC_EVENT, { detail: payload }));
        lastSignature = nextSignature;
        delay = 15_000;
      } catch {
        delay = Math.min(delay * 2, 300_000);
      } finally {
        inFlight = false;
        schedule(delay);
      }
    };
    const wake = () => { if (document.visibilityState === "visible") { if (timer) window.clearTimeout(timer); delay = 15_000; void poll(); } };
    document.addEventListener("visibilitychange", wake);
    void poll();
    return () => { stopped = true; if (timer) window.clearTimeout(timer); document.removeEventListener("visibilitychange", wake); };
  }, []);

  return <>{children}</>;
}
