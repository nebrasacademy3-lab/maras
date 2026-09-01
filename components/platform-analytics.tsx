"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type AnalyticsMetadata = Record<string, string | number | boolean | undefined>;
type AnalyticsDetail = { event: string; courseSlug?: string; metadata?: AnalyticsMetadata };

const storageKey = "meras-anonymous-id";

function anonymousId() {
  try {
    const existing = localStorage.getItem(storageKey);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(storageKey, created);
    return created;
  } catch { return ""; }
}

function send(detail: AnalyticsDetail) {
  const body = JSON.stringify({ ...detail, anonymousId: anonymousId() });
  void fetch("/api/analytics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => undefined);
}

export function trackPlatformEvent(event: string, detail: Omit<AnalyticsDetail, "event"> = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AnalyticsDetail>("meras:analytics", { detail: { event, ...detail } }));
}

export function PlatformAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    const courseMatch = pathname.match(/^\/courses\/([^/]+)/);
    send({ event: courseMatch ? "course_view" : "page_view", courseSlug: courseMatch?.[1], metadata: { path: pathname } });
  }, [pathname]);

  useEffect(() => {
    const custom = (event: Event) => send((event as CustomEvent<AnalyticsDetail>).detail);
    const click = (event: MouseEvent) => {
      const element = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-analytics-event]");
      if (!element) return;
      const name = element.dataset.analyticsEvent;
      if (!name) return;
      send({
        event: name,
        courseSlug: element.dataset.courseSlug,
        metadata: { placement: element.dataset.analyticsPlacement, path: location.pathname },
      });
    };
    window.addEventListener("meras:analytics", custom);
    document.addEventListener("click", click, { capture: true });
    return () => {
      window.removeEventListener("meras:analytics", custom);
      document.removeEventListener("click", click, { capture: true });
    };
  }, []);

  return null;
}
