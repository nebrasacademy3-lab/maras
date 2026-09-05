import type { Metadata } from "next";
import type { Course } from "@/lib/data";

const DEFAULT_PUBLIC_ORIGIN = "https://marase.up.railway.app";
export type SeoSearchParams = Record<string, string | string[] | undefined>;
function configuredOrigin() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.APP_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password || !["https:", "http:"].includes(url.protocol)) return null;
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) return null;
    return url.origin;
  } catch { return null; }
}
export function seoSiteOrigin() { return configuredOrigin() || DEFAULT_PUBLIC_ORIGIN; }
export function searchIndexingEnabled() {
  const origin = configuredOrigin();
  return process.env.SEO_INDEXING_ENABLED !== "false" && process.env.NODE_ENV === "production" && Boolean(origin?.startsWith("https://")) && !/https:\/\/(?:localhost|127\.0\.0\.1)(?::|$)/.test(origin || "");
}
export function seoUrl(path = "/") {
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u0020]/.test(path)) throw new Error("Invalid SEO path");
  return new URL(path, seoSiteOrigin()).toString();
}
export const seoSegment = (value: string) => encodeURIComponent(value);
export function seoDescription(value: string) { return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180); }
export function publicPageMetadata(path: string, title: string, description: string, options: { noindex?: boolean; image?: string } = {}): Metadata {
  const canonical = seoUrl(path), copy = seoDescription(description), image = options.image || "/og.png";
  return {
    title, description: copy, alternates: { canonical },
    robots: { index: searchIndexingEnabled() && !options.noindex, follow: true, googleBot: { index: searchIndexingEnabled() && !options.noindex, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
    openGraph: { type: "website", locale: "ar_SA", siteName: "مراس العلم", title, description: copy, url: canonical, images: [image] },
    twitter: { card: "summary_large_image", title, description: copy, images: [image] },
  };
}
export function catalogHasFilters(params: SeoSearchParams) {
  return Object.entries(params).some(([key, value]) => !/^(utm_[a-z_]+|gclid|fbclid)$/i.test(key) && (Array.isArray(value) ? value.some(Boolean) : Boolean(value)));
}
export function googleSiteVerification() {
  const value = process.env.GOOGLE_SITE_VERIFICATION?.trim() || "";
  return /^[A-Za-z0-9_-]{10,256}$/.test(value) ? value : undefined;
}
export function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
export function siteStructuredData() {
  return { "@context": "https://schema.org", "@graph": [
    { "@type": "Organization", "@id": seoUrl("/#organization"), name: "مراس العلم", url: seoUrl("/"), logo: seoUrl("/brand/mark-official.png") },
    { "@type": "WebSite", "@id": seoUrl("/#website"), name: "مراس العلم", url: seoUrl("/"), inLanguage: "ar-SA", publisher: { "@id": seoUrl("/#organization") } },
  ] };
}
export function breadcrumbData(items: Array<{ name: string; path: string }>) {
  return { "@type": "BreadcrumbList", itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: seoUrl(item.path) })) };
}
export function itemListData(name: string, items: Array<{ name: string; path: string }>) {
  return { "@type": "ItemList", name, numberOfItems: items.length, itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, url: seoUrl(item.path) })) };
}
export function courseStructuredData(course: Course) {
  const path = `/courses/${seoSegment(course.slug)}`;
  return { "@context": "https://schema.org", "@graph": [
    {
      "@type": "Course", "@id": seoUrl(path + "#course"), name: course.title,
      ...(course.titleEn ? { alternateName: course.titleEn } : {}), description: course.description,
      url: seoUrl(path), inLanguage: "ar-SA", ...(course.code ? { courseCode: course.code } : {}),
      provider: { "@type": "Organization", "@id": seoUrl("/#organization"), name: "مراس العلم", url: seoUrl("/") },
      // A waitlist is not a purchasable preorder.
      ...(course.availableForPurchase && Number.isFinite(course.price) && course.price >= 0 ? { offers: { "@type": "Offer", price: course.price, priceCurrency: "SAR", availability: "https://schema.org/InStock", url: seoUrl(path) } } : {}),
      ...(Number.isInteger(course.ratingsCount) && course.ratingsCount > 0 && Number.isFinite(course.rating) && course.rating >= 1 && course.rating <= 5 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: course.rating, ratingCount: course.ratingsCount, bestRating: 5, worstRating: 1 } } : {}),
    },
    breadcrumbData([{ name: "الرئيسية", path: "/" }, { name: "المواد", path: "/courses" }, { name: course.title, path }]),
  ] };
}
export function validModifiedDate(value?: string) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed <= Date.now() ? new Date(parsed) : undefined;
}
