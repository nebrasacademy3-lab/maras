export const DASHBOARD_VIEWS = ["overview", "courses", "requests", "orders", "notifications", "support", "account"] as const;
export type DashboardView = typeof DASHBOARD_VIEWS[number];

export function dashboardView(value: string | null | undefined): DashboardView {
  return DASHBOARD_VIEWS.includes(value as DashboardView) ? value as DashboardView : "overview";
}

export function currentDashboardView(search: string): DashboardView {
  const params = new URLSearchParams(search);
  return params.get("payment") === "return" && /^[A-Za-z0-9._:-]{3,100}$/.test(params.get("order") || "") ? "orders" : dashboardView(params.get("view"));
}

/** The URL is the source of truth for the header, sidebar and browser history. */
export function dashboardHref(view: string, currentSearch = ""): string {
  const search = new URLSearchParams(currentSearch);
  const next = dashboardView(view);
  search.delete("error");
  if (next !== "orders") { search.delete("payment"); search.delete("order"); }
  if (next === "overview") search.delete("view");
  else search.set("view", next);
  return `/dashboard${search.size ? `?${search}` : ""}`;
}

export function navigationIsActive(href: string, pathname: string, search: string): boolean {
  if (href.includes("#")) return false;
  const [route, query = ""] = href.split("?");
  if (route !== pathname) return route !== "/" && route !== "/dashboard" && pathname.startsWith(`${route}/`);
  if (route !== "/dashboard") return true;
  const view = currentDashboardView(search);
  return view === dashboardView(new URLSearchParams(query).get("view"));
}
