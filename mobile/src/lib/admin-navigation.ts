import { permissionsCover } from "./staff-policy";

export type AdminDestination = {
  id: string;
  title: string;
  description: string;
  href: string;
  nativeTab: string;
  permissions: readonly string[];
  view?: string;
};
export type AdminGroup = { id: string; title: string; description: string; items: readonly AdminDestination[] };
const destination = (id: string, title: string, href: string, nativeTab: string, permissions: string[], description = ""): AdminDestination => ({ id, title, href, nativeTab, permissions, description, ...(href.startsWith("/admin?view=") ? { view: href.split("=")[1] } : {}) });
/** Single navigation vocabulary. URLs remain compatible; rights are always rechecked by the server. */
export const ADMIN_NAVIGATION: readonly AdminGroup[] = [
  { id: "home", title: "الرئيسية", description: "المهام والمتابعة", items: [destination("overview", "نظرة عامة", "/admin", "overview", [], "ملخصاتك والعمليات التي تحتاج متابعة")] },
  { id: "education", title: "التعليم والمحتوى", description: "من الجامعة إلى الدرس", items: [
    destination("institutions", "الجامعات والكليات", "/admin?view=institutions", "catalog", ["catalog.view"]),
    destination("specialties", "التخصصات والربط", "/admin?view=specialties", "catalog", ["catalog.view"]),
    destination("courses", "المواد والأسعار", "/admin?view=courses", "catalog", ["catalog.view"]),
    destination("content", "الوحدات والدروس والفيديو", "/admin?view=content", "catalog", ["catalog.view"]),
    destination("resources", "ملفات الدروس", "/admin/course-resources", "catalog", ["catalog.view"]),
    destination("reviews", "مراجعة التقييمات", "/admin?view=reviews", "reviews", ["catalog.manage"]),
    destination("tracks", "المسارات وقوائم الاهتمام", "/admin/learning-tracks", "tracks", ["roadmap.manage"]),
  ] },
  { id: "students", title: "الطلاب والاشتراكات", description: "الملف والوصول والأجهزة", items: [
    destination("students", "الطلاب وملفاتهم", "/admin?view=students", "users", ["students.view"]),
    destination("subscriptions", "الاشتراكات والوصول", "/admin?view=subscriptions", "subscriptions", ["subscriptions.manage"]),
    destination("roster", "مشتركو المواد والانتظار", "/admin/courses", "roster", ["catalog.view", "students.view"]),
  ] },
  { id: "finance", title: "المبيعات والمالية", description: "كل عملية بسجل واضح", items: [
    destination("orders", "الطلبات والمدفوعات", "/admin?view=orders", "commerce", ["finance.view"]),
    destination("finance", "الاستردادات والتسويات", "/admin/finance", "finance", ["finance.view"]),
    destination("purchases", "مشتريات التطبيقات", "/admin/purchases", "purchases", ["finance.view"]),
    destination("bundles", "الباقات والعروض", "/admin/bundles", "bundles", ["catalog.view"]),
    destination("coupons", "الكوبونات", "/admin?view=coupons", "commerce", ["finance.manage"]),
  ] },
  { id: "communication", title: "التواصل والتسويق", description: "الدعم والطلبات والإحالات", items: [
    destination("support", "تذاكر الدعم", "/admin?view=support", "support", ["support.manage"]),
    destination("requests", "طلبات توفير المواد", "/admin?view=requests", "requests", ["requests.manage"]),
    destination("notifications", "الإعلانات والإشعارات", "/admin?view=notifications", "communication", ["notifications.manage"]),
    destination("referrals", "الإحالات والمكافآت", "/admin/referrals", "referrals", ["referrals.manage"]),
    destination("partners", "الشركاء والبيانات المثبتة", "/admin/partners", "partners", ["content.manage"]),
  ] },
  { id: "website", title: "الموقع والهوية", description: "المحتوى العام والاكتشاف", items: [
    destination("pages", "الصفحات والأسئلة الشائعة", "/admin/content", "pages", ["content.manage"]),
    destination("settings", "الهوية والتواصل والإعدادات", "/admin?view=settings", "settings", ["settings.manage"]),
    destination("seo", "البحث واكتشاف مراس", "/admin/seo", "seo", ["seo.manage"]),
  ] },
  { id: "security", title: "الفريق والأمان", description: "صلاحية واضحة لكل مسؤولية", items: [
    destination("staff", "المشرفون والصلاحيات", "/admin/staff", "staff", ["staff.manage"]),
    destination("audit", "سجل التدقيق", "/admin?view=audit", "audit", ["audit.view"]),
  ] },
  { id: "operations", title: "التشغيل والإعدادات", description: "صحة الخدمات والمهام", items: [
    destination("operations", "مهام التشغيل وصحة الخدمات", "/admin/operations", "operations", ["operations.manage"]),
    destination("files", "فحص الملفات والحجر", "/admin/files", "files", ["operations.manage"]),
    destination("ai", "أدوات مراس وموارد Gemini", "/admin/ai", "ai", ["ai.manage"]),
  ] },
];
export const ADMIN_SELF_SECURITY = destination("security", "حسابي وأماني", "/admin/security", "security", []);
export function visibleAdminNavigation(permissions: readonly string[], owner: boolean): AdminGroup[] {
  const grants = new Set(permissions);
  return ADMIN_NAVIGATION.map(group => ({ ...group, items: group.items.filter(item => owner || permissionsCover(grants, item.permissions)) })).filter(group => group.items.length > 0);
}
export function activeAdminDestination(pathname: string, view: string | null = null) {
  const path = pathname.replace(/\/$/, "") || "/admin";
  if (path === "/admin/security") return { group: null, item: ADMIN_SELF_SECURITY };
  for (const group of ADMIN_NAVIGATION) for (const item of group.items) {
    if (path === "/admin" ? item.id === (view || "overview") : !item.view && item.href !== "/admin" && (path === item.href || path.startsWith(item.href + "/"))) return { group, item };
  }
  if (path.startsWith("/admin/students/")) return { group: ADMIN_NAVIGATION[2]!, item: ADMIN_NAVIGATION[2]!.items[0]! };
  return null;
}
export function searchAdminNavigation(groups: readonly AdminGroup[], search: string) {
  const query = search.trim().toLocaleLowerCase("ar");
  return groups.flatMap(group => group.items.map(item => ({...item, groupTitle: group.title})))
    .filter(item => `${item.title} ${item.description} ${item.groupTitle}`.toLocaleLowerCase("ar").includes(query));
}
