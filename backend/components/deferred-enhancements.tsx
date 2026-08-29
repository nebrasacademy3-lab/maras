"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const DeferredAssistant = dynamic(() => import("@/components/meras-assistant").then((module) => module.MerasAssistant), { ssr: false });
const DeferredMotion = dynamic(() => import("@/components/motion-orchestrator").then((module) => module.MotionOrchestrator), { ssr: false });

export function DeferredEnhancements() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [assistantEnabled, setAssistantEnabled] = useState(true);

  useEffect(() => {
    const activate = () => setReady(true);
    if ("requestIdleCallback" in window) {
      const idle = window.requestIdleCallback(activate, { timeout: 1800 });
      return () => window.cancelIdleCallback(idle);
    }
    const timeout = setTimeout(activate, 900);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/public/settings", { cache: "no-store", credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : null)
      .then((result: { settings?: { assistant_enabled?: string } } | null) => {
        if (active && result?.settings?.assistant_enabled === "false") setAssistantEnabled(false);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  return ready ? <><DeferredMotion />{!isAdmin && assistantEnabled ? <DeferredAssistant /> : null}</> : null;
}
