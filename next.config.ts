import type { NextConfig } from "next";

const loopbackQa = process.env.MARAS_LOOPBACK_QA === "true" && process.env.CI === "true" && process.env.GITHUB_ACTIONS === "true" && !process.env.RAILWAY_PROJECT_ID && !process.env.RAILWAY_ENVIRONMENT_ID;

// Public TLS is terminated by the trusted edge, which must overwrite
// X-Forwarded-Proto. Never derive a redirect destination from request headers.
const productionTransport = process.env.NODE_ENV === "production" && !loopbackQa;
const publicHttpsOrigins = [...new Set([process.env.APP_URL, process.env.NEXT_PUBLIC_SITE_URL].flatMap((value) => {
  if (!value) return [];
  try {
    const url = new URL(value);
    const host = url.hostname;
    const dnsHost = host.length <= 253 && host.includes(".") && host.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash
      || !dnsHost || /^[\d.]+$/.test(host) || /(?:^|\.)(?:localhost|local|internal|invalid)$/.test(host)) return [];
    return [url.origin];
  } catch { return []; }
}))];

// Explicit private namespaces avoid changing public catalog/media cache behavior.
const privatePageRoots = [
  "admin", "supervisor", "instructor", "dashboard", "complete-profile", "verify-email", "onboarding",
  "login", "register", "forgot-password", "reset-password", "cart", "checkout", "invoices",
  "favorites", "notifications", "referrals", "learn", "meras-ai", "study-tools", "request-course",
];
const privateApiRoots = [
  "auth", "admin", "supervisor", "instructor", "profile", "cart", "checkout", "coupons", "favorites", "progress",
  "invoices", "referrals", "ai", "course-requests", "course-resources", "support",
];
const privateMobileRoots = ["auth", "account", "dashboard", "favorites", "notes", "notifications", "push"];
const privateResponseHeaders = [
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];

const nextConfig: NextConfig = {
  // Keep metadata in the initial head for browsers and crawlers alike.
  htmlLimitedBots: /.*/,
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  serverExternalPackages: ["playwright-core", "katex"],
  outputFileTracingIncludes: { "/api/**": ["./emails/resend/*.html"] },
  experimental: {
    proxyClientMaxBodySize: "220mb",
  },
  async redirects() {
    if (!productionTransport) return [];
    return publicHttpsOrigins.map((origin) => ({
      source: "/:path*",
      // Match the configured host exactly, including literal dots.
      has: [
        { type: "host" as const, value: new URL(origin).hostname.replace(/\./g, "\\.") },
        { type: "header" as const, key: "x-forwarded-proto", value: "http" },
      ],
      destination: `${origin}/:path*`,
      // 308 preserves POST bodies for OAuth callbacks, payments and webhooks.
      permanent: true,
    }));
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), fullscreen=(self), display-capture=(), picture-in-picture=()" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          { key: "Origin-Agent-Cluster", value: loopbackQa ? "?0" : "?1" },
          { key: "Cross-Origin-Opener-Policy", value: loopbackQa ? "unsafe-none" : "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: process.env.NODE_ENV === "production" && !loopbackQa ? "same-origin" : "cross-origin" },
          ...(loopbackQa ? [
            { key: "Access-Control-Allow-Origin", value: "http://127.0.0.1:3100" },
            { key: "Access-Control-Allow-Credentials", value: "true" },
          ] : []),
        ],
      },
      // HSTS is meaningful only on HTTPS and must not persist for local QA.
      // Preserve the existing subdomain policy; preload requires a separate audit.
      ...(productionTransport ? [{
        source: "/:path*",
        has: [{ type: "header" as const, key: "x-forwarded-proto", value: "https" }],
        headers: [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }],
      }] : []),
      {
        source: "/api/video/:path*",
        headers: [
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/brand/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
      {
        source: "/institutions/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
      // Only public email artwork can be embedded by mail clients; private
      // account, API and course assets keep their existing protection.
      {
        source: "/email-assets/:path*",
        headers: [
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
      ...["/brand/logo-light-hq.png", "/brand/mark-light.png", "/brand/app-icon.png"].map((source) => ({
        source,
        headers: [{ key: "Cross-Origin-Resource-Policy", value: "cross-origin" }, { key: "Access-Control-Allow-Origin", value: "*" }],
      })),
      { source: "/instructor/:path*", headers: [{ key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), fullscreen=(self), display-capture=(), picture-in-picture=()" }] },
      ...privatePageRoots.map((root) => ({ source: `/${root}/:path*`, headers: privateResponseHeaders })),
      ...privateApiRoots.map((root) => ({ source: `/api/${root}/:path*`, headers: privateResponseHeaders })),
      ...privateMobileRoots.map((root) => ({ source: `/api/mobile/${root}/:path*`, headers: privateResponseHeaders })),
    ];
  },
};

export default nextConfig;
