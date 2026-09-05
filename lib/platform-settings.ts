import { unstable_noStore as noStore } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { platformSettings } from "@/db/schema";

export const PUBLIC_SETTING_DEFAULTS = {
  support_email: "",
  support_hours: "الأحد–الخميس · 9 ص–10 م",
  footer_description: "منصة سعودية تجمع شروحات المواد الجامعية في مكان واحد. ابحث، جرّب مجانًا، ثم تعلّم بثقة.",
  app_download_title: "مراس معك على كل جهاز",
  app_download_description: "نزّل التطبيق وتابع موادك وإشعاراتك وتقدمك أينما كنت.",
  ios_app_url: "",
  android_app_url: "",
  whatsapp_number: "",
  whatsapp_message: "مرحبًا، أحتاج مساعدة في منصة مراس العلم",
  social_x: "",
  social_instagram: "",
  social_tiktok: "",
  social_youtube: "",
  social_telegram: "",
  social_linkedin: "",
  social_facebook: "",
  social_snapchat: "",
  social_threads: "",
  announcement: "",
  legal_name: "",
  commercial_registration_number: "",
  commercial_registration_verify_url: "",
  ecommerce_authentication_number: "",
  ecommerce_authentication_verify_url: "",
  nelc_program_name: "",
  nelc_program_license_number: "",
  nelc_program_license_verify_url: "",
  legal_address: "",
  vat_number: "",
  positioning_claim: "منصة سعودية متخصصة في شروحات المقررات الجامعية ومواد التعلّم المساندة.",
  first_platform_claim_enabled: "true",
  first_platform_claim_text: "أول منصة سعودية متخصصة في تقديم شروحات المقررات الجامعية.",
  first_platform_claim_evidence_url: "",
  payment_methods_marketing_enabled: "true",
} as const;

export const ADMIN_SETTING_DEFAULTS = {
  max_student_devices: "2",
  content_view_mode: "both",
} as const;

export type ContentViewMode = "both" | "app_only" | "web_only";

export type PublicSettingKey = keyof typeof PUBLIC_SETTING_DEFAULTS;
export type AdminSettingKey = keyof typeof ADMIN_SETTING_DEFAULTS;
export type SettingKey = PublicSettingKey | AdminSettingKey;
export type PublicSettings = Record<PublicSettingKey, string>;

// Public capability flags are derived server-side; never expose payment credentials.
export function getPublicPaymentAvailability() {
  const ready = Boolean(process.env.TAP_SECRET_KEY?.trim() && process.env.TAP_WEBHOOK_SECRET?.trim());
  return {
    payments_ready: String(ready),
    tabby_available: String(ready && process.env.TAP_TABBY_ENABLED === "true"),
    tamara_available: String(ready && process.env.TAP_TAMARA_ENABLED === "true"),
  };
}

export const SETTING_META: Record<SettingKey, { label: string; category: string; isPublic: boolean }> = {
  support_email: { label: "بريد الدعم", category: "support", isPublic: true },
  support_hours: { label: "ساعات الدعم", category: "support", isPublic: true },
  footer_description: { label: "وصف الفوتر", category: "general", isPublic: true },
  app_download_title: { label: "عنوان تنزيل التطبيق", category: "apps", isPublic: true },
  app_download_description: { label: "وصف تنزيل التطبيق", category: "apps", isPublic: true },
  ios_app_url: { label: "رابط تطبيق iPhone / App Store", category: "apps", isPublic: true },
  android_app_url: { label: "رابط تطبيق Android / Google Play", category: "apps", isPublic: true },
  whatsapp_number: { label: "رقم واتساب", category: "support", isPublic: true },
  whatsapp_message: { label: "رسالة واتساب الافتراضية", category: "support", isPublic: true },
  social_x: { label: "رابط X", category: "social", isPublic: true },
  social_instagram: { label: "رابط Instagram", category: "social", isPublic: true },
  social_tiktok: { label: "رابط TikTok", category: "social", isPublic: true },
  social_youtube: { label: "رابط YouTube", category: "social", isPublic: true },
  social_telegram: { label: "رابط Telegram", category: "social", isPublic: true },
  social_linkedin: { label: "رابط LinkedIn", category: "social", isPublic: true },
  social_facebook: { label: "رابط Facebook", category: "social", isPublic: true },
  social_snapchat: { label: "رابط Snapchat", category: "social", isPublic: true },
  social_threads: { label: "رابط Threads", category: "social", isPublic: true },
  announcement: { label: "تنبيه عام", category: "general", isPublic: true },
  legal_name: { label: "الاسم النظامي للمنشأة", category: "legal", isPublic: true },
  commercial_registration_number: { label: "رقم السجل التجاري", category: "legal", isPublic: true },
  commercial_registration_verify_url: { label: "رابط التحقق من السجل التجاري", category: "legal", isPublic: true },
  ecommerce_authentication_number: { label: "رقم توثيق التجارة الإلكترونية", category: "legal", isPublic: true },
  ecommerce_authentication_verify_url: { label: "رابط التحقق من توثيق المتجر", category: "legal", isPublic: true },
  nelc_program_name: { label: "اسم البرنامج المشمول بترخيص التعليم الإلكتروني", category: "legal", isPublic: true },
  nelc_program_license_number: { label: "رقم ترخيص برنامج التعليم الإلكتروني", category: "legal", isPublic: true },
  nelc_program_license_verify_url: { label: "رابط التحقق من ترخيص البرنامج", category: "legal", isPublic: true },
  legal_address: { label: "العنوان النظامي", category: "legal", isPublic: true },
  vat_number: { label: "الرقم الضريبي", category: "legal", isPublic: true },
  positioning_claim: { label: "وصف مكانة المنصة", category: "brand", isPublic: true },
  first_platform_claim_enabled: { label: "تفعيل ادعاء الأولوية", category: "brand", isPublic: true },
  first_platform_claim_text: { label: "نص ادعاء الأولوية", category: "brand", isPublic: true },
  first_platform_claim_evidence_url: { label: "رابط إثبات ادعاء الأولوية", category: "brand", isPublic: true },
  payment_methods_marketing_enabled: { label: "إظهار Tap وتابي وتمارا في الرئيسية", category: "commerce", isPublic: true },
  max_student_devices: { label: "الحد الأقصى لأجهزة الطالب", category: "security", isPublic: false },
  content_view_mode: { label: "الأجهزة المسموح لها بمشاهدة المحتوى", category: "security", isPublic: false },
};

