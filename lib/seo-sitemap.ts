import type { MetadataRoute } from "next";
import type { Course, Institution } from "@/lib/data";
import type { PublicSpecialty } from "@/lib/seo-catalog";
import { seoSegment, seoUrl, validModifiedDate } from "@/lib/seo";

export function buildPublicSitemap(courses: Course[], institutions: Institution[], specialties: PublicSpecialty[]): MetadataRoute.Sitemap {
  const visible = new Set(institutions.map((item) => item.slug));
  const published = courses.filter((course) => visible.has(course.universitySlug));
  const paths = ["/", "/universities", "/courses", "/how-it-works", "/contact", "/terms", "/privacy", "/refund-policy", "/content-policy", "/accessibility"];
  const entries: MetadataRoute.Sitemap = paths.map((path) => ({ url: seoUrl(path) }));
  for (const institution of institutions) entries.push({ url: seoUrl(`/universities/${seoSegment(institution.slug)}`) });
  for (const course of published) {
    const lastModified = validModifiedDate(course.updatedAt);
    entries.push({ url: seoUrl(`/courses/${seoSegment(course.slug)}`), ...(lastModified ? { lastModified } : {}) });
  }
  const shared = new Map<string, { count: number; lastModified?: Date }>();
  const specific = new Map<string, { count: number; lastModified?: Date }>();
  for (const course of published) {
    const map = course.audienceScope === "institution" ? shared : specific;
    const key = course.audienceScope === "institution" ? course.universitySlug : JSON.stringify([course.universitySlug, course.specialtySlug]);
    const existing = map.get(key) || { count: 0 };
    const date = validModifiedDate(course.updatedAt);
    existing.count++;
    if (date && (!existing.lastModified || date > existing.lastModified)) existing.lastModified = date;
    map.set(key, existing);
  }
  for (const specialty of specialties) {
    if (!visible.has(specialty.institutionSlug)) continue;
    const common = shared.get(specialty.institutionSlug);
    const exact = specific.get(JSON.stringify([specialty.institutionSlug, specialty.slug]));
    if (!common?.count && !exact?.count) continue;
    const dates = [validModifiedDate(specialty.updatedAt), common?.lastModified, exact?.lastModified].filter((date): date is Date => Boolean(date));
    const lastModified = dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : undefined;
    entries.push({ url: seoUrl(`/universities/${seoSegment(specialty.institutionSlug)}/specialties/${seoSegment(specialty.slug)}`), ...(lastModified ? { lastModified } : {}) });
  }
  return [...new Map(entries.map((entry) => [entry.url, entry])).values()];
}
