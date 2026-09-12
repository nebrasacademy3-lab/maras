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
  for (const specialty of specialties) {
    if (!visible.has(specialty.institutionSlug)) continue;
    const rows = published.filter((course) => course.universitySlug === specialty.institutionSlug && (course.audienceScope === "institution" || course.specialtySlug === specialty.slug));
    if (!rows.length) continue;
    const dates = [specialty.updatedAt, ...rows.map((course) => course.updatedAt)].map(validModifiedDate).filter((date): date is Date => Boolean(date));
    const lastModified = dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : undefined;
    entries.push({ url: seoUrl(`/universities/${seoSegment(specialty.institutionSlug)}/specialties/${seoSegment(specialty.slug)}`), ...(lastModified ? { lastModified } : {}) });
  }
  return [...new Map(entries.map((entry) => [entry.url, entry])).values()];
}
