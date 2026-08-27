import { closeDb, getPool } from "@/db";
import { syncCatalogTemplates, type CatalogSeedMode } from "@/lib/catalog-sync";

async function main() {
  if (process.env.AUTO_SEED_CATALOG === "false") {
    console.log("Catalog bootstrap skipped (AUTO_SEED_CATALOG=false). ");
    return;
  }
  const mode: CatalogSeedMode = process.env.CATALOG_SEED_MODE === "full" ? "full" : "core";
  const lockClient = await getPool().connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock(hashtext('meras_catalog_bootstrap_v1'))");
    const result = await syncCatalogTemplates(49, mode);
    console.log(`Catalog ready: ${result.totalInstitutions} institutions, ${result.specialties} new specialties, ${result.courses} new courses, ${result.lessons} new lessons (${mode}).`);
  } finally {
    await lockClient.query("SELECT pg_advisory_unlock(hashtext('meras_catalog_bootstrap_v1'))").catch(() => undefined);
    lockClient.release();
  }
}

try {
  await main();
} catch (error) {
  console.error("Catalog bootstrap failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
} finally {
  await closeDb();
}
