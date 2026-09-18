import { getInformationContent } from "@/lib/information-content";
import { getCoursesCatalog, getInstitutionsCatalog } from "@/lib/catalog-store";
import { getPublicBundleCatalog, getPublicSpecialtyCatalog } from "@/lib/seo-catalog";
import { buildSeoPages } from "@/lib/seo-pages";
import { renderPublicDiscovery } from "@/lib/seo-discovery";
import { searchIndexingEnabled } from "@/lib/seo";

export const dynamic = "force-dynamic";
const headers = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
/** Optional public directory. No special ranking or recommendation is promised. */
export async function GET() {
  if (!searchIndexingEnabled()) {
    return new Response("Public discovery is disabled.\n", { status: 404, headers: { ...headers, "x-robots-tag": "noindex, nofollow" } });
  }
  try {
    const [{ content }, courses, institutions, specialties, bundles] = await Promise.all([
      getInformationContent(), getCoursesCatalog(), getInstitutionsCatalog(), getPublicSpecialtyCatalog(), getPublicBundleCatalog(),
    ]);
    const pages = buildSeoPages(courses, institutions, specialties, bundles);
    return new Response(renderPublicDiscovery(content.about.intro, pages), { headers });
  } catch {
    // Do not cache a partial directory, expose provider/database details, or invent catalog entries.
    console.error("[seo] Public discovery directory is temporarily unavailable");
    return new Response("Public discovery is temporarily unavailable.\n", { status: 503, headers: { ...headers, "retry-after": "60", "x-robots-tag": "noindex, nofollow" } });
  }
}
