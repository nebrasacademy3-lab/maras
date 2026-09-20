import type { Course } from "@/lib/data";
import type { PublicSpecialty } from "@/lib/seo-catalog";

/** Published catalog visibility is checked upstream. Thin, empty pages stay noindex. */
export function specialtyIsIndexable(description: string, courseCount: number): boolean {
  return courseCount > 0 || description.trim().replace(/\s+/g, " ").length >= 100;
}

/** Navigation should lead to useful specialty pages, using the same rule as the sitemap. */
export function discoverableInstitutionSpecialties(specialties: PublicSpecialty[], courses: Course[], institutionSlug: string): PublicSpecialty[] {
  const institutionCourses = courses.filter((course) => course.universitySlug === institutionSlug);
  const commonCourses = institutionCourses.filter((course) => course.audienceScope === "institution").length;
  const courseCounts = new Map<string, number>();
  for (const course of institutionCourses) {
    if (course.audienceScope !== "institution" && course.specialtySlug) {
      courseCounts.set(course.specialtySlug, (courseCounts.get(course.specialtySlug) || 0) + 1);
    }
  }
  return specialties.filter((specialty) => specialty.institutionSlug === institutionSlug
    && specialtyIsIndexable(specialty.description, commonCourses + (courseCounts.get(specialty.slug) || 0)));
}
