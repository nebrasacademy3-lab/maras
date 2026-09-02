import { NextRequest, NextResponse } from "next/server";
import { ensureRequestId, logEvent, REQUEST_ID_HEADER } from "@/lib/observability";

const mobilePaths = ["/api/mobile/", "/api/public/", "/api/catalog/", "/api/assistant", "/api/support", "/api/course-requests", "/api/favorites", "/api/cart", "/api/waitlist", "/api/profile", "/api/progress", "/api/reviews", "/api/video/", "/api/invoices/", "/api/admin/", "/api/supervisor/", "/api/ai/", "/api/auth/", "/api/checkout", "/api/coupons/", "/api/referrals", "/api/sync", "/api/learning-tracks/", "/api/analytics"];

function acceptedOrigins(request: NextRequest) {
  const values = new Set<string>([request.nextUrl.origin]);
  for (const configured of [process.env.APP_URL, process.env.NEXT_PUBLIC_SITE_URL, process.env.MOBILE_APP_URL, process.env.EXPO_WEB_ORIGIN]) {
    if (!configured) continue;
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") values.add(parsed.origin);
    } catch { /* Invalid optional values are ignored. */ }
  }
  if (process.env.NODE_ENV !== "production") {
    values.add("http://localhost:8081");
    values.add("http://127.0.0.1:8081");
  }
  return values;
}

function corsHeaders(origin: string) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,range,x-meras-client,x-meras-course,x-meras-lesson,x-meras-duration-seconds,x-meras-device-id,x-meras-device-label,x-meras-platform,x-meras-admin-stepup,x-request-id",
    "access-control-expose-headers": "accept-ranges,content-range,content-length,x-request-id",
    "access-control-max-age": "86400",
    "cross-origin-resource-policy": "cross-origin",
    vary: "Origin",
  };
}

export function proxy(request: NextRequest) {
  const requestId = ensureRequestId(request.headers);
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.set(REQUEST_ID_HEADER, requestId);
  const applies = mobilePaths.some((path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(path));
  const origin = request.headers.get("origin")?.trim();
  const corsOrigin = applies && origin && acceptedOrigins(request).has(origin) ? origin : "";
  if (request.method === "OPTIONS" && corsOrigin) {
    const response = new NextResponse(null, { status: 204, headers: corsHeaders(corsOrigin) });
    response.headers.set(REQUEST_ID_HEADER, requestId);
    logEvent("info", "http.request.preflight", { requestId, method: request.method, path: request.nextUrl.pathname, status: 204 });
    return response;
  }
  const response = NextResponse.next({ request: { headers: forwardedHeaders } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  if (corsOrigin) for (const [key, value] of Object.entries(corsHeaders(corsOrigin))) response.headers.set(key, value);
  logEvent("info", "http.request.accepted", { requestId, method: request.method, path: request.nextUrl.pathname });
  return response;
}

export const config = { matcher: "/api/:path*" };
