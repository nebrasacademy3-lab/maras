"use client";

import { startTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export const REALTIME_SYNC_EVENT = "meras:sync";

export type SyncPayload = {
  ok: true;
  version: string;
  serverTime: string;
  channels?: Record<string, string>;
  changed?: string[];
};

export function useRealtimeSync(callback: (payload: SyncPayload) => void) {
  const callbackRef = useRef(callback);
  useEffect(() => { callbackRef.current = callback; }, [callback]);
  useEffect(() => {
    const listener = (event: Event) => callbackRef.current((event as CustomEvent<SyncPayload>).detail);
    window.addEventListener(REALTIME_SYNC_EVENT, listener);
    return () => window.removeEventListener(REALTIME_SYNC_EVENT, listener);
  }, []);
}

export function RealtimeSync({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    let pending = false;
    let timer: number | undefined;
    let debounceTimer: number | undefined;
    let reconnectTimer: number | undefined;
    let eventSource: EventSource | null = null;
    let streamConnected = false;
    let reconnectDelay = 1_000;
    let previous: Record<string, string> | null = null;

    const clearTimer = () => { if (timer) window.clearTimeout(timer); timer = undefined; };
    const schedule = (delay = streamConnected ? 45_000 : 5_000) => {
      clearTimer();
      if (!stopped) timer = window.setTimeout(() => void snapshot(), document.visibilityState === "hidden" ? 60_000 : delay);
    };
    const snapshot = async () => {
      if (stopped) return;
      if (inFlight) { pending = true; return; }
      if (document.visibilityState === "hidden") { schedule(60_000); return; }
      inFlight = true;
      try {
        const response = await fetch("/api/sync", { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
        if (!response.ok) throw new Error(`sync-${response.status}`);
        const payload = await response.json() as SyncPayload;
        const next = payload.channels || { catalog: payload.version };
        if (previous) {
          const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
          const changed = [...keys].filter((channel) => previous?.[channel] !== next[channel]);
          if (changed.length) {
            const detail = { ...payload, changed };
            window.dispatchEvent(new CustomEvent(REALTIME_SYNC_EVENT, { detail }));
            if (changed.some((channel) => channel === "catalog" || channel === "settings" || channel === "announcements")) {
              startTransition(() => router.refresh());
            }
          }
        }
        previous = next;
        reconnectDelay = 1_000;
      } catch {
        streamConnected = false;
      } finally {
        inFlight = false;
        if (pending) { pending = false; void snapshot(); }
        else schedule();
      }
    };
    const requestSnapshot = () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => void snapshot(), 80);
    };
    const connect = () => {
      if (stopped || typeof EventSource === "undefined") return;
      eventSource?.close();
      const source = new EventSource("/api/sync/stream", { withCredentials: true });
      eventSource = source;
      source.addEventListener("ready", () => { streamConnected = true; reconnectDelay = 1_000; schedule(45_000); });
      source.addEventListener("change", requestSnapshot);
      source.onerror = () => {
        if (stopped || eventSource !== source) return;
        source.close();
        eventSource = null;
        streamConnected = false;
        schedule(5_000);
        reconnectTimer = window.setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
      };
    };
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      clearTimer();
      void snapshot();
      if (!eventSource) connect();
    };

    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    void snapshot();
    connect();
    return () => {
      stopped = true;
      clearTimer();
      if (debounceTimer) window.clearTimeout(debounceTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      eventSource?.close();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
    };
  }, [router]);

  return <>{children}</>;
}
