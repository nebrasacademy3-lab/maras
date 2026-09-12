import "server-only";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogSpecialties, institutionSpecialties } from "@/db/schema";
import { getCoursesCatalog, getInstitutionsCatalog } from "@/lib/catalog-store";
import type { Course } from "@/lib/data";
import { listActiveCourseBundles } from "@/lib/course-bundles";
import { buildSeoPages } from "@/lib/seo-pages";

export type PublicSpecialty = { institutionSlug: string; slug: string; name: string; description: string; updatedAt?: string };
export const getPublicSpecialtyCatalog = cache(async (): Promise<PublicSpecialty[]> => {
  const [institutions, courses] = await Promise.all([getInstitutionsCatalog(), getCoursesCatalog()]);
  const visible = new Set(institutions.map(item => item.slug));
  if (process.env.DATABASE_URL) {
    const rows = await getDb().select({ institutionSlug: institutionSpecialties.institutionSlug, slug: catalogSpecialties.slug, name: catalogSpecialties.name, description: catalogSpecialties.description, updatedAt: catalogSpecialties.updatedAt })
      .from(institutionSpecialties).innerJoin(catalogSpecialties, eq(catalogSpecialties.slug, institutionSpecialties.specialtySlug))
      .where(and(eq(institutionSpecialties.status, "published"), eq(catalogSpecialties.status, "published")));
    return rows.filter(row => visible.has(row.institutionSlug));
  }
  // Local/demo catalogs may lack specialty slugs; never invent pages for them.
  const unique = new Map<string, PublicSpecialty>();
  for (const course of courses) if (course.specialtySlug && visible.has(course.universitySlug)) {
    unique.set(`${course.universitySlug}:${course.specialtySlug}`, { institutionSlug: course.universitySlug, slug: course.specialtySlug, name: course.specialty, description: "", updatedAt: course.updatedAt });
  }
  return [...unique.values()];
});
export function coursesForSpecialty(courses: Course[], specialty: PublicSpecialty) {
  return courses.filter(course => course.universitySlug === specialty.institutionSlug && (course.audienceScope === "institution" || course.specialtySlug === specialty.slug));
}

export const getPublicBundleCatalog = cache(async () => {
  if (!process.env.DATABASE_URL) return [];
  const [bundles, institutions, courses] = await Promise.all([listActiveCourseBundles(), getInstitutionsCatalog(), getCoursesCatalog()]);
  const visible = new Set(institutions.map((item) => item.slug));
  const purchasable = new Set(courses.filter((course) => visible.has(course.universitySlug) && course.availableForPurchase).map((course) => course.slug));
  return bundles.filter((bundle) => bundle.courseSlugs.length >= 2 && bundle.courseSlugs.every((slug) => purchasable.has(slug)));
});
export async function getPublicSeoPages() {
  const [courses, institutions, specialties, bundles] = await Promise.all([getCoursesCatalog(), getInstitutionsCatalog(), getPublicSpecialtyCatalog(), getPublicBundleCatalog()]);
  return buildSeoPages(courses, institutions, specialties, bundles);
}
