import type { Href } from "expo-router";

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;
const SAFE_SLUG = /^[a-z0-9][a-z0-9._-]{0,79}$/i;

const STATIC_ASSISTANT_ROUTES: Readonly<Record<string, Href>> = {
  "/": "/(tabs)",
  "/login": "/(auth)/login",
  "/register": "/(auth)/register",
  "/forgot-password": "/forgot-password",
  "/universities": "/(tabs)/universities",
  "/request-course": "/requests",
  "/support": "/support",
  "/contact": "/contact",
  "/cart": "/cart",
  "/favorites": "/favorites",
  "/notifications": "/notifications",
  "/terms": "/terms",
  "/privacy": "/privacy",
  "/content-policy": "/content-policy",
  "/refund-policy": "/refund-policy",
  "/how-it-works": "/how-it-works",
  "/accessibility": "/accessibility",
  "/supervisor": "/supervisor",
  "/admin": "/admin",
};

const DASHBOARD_ASSISTANT_ROUTES: Readonly<Record<string, Href>> = {
  overview: "/(tabs)",
  courses: "/(tabs)/learning",
  learning: "/(tabs)/learning",
  requests: "/requests",
  orders: "/orders",
  notifications: "/notifications",
  support: "/support",
  account: "/(tabs)/account",
};

/** Normalizes a routed catalog search without letting control text reach the UI. */
export function sanitizeAssistantCourseQuery(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string") return "";
  return candidate
    .normalize("NFKC")
    .replace(CONTROL_CHARACTERS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function singleQueryValue(query: string, key: string) {
  if (!query || query.includes("?")) return null;
  const entries = Array.from(new URLSearchParams(query).entries());
  return entries.length === 1 && entries[0]?.[0] === key ? entries[0][1] : null;
}

function safeSlug(value: string) {
  if (!value || value.includes("/")) return null;
  try {
    const slug = decodeURIComponent(value);
    return SAFE_SLUG.test(slug) ? slug : null;
  } catch {
    return null;
  }
}

/**
 * Converts actions emitted by the web assistant to explicit Expo Router
 * destinations. Unknown or malformed internal paths are rejected instead of
 * being cast into the native router.
 */
export function resolveAssistantRoute(value: unknown): Href | string | null {
  if (
    typeof value !== "string"
    || !value
    || value.length > 500
    || value !== value.trim()
    || CONTROL_CHARACTER.test(value)
  ) return null;

  if (value.startsWith("https://")) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
    } catch {
      return null;
    }
  }

  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("#")) return null;

  const queryIndex = value.indexOf("?");
  const path = queryIndex === -1 ? value : value.slice(0, queryIndex);
  const query = queryIndex === -1 ? null : value.slice(queryIndex + 1);

  if (path === "/dashboard") {
    if (query === null) return "/(tabs)";
    const view = singleQueryValue(query, "view");
    return view ? DASHBOARD_ASSISTANT_ROUTES[view] ?? null : null;
  }

  if (path === "/courses") {
    if (query === null) return "/(tabs)/courses";
    const rawQuery = singleQueryValue(query, "q");
    if (rawQuery === null || CONTROL_CHARACTER.test(rawQuery)) return null;
    const q = sanitizeAssistantCourseQuery(rawQuery);
    return q ? { pathname: "/(tabs)/courses", params: { q } } : null;
  }

  if (path === "/supervisor" && query !== null) {
    return singleQueryValue(query, "view") === "requests" ? "/supervisor" : null;
  }

  if (query !== null) return null;

  const courseSlug = path.startsWith("/courses/") ? safeSlug(path.slice("/courses/".length)) : null;
  if (courseSlug) return { pathname: "/course/[slug]", params: { slug: courseSlug } };

  const learnSlug = path.startsWith("/learn/") ? safeSlug(path.slice("/learn/".length)) : null;
  if (learnSlug) return { pathname: "/learn/[slug]", params: { slug: learnSlug } };

  const universitySlug = path.startsWith("/universities/") ? safeSlug(path.slice("/universities/".length)) : null;
  if (universitySlug) return { pathname: "/university/[slug]", params: { slug: universitySlug } };

  return STATIC_ASSISTANT_ROUTES[path] ?? null;
}
