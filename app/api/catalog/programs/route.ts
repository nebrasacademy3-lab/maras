import { cleanText, jsonError } from "@/lib/api";
import { getInstitutionCatalog, getProgramsCatalog } from "@/lib/catalog-store";

export async function GET(request: Request) {
  const slug = cleanText(new URL(request.url).searchParams.get("institution"), 120);
  const institution = await getInstitutionCatalog(slug);
  if (!institution) return jsonError("اختر جامعة أو كلية من القائمة", 404);

  const catalog = await getProgramsCatalog(institution.slug);
  return Response.json({
    institution: { slug: institution.slug, name: institution.name },
    programs: catalog.programs,
    sourceUrl: catalog.sourceUrl,
    liveVerified: catalog.liveVerified,
  }, { headers: { "cache-control": "public, max-age=900, stale-while-revalidate=21600" } });
}
