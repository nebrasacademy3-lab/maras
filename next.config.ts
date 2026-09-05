import type { NextConfig } from "next";

const developmentScriptSource = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${developmentScriptSource}`,
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self' https://api.tap.company https://*.tap.company",
  "frame-src 'self' https://*.tap.company",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

// Explicit private namespaces avoid changing public catalog/media cache behavior.
const privatePageRoots = [
  "admin", "supervisor", "dashboard", "complete-profile", "verify-email", "onboarding",
  "login", "register", "forgot-password", "reset-password", "cart", "checkout", "invoices",
  "favorites", "notifications", "referrals", "learn", "meras-ai", "study-tools", "request-course",
];
const privateApiRoots = [
  "auth", "admin", "supervisor", "profile", "cart", "checkout", "coupons", "favorites", "progress",
  "invoices", "referrals", "ai", "course-requests", "course-resources", "support",
];
const privateMobileRoots = ["auth", "account", "dashboard", "favorites", "notes", "notifications", "push"];
const privateResponseHeaders = [
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  experimental: {
    proxyClientMaxBodySize: "220mb",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), fullscreen=(self), display-capture=(), picture-in-picture=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
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
      ...privatePageRoots.map((root) => ({ source: `/${root}/:path*`, headers: privateResponseHeaders })),
      ...privateApiRoots.map((root) => ({ source: `/api/${root}/:path*`, headers: privateResponseHeaders })),
      ...privateMobileRoots.map((root) => ({ source: `/api/mobile/${root}/:path*`, headers: privateResponseHeaders })),
    ];
  },
};

export default nextConfig;
