import { unstable_noStore as noStore } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { platformSettings } from "@/db/schema";

export const PUBLIC_SETTING_DEFAULTS = {
  support_email: "hello@meras.sa",
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
} as const;

export const ADMIN_SETTING_DEFAULTS = {
  max_student_devices: "2",
} as const;

export type PublicSettingKey = keyof typeof PUBLIC_SETTING_DEFAULTS;
export type AdminSettingKey = keyof typeof ADMIN_SETTING_DEFAULTS;
export type SettingKey = PublicSettingKey | AdminSettingKey;
export type PublicSettings = Record<PublicSettingKey, string>;

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
  max_student_devices: { label: "الحد الأقصى لأجهزة الطالب", category: "security", isPublic: false },
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

let publicSettingsCache: { expiresAt: number; value: PublicSettings } | null = null;
let publicSettingsInFlight: Promise<PublicSettings> | null = null;
const SETTINGS_CACHE_TTL = 5_000;

export function invalidatePublicSettingsCache() {
  publicSettingsCache = null;
}

export async function getPublicSettings(): Promise<PublicSettings> {
  noStore();
  if (publicSettingsCache && publicSettingsCache.expiresAt > Date.now()) return publicSettingsCache.value;
  if (publicSettingsInFlight) return publicSettingsInFlight;
  const load = async () => {
    const output = { ...PUBLIC_SETTING_DEFAULTS } as PublicSettings;
    if (!process.env.DATABASE_URL) return output;
    try {
      const rows = await getDb().select({ key: platformSettings.key, value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.isPublic, true));
      for (const row of rows) if (row.key in output) output[row.key as PublicSettingKey] = row.value;
    } catch {
      return output;
    }
    publicSettingsCache = { expiresAt: Date.now() + SETTINGS_CACHE_TTL, value: output };
    return output;
  };
  publicSettingsInFlight = load();
  try { return await publicSettingsInFlight; } finally { publicSettingsInFlight = null; }
}

