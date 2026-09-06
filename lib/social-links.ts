/** Public channel metadata. This module is safe in server, browser and build code. */
export const SOCIAL_CHANNELS = [
  { key: "whatsapp_number", id: "whatsapp", label: "WhatsApp", labelAr: "واتساب", icon: "logo-whatsapp", hosts: ["wa.me", "whatsapp.com"] },
  { key: "social_x", id: "x", label: "X", labelAr: "إكس", icon: "logo-x", hosts: ["x.com", "twitter.com"] },
  { key: "social_instagram", id: "instagram", label: "Instagram", labelAr: "إنستغرام", icon: "logo-instagram", hosts: ["instagram.com"] },
  { key: "social_tiktok", id: "tiktok", label: "TikTok", labelAr: "تيك توك", icon: "logo-tiktok", hosts: ["tiktok.com"] },
  { key: "social_youtube", id: "youtube", label: "YouTube", labelAr: "يوتيوب", icon: "logo-youtube", hosts: ["youtube.com", "youtu.be"] },
  { key: "social_telegram", id: "telegram", label: "Telegram", labelAr: "تيليجرام", icon: "paper-plane-outline", hosts: ["t.me", "telegram.me", "telegram.org"] },
  { key: "social_linkedin", id: "linkedin", label: "LinkedIn", labelAr: "لينكدإن", icon: "logo-linkedin", hosts: ["linkedin.com"] },
  { key: "social_facebook", id: "facebook", label: "Facebook", labelAr: "فيسبوك", icon: "logo-facebook", hosts: ["facebook.com", "fb.com", "fb.me"] },
  { key: "social_snapchat", id: "snapchat", label: "Snapchat", labelAr: "سناب شات", icon: "logo-snapchat", hosts: ["snapchat.com"] },
  { key: "social_threads", id: "threads", label: "Threads", labelAr: "ثريدز", icon: "logo-threads", hosts: ["threads.net", "threads.com"] },
] as const;

export type SocialSettingKey = typeof SOCIAL_CHANNELS[number]["key"];
export type SocialChannelId = typeof SOCIAL_CHANNELS[number]["id"];
export type SocialSettingsInput = Partial<Record<SocialSettingKey | "whatsapp_message" | "whatsapp_url", string>>;
export type SocialLink = { key: SocialSettingKey; id: SocialChannelId; label: string; labelAr: string; icon: string; url: string };

export function isSocialSettingKey(key: string): key is SocialSettingKey {
  return SOCIAL_CHANNELS.some((channel) => channel.key === key);
}

/** Reject scripts, embedded credentials, deceptive hosts and unsupported ports. */
export function normalizeSocialUrl(key: SocialSettingKey, value: unknown): string {
  if (typeof value !== "string" || value.length > 2_000 || /[\u0000-\u001f\u007f]/u.test(value)) return "";
  const channel = SOCIAL_CHANNELS.find((item) => item.key === key);
  if (!channel) return "";
  try {
    let input = value.trim();
    if (key === "social_telegram") {
      if (/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(input)) input = `https://t.me/${input.slice(1)}`;
      else if (/^(?:t\.me|telegram\.me)\//i.test(input)) input = `https://${input}`;
    }
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return "";
    if (!channel.hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return "";
    return url.href;
  } catch { return ""; }
}

export function normalizeWhatsappNumber(value: unknown): string {
  if (typeof value !== "string") return "";
  const latin = value.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0)).trim();
  if (!/^\+?[0-9 ()-]+$/.test(latin)) return "";
  const digits = latin.replace(/\D/g, "").replace(/^00/, "");
  const international = /^05\d{8}$/.test(digits) ? `966${digits.slice(1)}` : digits;
  return /^[1-9]\d{8,14}$/.test(international) ? international : "";
}

export function publicWhatsappUrl(settings: SocialSettingsInput): string {
  const number = normalizeWhatsappNumber(settings.whatsapp_number);
  if (number) return `https://wa.me/${number}?text=${encodeURIComponent(settings.whatsapp_message || "")}`;
  return normalizeSocialUrl("whatsapp_number", settings.whatsapp_url);
}

/** One ordered, normalized list consumed by web, mobile's public API and email. */
export function normalizedSocialLinks(settings: SocialSettingsInput): SocialLink[] {
  return SOCIAL_CHANNELS.flatMap(({ key, id, label, labelAr, icon }) => {
    const channel = { key, id, label, labelAr, icon };
    const url = channel.key === "whatsapp_number" ? publicWhatsappUrl(settings) : normalizeSocialUrl(channel.key, settings[channel.key]);
    return url ? [{ ...channel, url }] : [];
  });
}
