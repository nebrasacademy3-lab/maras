import type { MetadataRoute } from "next";
import { getCoursesCatalog, getInstitutionsCatalog } from "@/lib/catalog-store";

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://meras-alelm.glossy-sun-8084.chatgpt.site").replace(/\/$/, "");
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [courses, institutions] = await Promise.all([getCoursesCatalog(), getInstitutionsCatalog()]);
  const staticPaths = ["", "/universities", "/courses", "/how-it-works", "/request-course", "/support", "/contact", "/terms", "/privacy", "/refund-policy", "/content-policy", "/accessibility"];
  return [
    ...staticPaths.map((path) => ({ url: `${baseUrl}${path}`, lastModified: new Date("2026-08-22"), changeFrequency: path === "" ? "daily" as const : "weekly" as const, priority: path === "" ? 1 : 0.7 })),
    ...institutions.map((institution) => ({ url: `${baseUrl}/universities/${institution.slug}`, lastModified: new Date("2026-08-22"), changeFrequency: "weekly" as const, priority: 0.75 })),
    ...courses.map((course) => ({ url: `${baseUrl}/courses/${course.slug}`, lastModified: new Date("2026-08-22"), changeFrequency: "weekly" as const, priority: 0.85 })),
  ];
}
