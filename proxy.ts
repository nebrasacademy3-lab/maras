import { NextRequest, NextResponse } from "next/server";

const mobilePaths = ["/api/mobile/", "/api/public/", "/api/catalog/", "/api/assistant", "/api/support", "/api/course-requests", "/api/favorites", "/api/cart", "/api/profile", "/api/progress", "/api/reviews", "/api/video/", "/api/admin/", "/api/supervisor/"];

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
    "access-control-allow-headers": "authorization,content-type,range,x-meras-client,x-meras-course,x-meras-lesson,x-meras-duration-seconds,x-meras-device-id,x-meras-device-label,x-meras-platform",
    "access-control-expose-headers": "accept-ranges,content-range,content-length",
    "access-control-max-age": "86400",
    "cross-origin-resource-policy": "cross-origin",
    vary: "Origin",
  };
}

export function proxy(request: NextRequest) {
  const applies = mobilePaths.some((path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(path));
  if (!applies) return NextResponse.next();
  const origin = request.headers.get("origin")?.trim();
  if (!origin || !acceptedOrigins(request).has(origin)) return NextResponse.next();
  if (request.method === "OPTIONS") return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(corsHeaders(origin))) response.headers.set(key, value);
  return response;
}

export const config = { matcher: "/api/:path*" };
