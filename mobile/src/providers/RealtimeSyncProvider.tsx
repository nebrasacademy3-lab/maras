import React, { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "@/src/lib/api";
import { useAuth } from "@/src/providers/AuthProvider";

type SyncPayload = { ok: true; channels?: Record<string, string>; version?: string };

const CHANNEL_KEYS: Record<string, readonly (readonly unknown[])[]> = {
  catalog: [["catalog"], ["dashboard"]],
  settings: [["settings"], ["dashboard"]],
  announcements: [["announcements"]],
  account: [["dashboard"], ["cart"], ["favorites"]],
  commerce: [["dashboard"], ["cart"]],
  support: [["support"], ["dashboard"], ["notifications"]],
  notifications: [["notifications"], ["dashboard"]],
  requests: [["dashboard"], ["supervisor-requests"]],
  supervisor: [["supervisor-workspace"], ["supervisor-requests"]],
  admin: [["admin-console"]],
};

function invalidateChannels(queryClient: ReturnType<typeof useQueryClient>, changed: string[]) {
  const keys = new Map<string, readonly unknown[]>();
  for (const channel of changed) for (const key of CHANNEL_KEYS[channel] || []) keys.set(JSON.stringify(key), key);
  for (const queryKey of keys.values()) void queryClient.invalidateQueries({ queryKey, refetchType: "active" });
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
    let inFlight = false;
    let delay = 5_000;

    const schedule = (nextDelay = delay) => {
      if (!stopped) timer = setTimeout(() => void poll(), nextDelay);
    };
    const poll = async () => {
      if (stopped || inFlight || appState.current !== "active") return;
      inFlight = true;
      try {
        const payload = await api<SyncPayload>("/api/sync");
        const next = payload.channels || { account: payload.version || "0" };
        if (previous.current) {
          const changed = Object.keys(next).filter((channel) => next[channel] !== previous.current?.[channel]);
          if (changed.length) invalidateChannels(queryClient, changed);
        }
        previous.current = next;
        delay = 5_000;
      } catch (reason) {
        if (token && reason instanceof ApiError && reason.status === 401) {
          await refresh();
          return;
        }
        delay = reason instanceof ApiError && reason.status === 429 ? 60_000 : Math.min(delay * 2, 300_000);
      } finally {
        inFlight = false;
        if (appState.current === "active") schedule(delay);
      }
    };
    const onStateChange = (next: AppStateStatus) => {
      appState.current = next;
      if (next === "active") {
        if (timer) clearTimeout(timer);
        delay = 5_000;
        void poll();
      } else if (timer) clearTimeout(timer);
    };
    const subscription = AppState.addEventListener("change", onStateChange);
    previous.current = null;
    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, [loading, token, user, queryClient, refresh]);

  return <>{children}</>;
}
