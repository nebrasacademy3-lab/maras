/** Shared, side-effect-free device policy. The server clock and session remain authoritative. */
export const DEVICE_ACTIONS = ["end_sessions", "revoke_block", "revoke_allow", "allow_return", "require_approval", "block_until"] as const;
export type DeviceAction = typeof DEVICE_ACTIONS[number];
export type DeviceReturnPolicy = "blocked" | "allowed" | "approval";
export type DeviceReturnState = { revokedAt: string | null; returnPolicy?: string | null; blockedUntil?: string | null };
export const DEVICE_ACTION_LABELS: Record<DeviceAction, string> = {
  end_sessions: "إنهاء جلسات الجهاز فقط", revoke_block: "سحب الاعتماد ومنع العودة", revoke_allow: "سحب الاعتماد مع السماح بالعودة",
  allow_return: "السماح بمحاولة دخول جديدة", require_approval: "اشتراط موافقة جديدة", block_until: "حظر مؤقت ثم السماح بالعودة",
};
export const DEVICE_ACTION_DESCRIPTIONS: Record<DeviceAction, string> = {
  end_sessions: "تنتهي الجلسات الحالية فقط، ويبقى الجهاز معتمدًا. يحتاج الدخول التالي إلى المصادقة المعتادة.",
  revoke_block: "يُسحب الاعتماد وتنتهي الجلسات. لا يعود الجهاز المسجل حتى تسمح الإدارة بذلك.",
  revoke_allow: "يُسحب الاعتماد وتنتهي الجلسات. يمكن للجهاز العودة بمصادقة جديدة عندما تتوفر خانة ضمن الحد المسموح.",
  allow_return: "يُرفع المنع دون إعادة الاعتماد أو إحياء أي جلسة. يفحص النظام الحد وMFA عند تسجيل الدخول الجديد.",
  require_approval: "تبقى العودة ممنوعة حتى يصدر إجراء سماح موثق من مسؤول مخول.",
  block_until: "تنتهي الجلسات ويُسحب الاعتماد الآن. بعد المدة يمكن محاولة دخول جديدة؛ لا تعود الجلسات القديمة تلقائيًا.",
};
export function deviceReturnDecision(device: DeviceReturnState, now: number): "active" | "allowed" | "blocked" | "approval" | "temporary" {
  if (!device.revokedAt) return "active";
  if (device.blockedUntil) {
    const expires = Date.parse(device.blockedUntil);
    if (!Number.isFinite(expires)) return "blocked";
    if (expires > now) return "temporary";
  }
  return device.returnPolicy === "allowed" ? "allowed" : device.returnPolicy === "approval" ? "approval" : "blocked";
}
export function devicePolicyLabel(device: DeviceReturnState, now: number): string {
  const state = deviceReturnDecision(device, now);
  return { active: "معتمد", allowed: "غير معتمد — يسمح بدخول جديد ضمن الحد", blocked: "غير معتمد — العودة ممنوعة", approval: "غير معتمد — يحتاج موافقة الإدارة", temporary: "محظور مؤقتًا" }[state];
}
export type DeviceCommand = { action: DeviceAction; deviceId: number; reason: string; expectedRevision?: number; durationHours?: number };
export function parseDeviceCommand(value: Record<string, unknown>, legacyDelete = false): DeviceCommand {
  const action = legacyDelete ? "revoke_block" : value.action;
  const deviceId = Number(value.deviceId);
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  if (typeof action !== "string" || !DEVICE_ACTIONS.includes(action as DeviceAction)) throw new TypeError("اختر إجراء جهاز معروفًا");
  if (!Number.isSafeInteger(deviceId) || deviceId < 1) throw new TypeError("معرف الجهاز غير صالح");
  if (reason.length < 4 || reason.length > 600 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u202a-\u202e]/u.test(reason)) throw new TypeError("اكتب سببًا واضحًا من 4 إلى 600 حرف");
  const expectedRevision = value.expectedRevision === undefined ? undefined : Number(value.expectedRevision);
  if ((!legacyDelete && expectedRevision === undefined) || (expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0))) throw new TypeError("حدّث بيانات الجهاز قبل تنفيذ الإجراء");
  const durationHours = action === "block_until" ? Number(value.durationHours) : undefined;
  if (action === "block_until" && (!Number.isSafeInteger(durationHours) || durationHours! < 1 || durationHours! > 2160)) throw new TypeError("مدة الحظر بين ساعة واحدة و90 يومًا");
  return { action: action as DeviceAction, deviceId, reason, expectedRevision, durationHours };
}
export function deviceActionPolicy(command: DeviceCommand, now: number): { returnPolicy: DeviceReturnPolicy; blockedUntil: string | null } | null {
  if (command.action === "end_sessions") return null;
  if (command.action === "block_until") return { returnPolicy: "allowed", blockedUntil: new Date(now + command.durationHours! * 3_600_000).toISOString() };
  return { returnPolicy: command.action === "require_approval" ? "approval" : command.action === "revoke_allow" || command.action === "allow_return" ? "allowed" : "blocked", blockedUntil: null };
}
