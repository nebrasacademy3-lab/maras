import React, { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";

type SyncPayload = { ok: true; channels?: Record<string, string>; version?: string };

const CHANNEL_KEYS: Record<string, readonly (readonly unknown[])[]> = {
  catalog: [["catalog"], ["dashboard"], ["learning-tracks"], ["admin-learning-tracks"], ["lesson-study-resources"], ["public-partners"], ["admin-course-roster"]],
  settings: [["settings"], ["dashboard"], ["public-information"], ["published-legal"]],
  announcements: [["announcements"]],
  account: [["dashboard"], ["cart"], ["favorites"], ["referrals"], ["ai-status"], ["ai-conversations"], ["learning-track-interests"], ["account-mfa"], ["lesson-study-resources"], ["store-history"]],
  commerce: [["dashboard"], ["cart"], ["referrals"], ["store-history"], ["admin-course-roster"]],
  support: [["support"], ["dashboard"], ["notifications"]],
  notifications: [["notifications"], ["dashboard"]],
  requests: [["dashboard"], ["supervisor-requests"]],
  supervisor: [["supervisor-workspace"], ["supervisor-requests"], ["admin-capabilities"], ["admin-device-permissions"]],
  admin: [["admin-console"], ["admin-referrals"], ["admin-ai"], ["admin-bundles"], ["admin-mfa-status"], ["admin-finance"], ["admin-operations"], ["admin-learning-tracks"], ["admin-student"], ["admin-panel"], ["admin-staff"], ["admin-capabilities"], ["admin-device-permissions"], ["registered-devices"], ["admin-course-roster"], ["admin-public-information"], ["admin-lesson-sources"]],
};

function invalidateChannels(queryClient: ReturnType<typeof useQueryClient>, changed: string[]) {
  const keys = new Map<string, readonly unknown[]>();
  for (const channel of changed) for (const key of CHANNEL_KEYS[channel] || []) keys.set(JSON.stringify(key), key);
  for (const queryKey of keys.values()) {
    // A failed re-fetch leaves its query stale; it must not become an unhandled promise rejection.
    void queryClient.invalidateQueries({ queryKey, refetchType: "active" }).catch(() => undefined);
  }
}

export function RealtimeSyncProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { token, user, loading, refresh } = useAuth();
  const previous = useRef<Record<string, string> | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (loading) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | null = null;
    let generation = 0;
    let inFlight = false;
    let delay = 5_000;
    let retryAt = 0;
    appState.current = AppState.currentState;

    const clearTimer = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const schedule = (nextDelay = delay) => {
      clearTimer();
      if (!stopped && appState.current === "active") {
        timer = setTimeout(() => { timer = undefined; void poll(); }, nextDelay);
      }
    };
    const current = (epoch: number, controller: AbortController) =>
      !stopped && appState.current === "active" && epoch === generation && request === controller && !controller.signal.aborted;
    const poll = async () => {
      if (stopped || inFlight || appState.current !== "active") return;
      const remaining = retryAt - Date.now();
      if (remaining > 0) { schedule(remaining); return; }
      inFlight = true;
      const epoch = generation, controller = new AbortController();
      request = controller;
      try {
        const payload = await api<SyncPayload>("/api/sync", { signal: controller.signal });
        if (!current(epoch, controller)) return;
        if (!payload || payload.ok !== true || (!payload.channels && typeof payload.version !== "string")) throw new Error("Invalid sync snapshot");
        const next = payload.channels || { catalog: payload.version! };
        if (typeof next !== "object" || Array.isArray(next) || Object.values(next).some(value => typeof value !== "string")) throw new Error("Invalid sync channels");
        const before = previous.current;
        previous.current = next;
        delay = 5_000;
        retryAt = 0;
        if (before) {
          // Removal of a private channel is as meaningful as changing a revision.
          const changed = [...new Set([...Object.keys(before), ...Object.keys(next)])].filter(channel => next[channel] !== before[channel]);
          if (changed.length) invalidateChannels(queryClient, changed);
          if (token && changed.some(channel => channel === "account" || (["admin", "supervisor"].includes(channel) && !(channel in next)))) await refresh();
        }
      } catch (reason) {
        if (!current(epoch, controller)) return;
        if (reason instanceof ApiError && reason.status === 429) {
          const seconds = reason.retryAfterSeconds;
          delay = Math.max(60_000, typeof seconds === "number" && Number.isFinite(seconds) ? Math.min(86_400_000, Math.ceil(seconds * 1000)) : 0);
        } else {
          delay = reason instanceof ApiError && reason.status === 401 ? 60_000 : Math.min(delay * 2, 300_000);
        }
        retryAt = Date.now() + delay;
        if (token && reason instanceof ApiError && reason.status === 401) {
          try { await refresh(); } catch { /* Keep the cooldown if session refresh is also unavailable. */ }
        }
      } finally {
        // A cancelled older lifecycle cannot unlock or schedule work for its successor.
        if (epoch === generation && request === controller) {
          inFlight = false;
          request = null;
          schedule(Math.max(delay, retryAt - Date.now()));
        }
      }
    };
    const pause = () => {
      generation++;
      clearTimer();
      request?.abort();
      request = null;
      inFlight = false;
    };
    const onStateChange = (next: AppStateStatus) => {
      const before = appState.current;
      appState.current = next;
      if (next !== "active") { pause(); return; }
      if (before === "active") return;
      // Foregrounding does not bypass a server cooldown or resurrect an aborted request.
      invalidateChannels(queryClient, ["settings"]);
      void poll();
    };
    const subscription = AppState.addEventListener("change", onStateChange);
    previous.current = null;
    void poll();
    return () => { stopped = true; pause(); subscription.remove(); };
  }, [loading, token, user?.id, user?.role, queryClient, refresh]);

  return <>{children}</>;
}
