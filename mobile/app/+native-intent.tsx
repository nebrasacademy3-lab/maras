import { API_URL } from "@/src/lib/api";
import { resolveAppAction, parseInternalLink } from "@/src/lib/notification-routing";

/** OS links use website paths, which are not always Expo Router paths. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    let internal = path;
    if (/^merasalelm:\/\//i.test(path)) {
      const url = new URL(path);
      if (url.username || url.password || url.port) return "/(tabs)";
      internal = (url.hostname ? "/" + url.hostname : "") + url.pathname + url.search;
    } else if (/^https:\/\//i.test(path)) {
      const url = new URL(path);
      if (url.origin !== new URL(API_URL).origin || url.username || url.password) return "/(tabs)";
      internal = url.pathname + url.search;
    }
    // A PKCE code is consumed only by the in-memory auth-session handler, never here.
    const parsed = parseInternalLink(internal);
    if (parsed?.pathname === "/oauth/callback") return "/oauth/callback";
    const action = resolveAppAction(internal, { apiUrl: API_URL, directCommerce: false });
    if (!action || !("route" in action)) return "/(tabs)";
    if (typeof action.route === "string") return action.route;
    let pathname = String(action.route.pathname);
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(action.route.params || {})) {
      if (value === undefined || value === null) continue;
      if (pathname.includes(`[${key}]`)) pathname = pathname.replace(`[${key}]`, encodeURIComponent(String(value)));
      else query.set(key, String(value));
    }
    return pathname + (query.size ? `?${query}` : "");
  } catch { return "/(tabs)"; }
}
