import { getCoursesCatalog, getInstitutionsCatalog } from "@/lib/catalog-store";

export async function GET() {
  const [institutions, courses] = await Promise.all([getInstitutionsCatalog(), getCoursesCatalog()]);
  return Response.json({ ok: true, institutions, courses }, { headers: { "cache-control": "public, max-age=120, stale-while-revalidate=600" } });
}

