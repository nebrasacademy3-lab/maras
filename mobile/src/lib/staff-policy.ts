/** Shared finite capability vocabulary. Never accept a client-supplied role as authority. */
export const ADMIN_PERMISSIONS = {
  CATALOG_VIEW: "catalog.view", CATALOG_MANAGE: "catalog.manage",
  STUDENTS_VIEW: "students.view", STUDENTS_MANAGE: "students.manage",
  DEVICES_VIEW: "students.devices.view", DEVICES_MANAGE: "students.devices.manage",
  SUBSCRIPTIONS_MANAGE: "subscriptions.manage", REQUESTS_MANAGE: "requests.manage", SUPPORT_MANAGE: "support.manage",
  SETTINGS_MANAGE: "settings.manage", SEO_MANAGE: "seo.manage", CONTENT_MANAGE: "content.manage",
  STAFF_MANAGE: "staff.manage", AUDIT_VIEW: "audit.view", OPERATIONS_MANAGE: "operations.manage",
  FINANCE_VIEW: "finance.view", FINANCE_EXPORT: "finance.export", FINANCE_MANAGE: "finance.manage",
  NOTIFICATIONS_MANAGE: "notifications.manage", NOTIFICATIONS_DISPATCH: "notifications.dispatch",
  RECORDS_DELETE: "records.delete", COMPLIANCE_VIEW: "compliance.view", COMPLIANCE_MANAGE: "compliance.manage",
  SECURITY_MANAGE_SELF: "security.manage_self", AI_MANAGE: "ai.manage", REFERRALS_MANAGE: "referrals.manage", ROADMAP_MANAGE: "roadmap.manage",
} as const;
export type AdminPermission = typeof ADMIN_PERMISSIONS[keyof typeof ADMIN_PERMISSIONS];
export const OWNER_ONLY = new Set<string>(["staff.manage", "audit.view"]);
export const PERMISSION_LABELS: Record<AdminPermission, string> = {
  "catalog.view": "عرض المواد والجهات والتخصصات", "catalog.manage": "إدارة المواد والدروس والملفات",
  "students.view": "عرض الطلاب", "students.manage": "تعديل بيانات الطلاب", "students.devices.view": "عرض أجهزة الطلاب", "students.devices.manage": "إدارة أجهزة الطلاب والجلسات وسياسة العودة", "subscriptions.manage": "إدارة الاشتراكات",
  "requests.manage": "طلبات المواد", "support.manage": "الدعم والتذاكر", "settings.manage": "إعدادات المنصة", "seo.manage": "الظهور والاكتشاف",
  "content.manage": "محتوى الصفحات العامة", "staff.manage": "المشرفون — المدير الأعلى فقط", "audit.view": "سجل التدقيق — المدير الأعلى فقط",
  "operations.manage": "تشغيل المهام وفحص الملفات", "finance.view": "عرض المالية", "finance.export": "تصدير المالية", "finance.manage": "إدارة المدفوعات والاسترداد",
  "notifications.manage": "إنشاء الإعلانات والإشعارات", "notifications.dispatch": "إرسال الإشعارات", "records.delete": "الحذف ضمن الأقسام الممنوحة",
  "compliance.view": "عرض الامتثال", "compliance.manage": "إدارة الامتثال", "security.manage_self": "حماية الحساب الشخصي", "ai.manage": "إدارة أدوات الذكاء الاصطناعي",
  "referrals.manage": "إدارة الإحالات والمكافآت", "roadmap.manage": "إدارة المسارات والخطة",
};
export function validStaffGrants(values: unknown): values is AdminPermission[] {
  return Array.isArray(values) && values.length <= Object.keys(ADMIN_PERMISSIONS).length && values.every(value => typeof value === "string" && Object.values(ADMIN_PERMISSIONS).includes(value as AdminPermission) && !OWNER_ONLY.has(value));
}
export function permissionsCover(grants: ReadonlySet<string>, required: readonly string[]) {
  return required.every(permission => grants.has(permission) || permission.endsWith(".view") && grants.has(permission.replace(/\.view$/, ".manage")));
}
const READ = new Set(["GET", "HEAD"]);
/** null means unknown/denied. Empty means a staff member's own shell/security, never business data. */
export function requiredRoutePermissions(path: string, method = "GET"): string[] | null {
  const read = READ.has(method.toUpperCase());
  if (["/api/admin/me", "/api/admin/console", "/api/admin/security/mfa"].includes(path)) return [];
  if (path === "/api/admin/videos/direct") return ["catalog.manage"];
  if (path === "/api/admin/staff") return ["staff.manage"];
  if (/^\/api\/admin\/(finance|refunds|settlements|purchases)(\/|$)/.test(path)) return [read ? "finance.view" : "finance.manage"];
  if (/^\/api\/admin\/students\/[^/]+\/devices$/.test(path)) return [read ? "students.devices.view" : "students.devices.manage"];
  if (/^\/api\/admin\/students\//.test(path)) return [read ? "students.view" : "students.manage"];
  if (/^\/api\/admin\/courses\//.test(path)) return ["catalog.view", "students.view"];
  if (/^\/api\/admin\/(course-resources|bundles|covers|logos|videos)(\/|$)/.test(path)) return [read ? "catalog.view" : "catalog.manage", ...(method === "DELETE" ? ["records.delete"] : [])];
  if (path === "/api/admin/partners") return ["content.manage"];
  if (/^\/api\/admin\/course-requests\//.test(path) || /^\/api\/supervisor\/(requests|request-files)(\/|$)/.test(path)) return ["requests.manage"];
  if (path === "/api/supervisor/workspace") return [read ? "catalog.view" : "catalog.manage"];
  if (/^\/api\/admin\/support\//.test(path)) return ["support.manage"];
  if (path === "/api/admin/ai") return ["ai.manage"];
  if (path === "/api/admin/referrals") return ["referrals.manage"];
  if (path === "/api/admin/learning-tracks") return ["roadmap.manage"];
  if (path === "/api/admin/seo") return ["seo.manage"];
  if (path === "/api/admin/content") return ["content.manage"];
  if (path === "/api/admin/analytics") return ["audit.view"];
  if (path === "/api/admin/compliance") return [read ? "compliance.view" : "compliance.manage"];
  if (path === "/api/admin/notifications/dispatch" || path === "/api/admin/lifecycle/dispatch") return ["notifications.dispatch"];
  if (/^\/api\/admin\/(operations|files)(\/|$)/.test(path)) return ["operations.manage"];
  return null;
}
export const CONSOLE_VIEWS: Record<string, string[]> = {
  overview: [], institutions: ["catalog.view"], specialties: ["catalog.view"], courses: ["catalog.view"], content: ["catalog.view"],
  students: ["students.view"], staff: ["staff.manage"], orders: ["finance.view"], requests: ["requests.manage"], support: ["support.manage"],
  subscriptions: ["subscriptions.manage"], reviews: ["catalog.manage"], notifications: ["notifications.manage"], coupons: ["finance.manage"], settings: ["settings.manage"], audit: ["audit.view"],
};
export const CONSOLE_ACTIONS: Record<string, string[]> = {
  syncCatalogTemplates: ["catalog.manage"], syncOfficialPrograms: ["catalog.manage"], saveInstitution: ["catalog.manage"], saveSpecialty: ["catalog.manage"],
  saveCourse: ["catalog.manage"], saveUnit: ["catalog.manage"], saveLesson: ["catalog.manage"], updateUser: ["students.manage"], updateStudentProfile: ["students.manage"],
  saveSupervisorAssignment: ["staff.manage"], grantAccess: ["subscriptions.manage"], updateAccess: ["subscriptions.manage"], revokeUserSession: ["students.devices.manage"],
  prepareRequest: ["requests.manage", "catalog.manage"], updateRequest: ["requests.manage"], updateTicket: ["support.manage"], updateReview: ["catalog.manage"],
  saveSettings: ["settings.manage"], createNotification: ["notifications.manage"], dispatchNotifications: ["notifications.dispatch"], saveCoupon: ["finance.manage"],
};
const DELETE_AREA: Record<string, string> = { institution: "catalog.manage", specialty: "catalog.manage", course: "catalog.manage", unit: "catalog.manage", lesson: "catalog.manage", video: "catalog.manage", review: "catalog.manage", user: "students.manage", course_request: "requests.manage", support_ticket: "support.manage", coupon: "finance.manage", notification: "notifications.manage", supervisor_assignment: "staff.manage" };
export function consoleActionPermissions(action: string, entityType?: unknown) {
  if (action === "deleteEntity") return typeof entityType === "string" && DELETE_AREA[entityType] ? ["records.delete", DELETE_AREA[entityType]] : null;
  return CONSOLE_ACTIONS[action] || null;
}
export function adminPagePermissions(path: string): string[] | null {
  if (path === "/admin" || path === "/admin/security") return [];
  if (path.startsWith("/admin/students/")) return ["students.view"];
  if (path.startsWith("/admin/courses/")) return ["catalog.view", "students.view"];
  const map: Record<string, string[]> = { "/admin/partners": ["content.manage"], "/admin/files": ["operations.manage"], "/admin/purchases": ["finance.view"], "/admin/finance": ["finance.view"], "/admin/operations": ["operations.manage"], "/admin/ai": ["ai.manage"], "/admin/referrals": ["referrals.manage"], "/admin/seo": ["seo.manage"], "/admin/course-resources": ["catalog.view"], "/admin/bundles": ["catalog.view"], "/admin/learning-tracks": ["roadmap.manage"], "/admin/staff": ["staff.manage"], "/admin/content": ["content.manage"] };
  return map[path] || null;
}
