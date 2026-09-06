/** Shared URL contract: header, sidebar, deep links and browser history agree. */
export const DASHBOARD_VIEWS = ["overview", "courses", "requests", "orders", "notifications", "support", "account"] as const;
export type DashboardView = typeof DASHBOARD_VIEWS[number];
export function dashboardView(value: unknown): DashboardView {
  return typeof value === "string" && (DASHBOARD_VIEWS as readonly string[]).includes(value) ? value as DashboardView : "overview";
}
export function dashboardHref(view: unknown) {
  const resolved = dashboardView(view);
  return resolved === "overview" ? "/dashboard" : `/dashboard?view=${resolved}`;
}
export function navigationIsActive(href: string, pathname: string, query: string) {
  // A section anchor is not the current page merely because its pathname matches.
  if (href.includes("#")) return false;
  const target = new URL(href, "https://navigation.invalid");
  if (target.pathname === "/dashboard") {
    if (pathname !== "/dashboard") return false;
    const current = new URLSearchParams(query);
    const view = current.get("payment") === "return" && current.get("order") ? "orders" : dashboardView(current.get("view"));
    return view === dashboardView(target.searchParams.get("view"));
  }
  return pathname === target.pathname || (target.pathname !== "/" && pathname.startsWith(`${target.pathname}/`));
}
