"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const DeferredAssistant = dynamic(() => import("@/components/meras-assistant").then((module) => module.MerasAssistant), { ssr: false });
const DeferredMotion = dynamic(() => import("@/components/motion-orchestrator").then((module) => module.MotionOrchestrator), { ssr: false });

export function DeferredEnhancements() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const activate = () => setReady(true);
    if ("requestIdleCallback" in window) {
      const idle = window.requestIdleCallback(activate, { timeout: 1800 });
      return () => window.cancelIdleCallback(idle);
    }
    const timeout = setTimeout(activate, 900);
    return () => clearTimeout(timeout);
  }, []);
  return ready ? <><DeferredMotion /><DeferredAssistant /></> : null;
}
