import type { MetadataRoute } from "next";
import { searchIndexingEnabled, seoUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (!searchIndexingEnabled()) return { rules: { userAgent: "*", disallow: "/" } };
  // The wildcard already covers Googlebot, Bingbot, OAI-SearchBot and
  // PerplexityBot. Preserve the existing training-crawler policy; a new bot-
  // specific group must never accidentally drop the API exclusions below.
  // Private HTML uses noindex plus server authorization. Crawling must be allowed
  // to read noindex; robots.txt is never an access-control mechanism.
  return { rules: { userAgent: "*", allow: ["/", "/api/covers/", "/api/logos/"], disallow: ["/api/", "/r/"] }, sitemap: seoUrl("/sitemap.xml") };
}
