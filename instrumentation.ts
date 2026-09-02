import type { Instrumentation } from "next";
import { logEvent, pathnameOnly, requestIdFromHeaders } from "./lib/observability";

export async function register() {
  logEvent("info", "service.runtime.started", {
    runtime: process.env.NEXT_RUNTIME || "unknown",
    environment: process.env.NODE_ENV || "unknown",
  });
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    try {
      const { startLifecycleScheduler } = await import("./lib/lifecycle-scheduler");
      startLifecycleScheduler();
    } catch (caught) {
      logEvent("warn", "lifecycle.scheduler.unavailable", { errorType: caught instanceof Error ? caught.name : "UnknownError" });
    }
  }
}

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const digest = typeof error === "object" && error !== null && "digest" in error
    ? String((error as { digest?: unknown }).digest || "").slice(0, 128)
    : undefined;
  logEvent("error", "next.request.error", {
    requestId: requestIdFromHeaders(request.headers),
    method: request.method,
    path: pathnameOnly(request.path),
    route: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    errorType: error instanceof Error ? error.name : "UnknownError",
    digest,
  });
};
