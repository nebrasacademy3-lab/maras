"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { startMotionOrchestrator } from "@/lib/motion-runtime";

/** Enhance [data-home-reveal] and shared page content; clean up on every navigation. */
export function MotionOrchestrator() {
  const pathname = usePathname();
  useEffect(() => startMotionOrchestrator(document), [pathname]);
  return null;
}
