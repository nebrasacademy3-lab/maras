import { unstable_noStore as noStore } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { platformSettings } from "@/db/schema";

export const PUBLIC_SETTING_DEFAULTS = {
  support_email: "hello@meras.sa",
  support_hours: "الأحد–الخميس · 9 ص–10 م",
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
  home_hero_kicker: "منصة تعليم جامعي سعودية",
  home_hero_title: "شرح جامعتك،",
  home_hero_highlight: "في مكان واحد.",
  home_hero_subtitle: "اختر جامعتك وتخصصك، استعرض محتوى المادة، وابدأ التعلّم بخطوات واضحة حتى الاختبار.",
  mobile_welcome_title: "كل شيء أوضح، أرتب، وأقرب لك",
  mobile_welcome_subtitle: "تجربة عربية من اليمين لليسار، مواد منظّمة، بحث أسهل، ومساعد مراس معك في كل خطوة.",
  assistant_enabled: "true",
  course_requests_enabled: "true",
  guest_browsing_enabled: "true",
  student_registration_enabled: "true",
  payments_enabled: "true",
} as const;

export type PublicSettingKey = keyof typeof PUBLIC_SETTING_DEFAULTS;
export type PublicSettings = Record<PublicSettingKey, string>;

export const SETTING_META: Record<PublicSettingKey, { label: string; category: string }> = {
  support_email: { label: "بريد الدعم", category: "support" },
  support_hours: { label: "ساعات الدعم", category: "support" },
  whatsapp_number: { label: "رقم واتساب", category: "support" },
  whatsapp_message: { label: "رسالة واتساب الافتراضية", category: "support" },
  social_x: { label: "رابط X", category: "social" },
  social_instagram: { label: "رابط Instagram", category: "social" },
  social_tiktok: { label: "رابط TikTok", category: "social" },
  social_youtube: { label: "رابط YouTube", category: "social" },
  social_telegram: { label: "رابط Telegram", category: "social" },
  social_linkedin: { label: "رابط LinkedIn", category: "social" },
  social_facebook: { label: "رابط Facebook", category: "social" },
  social_snapchat: { label: "رابط Snapchat", category: "social" },
  social_threads: { label: "رابط Threads", category: "social" },
  announcement: { label: "تنبيه عام", category: "general" },
  home_hero_kicker: { label: "وسم الواجهة الرئيسية", category: "appearance" },
  home_hero_title: { label: "عنوان الواجهة الرئيسي", category: "appearance" },
  home_hero_highlight: { label: "تكملة العنوان البارزة", category: "appearance" },
  home_hero_subtitle: { label: "وصف الواجهة الرئيسية", category: "appearance" },
  mobile_welcome_title: { label: "عنوان ترحيب التطبيق", category: "appearance" },
  mobile_welcome_subtitle: { label: "وصف ترحيب التطبيق", category: "appearance" },
  assistant_enabled: { label: "تفعيل مساعد مراس", category: "features" },
  course_requests_enabled: { label: "تفعيل طلبات المواد", category: "features" },
  guest_browsing_enabled: { label: "السماح بالتصفح كضيف", category: "features" },
  student_registration_enabled: { label: "إنشاء حسابات الطلاب", category: "features" },
  payments_enabled: { label: "الدفع والاشتراكات الجديدة", category: "features" },
};

export function settingEnabled(value: string | undefined, fallback = true) {
  if (value == null || value === "") return fallback;
  return !["0", "false", "off", "no", "disabled"].includes(value.trim().toLowerCase());
}

export function whatsappHref(settings: Pick<PublicSettings, "whatsapp_number" | "whatsapp_message">) {
  const digits = settings.whatsapp_number.replace(/\D/g, "").replace(/^00/, "");
  if (!digits) return "";
  const international = digits.startsWith("966") ? digits : digits.startsWith("0") ? `966${digits.slice(1)}` : digits;
  return `https://wa.me/${international}?text=${encodeURIComponent(settings.whatsapp_message)}`;
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
