import type { MetadataRoute } from "next";
import { searchIndexingEnabled, seoUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (!searchIndexingEnabled()) return { rules: { userAgent: "*", disallow: "/" } };
  // The wildcard policy intentionally covers regular search crawlers and
  // answer-engine discovery crawlers while keeping private/API namespaces out.
  // Private HTML also carries noindex and remains protected by server authorization.
  return { rules: { userAgent: "*", allow: ["/", "/api/covers/", "/api/logos/"], disallow: ["/api/", "/r/"] }, sitemap: seoUrl("/sitemap.xml") };
}
