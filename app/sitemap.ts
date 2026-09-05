import type { MetadataRoute } from "next";
import { getCoursesCatalog, getInstitutionsCatalog } from "@/lib/catalog-store";
import { getPublicSpecialtyCatalog } from "@/lib/seo-catalog";
import { searchIndexingEnabled } from "@/lib/seo";
import { buildPublicSitemap } from "@/lib/seo-sitemap";

export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!searchIndexingEnabled()) return [];
  const [courses, institutions, specialties] = await Promise.all([getCoursesCatalog(), getInstitutionsCatalog(), getPublicSpecialtyCatalog()]);
  return buildPublicSitemap(courses, institutions, specialties);
}
