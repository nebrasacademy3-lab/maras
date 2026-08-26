import type { MetadataRoute } from "next";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://meras-alelm.glossy-sun-8084.chatgpt.site").replace(/\/$/, "");
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/supervisor", "/dashboard", "/learn/", "/checkout/", "/api/"] }, sitemap: `${baseUrl}/sitemap.xml` };
}
