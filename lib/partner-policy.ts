import { normalizePublicOrigin } from "@/lib/public-origin";
export class PartnerChangeError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "PARTNER_INVALID") { super(message); }
}
export function partnerHttps(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") && Boolean(normalizePublicOrigin(url.origin));
  } catch { return false; }
}
export function partnerRevision(current: { updatedAt: string } | undefined, expected: unknown, id: number) {
  if (id && !current) throw new PartnerChangeError("السجل غير موجود", 404, "PARTNER_NOT_FOUND");
  if (id && (typeof expected !== "string" || expected !== current!.updatedAt)) throw new PartnerChangeError("تغير السجل من جلسة أخرى. حدّثه قبل حفظ تعديلك", 409, "PARTNER_CONFLICT");
}
export function validatePublishedPartner(value: { status: string; kind: string; rightsConfirmed: boolean; rightsReference: string | null; credentialNumber: string | null; verificationUrl: string | null }) {
  if (value.status !== "published") return;
  if (!value.rightsConfirmed || !value.rightsReference?.trim()) throw new PartnerChangeError("أكد حق استخدام الشعار وأضف مرجع الإذن قبل النشر");
  if (value.kind === "accreditation" && (!value.credentialNumber?.trim() || !value.verificationUrl || !partnerHttps(value.verificationUrl))) throw new PartnerChangeError("الاعتماد يحتاج رقمًا ورابط تحقق عامًّا موثوقًا قبل النشر");
}
