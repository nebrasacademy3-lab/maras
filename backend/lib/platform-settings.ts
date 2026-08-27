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
};

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

