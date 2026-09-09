"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MotionOrchestrator } from "./motion-orchestrator";

const DeferredAssistant = dynamic(() => import("@/components/meras-assistant").then((module) => module.MerasAssistant), { ssr: false });

export function DeferredEnhancements() {
  const pathname = usePathname();
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
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  return <><MotionOrchestrator />{ready && !isAdmin && <DeferredAssistant />}</>;
}
