import type { MetadataRoute } from "next";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/supervisor", "/dashboard", "/learn/", "/checkout/", "/api/", "/referrals", "/favorites", "/cart", "/support", "/request-course", "/study-tools", "/onboarding", "/complete-profile", "/invoices/", "/notifications", "/r/"] }, sitemap: `${baseUrl}/sitemap.xml` };
}
