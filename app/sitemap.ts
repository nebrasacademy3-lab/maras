import type { MetadataRoute } from "next";
import { getCoursesCatalog, getInstitutionsCatalog } from "@/lib/catalog-store";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
function catalogDate(value?: string) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? new Date(parsed) : new Date("2026-08-22T00:00:00.000Z");
}
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [courses, institutions] = await Promise.all([getCoursesCatalog(), getInstitutionsCatalog()]);
  const staticPaths = ["", "/universities", "/courses", "/meras-ai", "/how-it-works", "/request-course", "/support", "/contact", "/terms", "/privacy", "/refund-policy", "/content-policy", "/accessibility"];
  return [
    ...staticPaths.map((path) => ({ url: `${baseUrl}${path}`, lastModified: new Date("2026-08-22"), changeFrequency: path === "" ? "daily" as const : "weekly" as const, priority: path === "" ? 1 : 0.7 })),
    ...institutions.map((institution) => ({ url: `${baseUrl}/universities/${institution.slug}`, lastModified: new Date("2026-08-22"), changeFrequency: "weekly" as const, priority: 0.75 })),
    ...courses.map((course) => ({ url: `${baseUrl}/courses/${course.slug}`, lastModified: catalogDate(course.updatedAt), changeFrequency: "weekly" as const, priority: 0.85 })),
    ...Array.from(new Map(courses.filter((course) => course.specialtySlug).map((course) => [`${course.universitySlug}:${course.specialtySlug}`, course])).values()).map((course) => ({ url: `${baseUrl}/universities/${course.universitySlug}/specialties/${course.specialtySlug}`, lastModified: catalogDate(course.updatedAt), changeFrequency: "weekly" as const, priority: 0.78 })),
  ];
}
