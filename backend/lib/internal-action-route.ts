const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const SAFE_SLUG = /^[a-z0-9][a-z0-9._-]{0,79}$/i;

/**
 * Canonical announcement/notification destinations. Every entry has a real
 * web route and an explicit equivalent in the native route resolver.
 */
export const INTERNAL_ACTION_OPTIONS = [
  { value: "/courses", label: "استكشاف المواد" },
  { value: "/universities", label: "الجامعات والكليات" },
  { value: "/request-course", label: "طلب مادة" },
  { value: "/support", label: "الدعم" },
  { value: "/contact", label: "التواصل" },
  { value: "/cart", label: "السلة" },
  { value: "/favorites", label: "المفضلة" },
  { value: "/notifications", label: "الإشعارات" },
  { value: "/dashboard", label: "لوحة الطالب" },
  { value: "/dashboard?view=learning", label: "موادي" },
  { value: "/dashboard?view=requests", label: "طلبات المواد" },
  { value: "/dashboard?view=orders", label: "الطلبات والفواتير" },
  { value: "/dashboard?view=notifications", label: "إشعارات الحساب" },
  { value: "/dashboard?view=support", label: "محادثات الدعم" },
  { value: "/dashboard?view=account", label: "إعدادات الحساب" },
  { value: "/supervisor", label: "مساحة المشرف" },
  { value: "/supervisor?view=requests", label: "طلبات المشرف" },
  { value: "/admin", label: "لوحة الإدارة" },
  { value: "/login", label: "تسجيل الدخول" },
  { value: "/register", label: "إنشاء حساب" },
] as const;

const STATIC_ACTIONS = new Set<string>(INTERNAL_ACTION_OPTIONS.map((option) => option.value).filter((value) => !value.includes("?")));
const DASHBOARD_VIEWS = new Set<string>(["learning", "requests", "orders", "notifications", "support", "account"]);

function singleQueryValue(query: string, key: string) {
  if (!query || query.includes("?")) return null;
  const entries = Array.from(new URLSearchParams(query).entries());
  return entries.length === 1 && entries[0]?.[0] === key ? entries[0][1] : null;
}

function safeDynamicPath(path: string) {
  for (const prefix of ["/courses/", "/universities/", "/learn/"] as const) {
    if (!path.startsWith(prefix)) continue;
    const encodedSlug = path.slice(prefix.length);
    if (!encodedSlug || encodedSlug.includes("/")) return null;
    try {
      const slug = decodeURIComponent(encodedSlug);
      return SAFE_SLUG.test(slug) ? `${prefix}${slug}` : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Validates and canonicalizes a route emitted by admin-created campaigns.
 * External origins, browser-normalized backslashes, fragments, unexpected
 * queries, and routes without a native equivalent are rejected.
 */
export function normalizeInternalActionPath(value: unknown): string | null {
  if (
    typeof value !== "string"
    || !value
    || value.length > 300
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

  if (query === null) return STATIC_ACTIONS.has(path) ? path : safeDynamicPath(path);
  if (path === "/dashboard") {
    const view = singleQueryValue(query, "view");
    return view && DASHBOARD_VIEWS.has(view) ? `/dashboard?view=${view}` : null;
  }
  if (path === "/supervisor") {
    return singleQueryValue(query, "view") === "requests" ? "/supervisor?view=requests" : null;
  }
  return null;
}