export function whatsappHref(settings: Pick<PublicSettings, "whatsapp_number" | "whatsapp_message">) {
  const digits = settings.whatsapp_number.replace(/\D/g, "").replace(/^00/, "");
  if (!digits) return "";
  const international = digits.startsWith("966") ? digits : digits.startsWith("0") ? `966${digits.slice(1)}` : digits;
  return `https://wa.me/${international}?text=${encodeURIComponent(settings.whatsapp_message)}`;
}

export async function getStudentDeviceLimit() {
  const fallback = Number(ADMIN_SETTING_DEFAULTS.max_student_devices);
  if (!process.env.DATABASE_URL) return fallback;
  try {
    const [row] = await getDb().select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.key, "max_student_devices")).limit(1);
    const parsed = Number(row?.value || fallback);
    return Number.isInteger(parsed) ? Math.max(1, Math.min(10, parsed)) : fallback;
  } catch {
    return fallback;
  }
}

export async function getContentViewMode(): Promise<ContentViewMode> {
  const fallback: ContentViewMode = "both";
  if (!process.env.DATABASE_URL) return fallback;
  const [row] = await getDb().select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.key, "content_view_mode")).limit(1);
  return row?.value === "app_only" || row?.value === "web_only" || row?.value === "both" ? row.value : fallback;
}

export function contentViewModeError(mode: ContentViewMode, client: "app" | "web") {
  if (mode === "app_only" && client === "web") return "مشاهدة المحتوى الكامل متاحة حاليًا من تطبيق مراس فقط. يبقى الدرس التجريبي متاحًا على الويب.";
  if (mode === "web_only" && client === "app") return "مشاهدة المحتوى الكامل متاحة حاليًا من موقع مراس فقط. يبقى الدرس التجريبي متاحًا في التطبيق.";
  return "";
}

let publicSettingsCache: { expiresAt: number; value: PublicSettings } | null = null;
let publicSettingsInFlight: Promise<PublicSettings> | null = null;
let publicSettingsGeneration = 0;
const SETTINGS_CACHE_TTL = 5_000;

export function invalidatePublicSettingsCache() {
  publicSettingsCache = null;
  publicSettingsInFlight = null;
  publicSettingsGeneration += 1;
}

export async function getPublicSettings(): Promise<PublicSettings> {
  noStore();
  if (publicSettingsCache && publicSettingsCache.expiresAt > Date.now()) return publicSettingsCache.value;
  if (publicSettingsInFlight) return publicSettingsInFlight;
  const generation = publicSettingsGeneration;
  const load = async () => {
    const output = { ...PUBLIC_SETTING_DEFAULTS } as PublicSettings;
    if (!process.env.DATABASE_URL) return output;
    try {
      const rows = await getDb().select({ key: platformSettings.key, value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.isPublic, true));
      for (const row of rows) if (Object.hasOwn(PUBLIC_SETTING_DEFAULTS, row.key)) output[row.key as PublicSettingKey] = row.value;
    } catch {
      return output;
    }
    if (generation === publicSettingsGeneration) publicSettingsCache = { expiresAt: Date.now() + SETTINGS_CACHE_TTL, value: output };
    return output;
  };
  const pending = load();
  publicSettingsInFlight = pending;
  try { return await pending; } finally { if (publicSettingsInFlight === pending) publicSettingsInFlight = null; }
}
