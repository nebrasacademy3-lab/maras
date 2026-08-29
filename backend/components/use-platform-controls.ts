"use client";

import { useCallback, useEffect, useState } from "react";
import { useRealtimeSync } from "./realtime-sync";

export type PlatformFeature = "registration" | "purchases" | "courseRequests" | "support" | "onboarding";

type PlatformControls = {
  registration: boolean;
  purchases: boolean;
  courseRequests: boolean;
  support: boolean;
  onboarding: boolean;
  maintenanceMessage: string;
};

type PlatformControlsState = PlatformControls & { loading: boolean; error: boolean };

const safeInitialState: PlatformControlsState = {
  registration: false,
  purchases: false,
  courseRequests: false,
  support: false,
  onboarding: false,
  maintenanceMessage: "",
  loading: true,
  error: false,
};

let cached: { expiresAt: number; value: PlatformControlsState } | null = null;
let inFlight: Promise<PlatformControlsState> | null = null;

function enabled(value: unknown) {
  return ["true", "1", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

async function loadControls(force = false) {
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
  if (!force && inFlight) return inFlight;
  inFlight = fetch("/api/public/settings", { cache: "no-store", credentials: "same-origin" })
    .then(async (response) => {
      if (!response.ok) throw new Error("settings");
      const payload = await response.json() as { settings?: Record<string, unknown> };
      const settings = payload.settings || {};
      const value: PlatformControlsState = {
        registration: enabled(settings.registration_enabled),
        purchases: enabled(settings.purchases_enabled),
        courseRequests: enabled(settings.course_requests_enabled),
        support: enabled(settings.support_enabled),
        onboarding: enabled(settings.onboarding_enabled),
        maintenanceMessage: String(settings.maintenance_message || "").trim(),
        loading: false,
        error: false,
      };
      cached = { expiresAt: Date.now() + 5_000, value };
      return value;
    })
    .catch(() => ({ ...safeInitialState, loading: false, error: true }))
    .finally(() => { inFlight = null; });
  return inFlight;
}

export function usePlatformControls() {
  const [state, setState] = useState<PlatformControlsState>(() => cached?.value || safeInitialState);

  useEffect(() => {
    let active = true;
    void loadControls().then((value) => { if (active) setState(value); });
    return () => { active = false; };
  }, []);

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    const value = await loadControls(true);
    setState(value);
    return value;
  }, []);

  useRealtimeSync((payload) => {
    const changed = payload.changed || [];
    if (!changed.length || changed.includes("settings")) void refresh();
  });

  const isEnabled = useCallback((feature: PlatformFeature) => state[feature], [state]);
  return { ...state, isEnabled, refresh };
}
