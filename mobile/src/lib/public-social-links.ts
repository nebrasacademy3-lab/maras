import type { PublicSettings, PublicSocialLink } from "@/src/types";

/** Channel eligibility is normalized once on the server for web, app and email. */
export function mobileSocialLinks(settings?: Pick<PublicSettings, "social_links">): PublicSocialLink[] {
  if (!Array.isArray(settings?.social_links)) return [];
  const seen = new Set<string>();
  return settings.social_links.filter((link) => {
    if (!link || typeof link.url !== "string" || seen.has(link.id)) return false;
    try {
      const url = new URL(link.url);
      if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
      seen.add(link.id);
      return true;
    } catch { return false; }
  });
}
