const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const RETURN_BASE = "https://meras.internal";

export const DASHBOARD_VIEW_IDS = ["overview", "learning", "requests", "orders", "notifications", "support", "account"] as const;
export type DashboardViewId = typeof DASHBOARD_VIEW_IDS[number];

export function normalizeDashboardView(value: unknown): DashboardViewId {
  return typeof value === "string" && (DASHBOARD_VIEW_IDS as readonly string[]).includes(value)
    ? value as DashboardViewId
    : "overview";
}

export function dashboardReturnPath(value: unknown) {
  const view = normalizeDashboardView(value);
  return view === "overview" ? "/dashboard" : `/dashboard?view=${encodeURIComponent(view)}`;
}

/**
 * Normalizes a post-authentication destination without ever permitting an
 * external origin. The URL parser also catches browser-normalized backslash
 * forms such as `/\\evil.example` that simple `startsWith` checks miss.
 */
export function safeInternalReturnPath(value: unknown, fallback = "") {
  if (
    typeof value !== "string"
    || !value
    || value.length > 2_048
    || value !== value.trim()
    || !value.startsWith("/")
    || value.startsWith("//")
    || value.includes("\\")
    || CONTROL_CHARACTER.test(value)
  ) return fallback;

  try {
    const url = new URL(value, RETURN_BASE);
    if (url.origin !== RETURN_BASE || !url.pathname.startsWith("/")) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
