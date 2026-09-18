import type { MetadataRoute } from "next";
import { searchIndexingEnabled, seoUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (!searchIndexingEnabled()) return { rules: { userAgent: "*", disallow: "/" } };
  // Search and answer-engine crawlers can discover public HTML and the public
  // cover/logo endpoints. Private/API namespaces remain excluded here and are
  // independently protected by authorization + noindex response headers.
  return {
    rules: [
      { userAgent: "*", allow: ["/", "/api/covers/", "/api/logos/"], disallow: ["/api/", "/r/"] },
      { userAgent: ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot"], allow: ["/", "/llms.txt", "/sitemap.xml"], disallow: ["/api/", "/r/"] },
    ],
    sitemap: seoUrl("/sitemap.xml"),
    host: seoUrl("/"),
  };
}
