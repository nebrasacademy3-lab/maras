import { router, type Href } from "expo-router";
import { Linking } from "react-native";

const INTERNAL_ORIGIN = "https://mobile.meras.invalid";

export function safeInternalPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || /^\/[\\]/.test(trimmed)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  if (/[\u0000-\u001f\u007f\s]/.test(trimmed)) return null;
  return trimmed;
}

function routeSegment(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return decoded && decoded !== "." && decoded !== ".." && !/[\/\\%?#\u0000-\u001f\u007f\s]/.test(decoded) ? decoded : null;
  } catch { return null; }
}

export function parseInternalLink(value: unknown): URL | null {
  const path = safeInternalPath(value);
  if (!path) return null;
  // Validate before URL normalizes dot segments, and before Expo decodes route parameters again.
  const pathname = path.split(/[?#]/, 1)[0] || "/";
  if (pathname.split("/").slice(1).some((segment) => segment && !routeSegment(segment))) return null;
  try {
    const url = new URL(path, INTERNAL_ORIGIN);
    return url.origin === INTERNAL_ORIGIN && !url.username && !url.password ? url : null;
  } catch { return null; }
}

export function safeExternalLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null; }
  catch { return null; }
}

/** One web-to-app mapping for notifications and assistant actions. */
export function resolveMobileRoute(value: unknown): Href | null {
  const url = parseInternalLink(value);
  if (!url) return null;
  const path = url.pathname.replace(/\/$/, "") || "/";
  const query = url.searchParams;
  if (path === "/study-tools" || path.startsWith("/study-tools/")) {
    const conversationId = query.get("conversation")?.trim();
    const quizId = query.get("quiz")?.trim();
    if (conversationId && /^[A-Za-z0-9_-]{1,120}$/.test(conversationId)) return { pathname: "/ai/conversation/[id]", params: { id: conversationId } };
    if (quizId && /^[A-Za-z0-9_-]{1,120}$/.test(quizId)) return { pathname: "/ai/quiz/[id]", params: { id: quizId } };
    return "/(tabs)/ai";
  }
  if (path === "/") return "/(tabs)";
  if (path === "/tracks" || path === "/learning-tracks" || path.startsWith("/tracks/") || path.startsWith("/learning-tracks/")) return "/tracks";
  const routes = [
    { prefix: "/r/", pathname: "/r/[code]", param: "code" },
    { prefix: "/learn/", pathname: "/learn/[slug]", param: "slug" },
    { prefix: "/courses/", pathname: "/course/[slug]", param: "slug" },
    { prefix: "/course/", pathname: "/course/[slug]", param: "slug" },
    { prefix: "/universities/", pathname: "/university/[slug]", param: "slug" },
    { prefix: "/university/", pathname: "/university/[slug]", param: "slug" },
  ] as const;
  for (const route of routes) {
    if (!path.startsWith(route.prefix)) continue;
    const segment = routeSegment(path.slice(route.prefix.length));
    return segment ? { pathname: route.pathname, params: { [route.param]: segment } } as Href : null;
  }
  if (path === "/dashboard") {
    const views: Record<string, Href> = { notifications: "/notifications", account: "/profile", requests: "/requests", orders: "/orders", courses: "/(tabs)/learning" };
    return views[query.get("view") || ""] || "/(tabs)";
  }
  const simple: Record<string, Href> = {
    "/courses": "/(tabs)/courses", "/universities": "/(tabs)/universities", "/learn": "/(tabs)/learning",
    "/request-course": "/requests", "/login": "/(auth)/login", "/register": "/(auth)/register",
  };
  if (simple[path]) return (simple[path] + url.search) as Href;
  if (["/contact", "/support", "/requests", "/notifications", "/referrals", "/cart", "/favorites", "/orders", "/profile", "/security", "/admin", "/supervisor", "/forgot-password", "/verify-email", "/complete-profile", "/onboarding", "/assistant", "/(tabs)/account", "/(tabs)/learning", "/(tabs)/courses", "/(tabs)/universities", "/(tabs)/ai"].includes(path)) return (path + url.search) as Href;
  return null;
}

export function openNotificationRoute(actionUrl: unknown) {
  const external = safeExternalLink(actionUrl);
  if (external) { void Linking.openURL(external).catch(() => undefined); return; }
  const route = resolveMobileRoute(actionUrl);
  if (route) router.push(route);
}
