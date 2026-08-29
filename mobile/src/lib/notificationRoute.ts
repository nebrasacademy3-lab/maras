import type { Href } from "expo-router";

const STATIC_NOTIFICATION_ROUTES: Readonly<Record<string, Href>> = {
  "/dashboard": "/(tabs)",
  "/login": "/(auth)/login",
  "/register": "/(auth)/register",
  "/courses": "/(tabs)/courses",
  "/universities": "/(tabs)/universities",
  "/support": "/support",
  "/requests": "/requests",
  "/request-course": "/requests",
  "/learning": "/(tabs)/learning",
  "/notifications": "/notifications",
  "/cart": "/cart",
  "/favorites": "/favorites",
  "/supervisor": "/supervisor",
  "/admin": "/admin",
  "/contact": "/contact",
  "/profile": "/profile",
};

const DASHBOARD_NOTIFICATION_ROUTES: Readonly<Record<string, Href>> = {
  learning: "/(tabs)/learning",
  notifications: "/notifications",
  account: "/(tabs)/account",
  requests: "/requests",
  orders: "/orders",
  support: "/support",
};

const ROUTE_SLUG = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/**
 * Converts notification routes emitted by the server to known Expo Router
 * destinations. Anything external, malformed, or outside the allowlist is
 * deliberately rejected.
 */
export function resolveNotificationRoute(value: unknown): Href | null {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
    || !value.startsWith("/")
    || value.startsWith("//")
    || value.includes("\\")
    || value.includes("#")
    || CONTROL_CHARACTER.test(value)
  ) return null;

  const queryIndex = value.indexOf("?");
  const path = queryIndex === -1 ? value : value.slice(0, queryIndex);
  const query = queryIndex === -1 ? null : value.slice(queryIndex + 1);

  if (query?.includes("?")) return null;

  if (path === "/dashboard") {
    if (query === null) return STATIC_NOTIFICATION_ROUTES[path] ?? null;
    const entries = Array.from(new URLSearchParams(query).entries());
    const entry = entries[0];
    if (entries.length !== 1 || !entry || entry[0] !== "view") return null;
    return DASHBOARD_NOTIFICATION_ROUTES[entry[1]] ?? null;
  }

  if (path === "/supervisor" && query !== null) {
    const entries = Array.from(new URLSearchParams(query).entries());
    const entry = entries[0];
    return entries.length === 1 && entry?.[0] === "view" && entry[1] === "requests" ? "/supervisor" : null;
  }

  if (query !== null) return null;

  const detailRoute = (prefix: "/courses/" | "/universities/", pathname: "/course/[slug]" | "/university/[slug]") => {
    if (!path.startsWith(prefix)) return null;
    const encodedSlug = path.slice(prefix.length);
    if (!encodedSlug || encodedSlug.includes("/")) return null;
    try {
      const slug = decodeURIComponent(encodedSlug);
      return ROUTE_SLUG.test(slug) ? { pathname, params: { slug } } as Href : null;
    } catch {
      return null;
    }
  };

  if (path.startsWith("/courses/")) return detailRoute("/courses/", "/course/[slug]");
  if (path.startsWith("/universities/")) return detailRoute("/universities/", "/university/[slug]");

  if (path.startsWith("/learn/")) {
    const encodedSlug = path.slice("/learn/".length);
    if (!encodedSlug || encodedSlug.includes("/")) return null;

    try {
      const slug = decodeURIComponent(encodedSlug);
      if (!ROUTE_SLUG.test(slug)) return null;
      return { pathname: "/learn/[slug]", params: { slug } };
    } catch {
      return null;
    }
  }

  return STATIC_NOTIFICATION_ROUTES[path] ?? null;
}
