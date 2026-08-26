import { getCoursesCatalog, getInstitutionsCatalog } from "@/lib/catalog-store";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim().toLocaleLowerCase("ar") || "";
  const [institutions, courses] = await Promise.all([getInstitutionsCatalog(), getCoursesCatalog()]);
  const matchingInstitutions = query
    ? institutions.filter((item) => `${item.name} ${item.nameEn} ${item.region} ${item.type}`.toLocaleLowerCase("ar").includes(query))
    : [...institutions].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
  const matchingCourses = query
    ? courses.filter((item) => `${item.title} ${item.titleEn} ${item.code || ""} ${item.specialty} ${item.university}`.toLocaleLowerCase("ar").includes(query))
    : [...courses].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
  return Response.json({ institutions: matchingInstitutions.slice(0, 6), courses: matchingCourses.slice(0, 6) }, { headers: { "cache-control": "private, max-age=30" } });
}
