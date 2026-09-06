import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogSpecialties, institutionSpecialties } from "@/db/schema";
import { getInstitutionCatalog, invalidateCatalogCache } from "@/lib/catalog-store";
import { specialtySlug } from "@/lib/catalog-templates";
import { getVerifiedInstitutionPrograms } from "@/lib/official-programs";

export async function syncOfficialInstitutionPrograms(institutionSlug: string) {
  const institution = await getInstitutionCatalog(institutionSlug, true);
  if (!institution) throw new Error("institution_not_found");
  const verified = await getVerifiedInstitutionPrograms(institution.slug, institution.domain, institution.name);
  const officialPrograms = verified.programs.filter((program) => program.verificationStatus === "official-program");
  if (!verified.liveVerified || !officialPrograms.length) {
    return { institution: institution.name, sourceUrl: verified.sourceUrl, liveVerified: false, officialPrograms: 0, created: 0, updated: 0, linked: 0 };
  }

  const db = getDb();
  const existingRows = await db.select().from(catalogSpecialties);
  const existingByName = new Map(existingRows.map((row) => [row.name, row]));
  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;
  let linked = 0;

  for (const [index, program] of officialPrograms.entries()) {
    const existing = existingByName.get(program.name);
    const resolvedSlug = existing?.slug || specialtySlug(program.name);
    if (existing) {
      await db.update(catalogSpecialties).set({
        sourceUrl: program.sourceUrl || verified.sourceUrl,
        verifiedAt: now.slice(0, 10),
        verificationStatus: "official-program",
        degree: program.degree,
        updatedAt: now,
      }).where(eq(catalogSpecialties.slug, existing.slug));
      updated += 1;
    } else {
      await db.insert(catalogSpecialties).values({
        slug: resolvedSlug,
        name: program.name,
        description: `برنامج أكاديمي موثق في ${institution.name} وفق المصدر الرسمي، ويمكن للإدارة ربط مواد مراس به عند توفرها.`,
        sourceUrl: program.sourceUrl || verified.sourceUrl,
        verifiedAt: now.slice(0, 10),
        verificationStatus: "official-program",
        faculty: null,
        degree: program.degree,
        status: "published",
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing();
      created += 1;
      existingByName.set(program.name, { slug: resolvedSlug } as typeof existingRows[number]);
    }
    const inserted = await db.insert(institutionSpecialties).values({
      institutionSlug: institution.slug,
      specialtySlug: resolvedSlug,
      sortOrder: index,
      status: "published",
    }).onConflictDoNothing().returning({ id: institutionSpecialties.id });
    if (inserted.length) linked += 1;
  }

  invalidateCatalogCache();
  return { institution: institution.name, sourceUrl: verified.sourceUrl, liveVerified: true, officialPrograms: officialPrograms.length, created, updated, linked };
}
