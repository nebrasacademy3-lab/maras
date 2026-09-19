/** Shared presentation contract only. Server authorization remains authoritative. */
export const GEMINI_VERIFICATION_METRICS = [
  { key: "projects", label: "مشاريع مسجلة" },
  { key: "verified", label: "إثباتات صالحة" },
  { key: "expired", label: "إثباتات منتهية" },
  { key: "expiring", label: "تنتهي قريبًا" },
  { key: "scheduled", label: "تجديد مجدول" },
  { key: "checking", label: "قيد التحقق" },
  { key: "failed", label: "تجديد متعثر" },
  { key: "overdue", label: "تجديد متأخر" },
] as const;
export type GeminiVerificationSummary = Record<(typeof GEMINI_VERIFICATION_METRICS)[number]["key"], number>;
export const OPERATIONS_PANELS = {
  automation: { label: "الأتمتة والطوابير", endpoint: "/api/admin/operations/summary", permissions: ["operations.manage", "data.all"] },
  analytics: { label: "التحويل والاحتفاظ", endpoint: "/api/admin/analytics", permissions: ["audit.view"] },
  support: { label: "تشغيل الدعم وSLA", endpoint: "/api/admin/support/metrics", permissions: ["support.manage"] },
  compliance: { label: "ملف الامتثال", endpoint: "/api/admin/compliance", permissions: ["compliance.view", "data.all"] },
} as const;
export type OperationsPanel = keyof typeof OPERATIONS_PANELS;
export const OPERATIONS_TASKS = {
  lifecycle: { endpoint: "/api/admin/lifecycle/dispatch", permissions: ["notifications.dispatch", "data.all"] },
  scan: { endpoint: "/api/admin/files/scan", permissions: ["operations.manage", "data.all"] },
  push: { endpoint: "/api/admin/notifications/dispatch", permissions: ["notifications.dispatch", "data.all"] },
} as const;
