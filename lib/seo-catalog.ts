import "server-only";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogSpecialties, institutionSpecialties } from "@/db/schema";
import { getCoursesCatalog, getInstitutionsCatalog } from "@/lib/catalog-store";
import type { Course } from "@/lib/data";

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
