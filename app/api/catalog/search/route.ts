import { getCoursesCatalog, getInstitutionsCatalog } from "@/lib/catalog-store";
import { catalogSearchMatches, type CatalogSearchResults } from "@/lib/catalog-search";

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 160);
  const [institutions, courses] = await Promise.all([getInstitutionsCatalog(), getCoursesCatalog()]);
  const publishedInstitutions = new Set(institutions.map(item => item.slug));
  const matchingInstitutions = (query ? institutions.filter(item => catalogSearchMatches(query, [item.name, item.nameEn, item.region, item.type, ...(item.aliases || [])])) : [...institutions].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured))));
  const publicCourses = courses.filter(item => publishedInstitutions.has(item.universitySlug));
  const matchingCourses = query ? publicCourses.filter(item => catalogSearchMatches(query, [item.title, item.titleEn, item.code || "", item.specialty, item.university])) : [...publicCourses].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
  const results: CatalogSearchResults = {
    institutions: matchingInstitutions.slice(0, 6).map(({ slug, name, nameEn, region, type, logo, domain }) => ({ slug, name, nameEn, region, type, logo, domain })),
    courses: matchingCourses.slice(0, 6).map(({ slug, title, titleEn, university, specialty, color, icon }) => ({ slug, title, titleEn, university, specialty, color, icon })),
  };
  return Response.json(results, { headers: { "cache-control": "public, max-age=30, s-maxage=90, stale-while-revalidate=600" } });
}
