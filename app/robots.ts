import type { MetadataRoute } from "next";
import { searchIndexingEnabled, seoUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (!searchIndexingEnabled()) return { rules: { userAgent: "*", disallow: "/" } };
  // The wildcard applies to search and answer-engine crawlers too. Keep one
  // rule so private/API exclusions cannot be accidentally weakened by a more
  // specific bot group.
  return {
    rules: { userAgent: "*", allow: ["/", "/api/covers/", "/api/logos/"], disallow: ["/api/", "/r/"] },
    sitemap: seoUrl("/sitemap.xml"),
    host: seoUrl("/"),
  };
}
