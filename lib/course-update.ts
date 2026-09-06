import { normalizeAccessDurationDays } from "@/lib/course-access";
export type CoursePolicySnapshot = { audienceScope?: string; accessLabel?: string; accessDurationDays?: number };
export function coursePolicyForSave(payload: Record<string, unknown>, before?: CoursePolicySnapshot) {
  if (Object.hasOwn(payload, "audienceScope") && !["institution", "specialty"].includes(String(payload.audienceScope))) throw new Error("نطاق المادة غير صالح");
  const accessLabel = typeof payload.accessLabel === "string" && payload.accessLabel.trim() ? payload.accessLabel.trim().slice(0, 80) : before?.accessLabel || "90 يومًا";
  if (Object.hasOwn(payload, "accessDurationDays") && (!Number.isInteger(Number(payload.accessDurationDays)) || Number(payload.accessDurationDays) < 1 || Number(payload.accessDurationDays) > 3650)) throw new Error("مدة الوصول يجب أن تكون من يوم إلى 3650 يومًا");
  return {
    audienceScope: Object.hasOwn(payload, "audienceScope") ? payload.audienceScope as "institution" | "specialty" : before?.audienceScope === "institution" ? "institution" as const : "specialty" as const,
    accessLabel,
    // A label is presentation, not authority to silently shorten an existing entitlement.
    accessDurationDays: Object.hasOwn(payload, "accessDurationDays") ? normalizeAccessDurationDays(payload.accessDurationDays, accessLabel) : before?.accessDurationDays ?? normalizeAccessDurationDays(undefined, accessLabel),
  };
}
export function courseFlagPatch(payload: Record<string, unknown>) {
  const patch: { status?: "draft" | "published" | "hidden"; featured?: boolean } = {};
  if (Object.hasOwn(payload, "status")) {
    if (!["draft", "published", "hidden"].includes(String(payload.status))) throw new Error("حالة النشر غير صالحة");
    patch.status = payload.status as "draft" | "published" | "hidden";
  }
  if (Object.hasOwn(payload, "featured")) {
    if (typeof payload.featured !== "boolean") throw new Error("قيمة التمييز غير صالحة");
    patch.featured = payload.featured;
  }
  if (!Object.keys(patch).length) throw new Error("لم تحدد تعديلًا");
  return patch;
}
