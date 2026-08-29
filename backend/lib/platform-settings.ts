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
  registration_enabled: "true",
  purchases_enabled: "true",
  course_requests_enabled: "true",
  support_enabled: "true",
  onboarding_enabled: "true",
  maintenance_message: "",
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
  registration_enabled: { label: "السماح بإنشاء الحسابات", category: "operations" },
  purchases_enabled: { label: "السماح بالشراء", category: "operations" },
  course_requests_enabled: { label: "السماح بطلب المواد", category: "operations" },
  support_enabled: { label: "السماح بمحادثات الدعم الجديدة", category: "operations" },
  onboarding_enabled: { label: "عرض التهيئة للمستخدمين", category: "operations" },
  maintenance_message: { label: "رسالة الصيانة", category: "operations" },
};

export type PlatformFeatureKey = "registration_enabled" | "purchases_enabled" | "course_requests_enabled" | "support_enabled" | "onboarding_enabled";

export function settingEnabled(value: string | null | undefined, fallback = true) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") return false;
  return fallback;
}

export async function platformFeatureEnabled(key: PlatformFeatureKey) {
  return settingEnabled((await getPublicSettings())[key], true);
}

export function whatsappHref(settings: Pick<PublicSettings, "whatsapp_number" | "whatsapp_message">) {
  const digits = settings.whatsapp_number.replace(/\D/g, "").replace(/^00/, "");
  if (!digits) return "";
  const international = digits.startsWith("966") ? digits : digits.startsWith("0") ? `966${digits.slice(1)}` : digits;
  return `https://wa.me/${international}?text=${encodeURIComponent(settings.whatsapp_message)}`;
}

type PublicSettingsSnapshot = {
  value: PublicSettings;
  available: boolean;
};

let publicSettingsCache: { expiresAt: number; snapshot: PublicSettingsSnapshot } | null = null;
let publicSettingsInFlight: Promise<PublicSettingsSnapshot> | null = null;
const SETTINGS_CACHE_TTL = 5_000;

export function invalidatePublicSettingsCache() {
  publicSettingsCache = null;
}

async function loadPublicSettings(): Promise<PublicSettingsSnapshot> {
  noStore();
  if (publicSettingsCache && publicSettingsCache.expiresAt > Date.now()) return publicSettingsCache.snapshot;
  if (publicSettingsInFlight) return publicSettingsInFlight;
  const load = async () => {
    const output = { ...PUBLIC_SETTING_DEFAULTS } as PublicSettings;
    // Local/demo builds without a configured database intentionally use the
    // documented defaults. Once DATABASE_URL is configured, however, a read
    // failure must be distinguishable so sensitive mutations can fail closed.
    if (!process.env.DATABASE_URL) return { value: output, available: true };
    try {
      const rows = await getDb().select({ key: platformSettings.key, value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.isPublic, true));
      for (const row of rows) if (row.key in output) output[row.key as PublicSettingKey] = row.value;
    } catch {
      return { value: output, available: false };
    }
    const snapshot = { value: output, available: true };
    publicSettingsCache = { expiresAt: Date.now() + SETTINGS_CACHE_TTL, snapshot };
    return snapshot;
  };
  publicSettingsInFlight = load();
  try { return await publicSettingsInFlight; } finally { publicSettingsInFlight = null; }
}

export async function getPublicSettings(): Promise<PublicSettings> {
  return (await loadPublicSettings()).value;
}

/**
 * Reads operational controls for a state-changing endpoint. In production a
 * configured-but-unreachable database is not equivalent to "all enabled".
 */
export async function getMutationPublicSettings(): Promise<PublicSettings> {
  const snapshot = await loadPublicSettings();
  if (!snapshot.available) throw new Error("PLATFORM_SETTINGS_UNAVAILABLE");
  return snapshot.value;
}

export async function getFailClosedPublicSettings(): Promise<PublicSettings> {
  const snapshot = await loadPublicSettings();
  if (snapshot.available) return snapshot.value;
  return {
    ...snapshot.value,
    registration_enabled: "false",
    purchases_enabled: "false",
    course_requests_enabled: "false",
    support_enabled: "false",
    onboarding_enabled: "false",
    maintenance_message: "تعذر التحقق من حالة خدمات المنصة مؤقتًا. لم تُفعّل أي عملية جديدة.",
  };
}
