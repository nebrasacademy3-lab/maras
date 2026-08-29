import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogStore = await readFile(join(root, "lib/catalog-store.ts"), "utf8");
const catalogSync = await readFile(join(root, "lib/catalog-sync.ts"), "utf8");

function runCatalogModule(env, source) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", source], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "", CATALOG_DEMO_MODE: "false", ...env },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

const catalogCountsSource = `
  const catalog = await import("./lib/catalog-store.ts");
  const [institutions, courses, programs] = await Promise.all([
    catalog.getInstitutionsCatalog(),
    catalog.getCoursesCatalog(),
    catalog.getProgramsCatalog("ksu"),
  ]);
  console.log(JSON.stringify({ institutions: institutions.length, courses: courses.length, programs: programs.programs.length }));
`;

test("catalog is empty without a database unless non-production demo mode is explicit", () => {
  assert.deepEqual(runCatalogModule({ NODE_ENV: "development" }, catalogCountsSource), { institutions: 0, courses: 0, programs: 0 });

  const demo = runCatalogModule({ NODE_ENV: "test", CATALOG_DEMO_MODE: "true" }, catalogCountsSource);
  assert.ok(demo.institutions > 0);
  assert.ok(demo.courses > 0);

  assert.deepEqual(runCatalogModule({ NODE_ENV: "production", CATALOG_DEMO_MODE: "true" }, catalogCountsSource), { institutions: 0, courses: 0, programs: 0 });
});

test("database-backed catalog paths do not merge static records or program fallbacks", () => {
  assert.match(catalogStore, /const catalogDemoEnabled = \(\) => process\.env\.NODE_ENV !== "production" && process\.env\.CATALOG_DEMO_MODE === "true"/);
  assert.match(catalogStore, /if \(!process\.env\.DATABASE_URL\) return catalogDemoEnabled\(\) \? staticInstitutionFallback\(\) : \[\]/);
  assert.match(catalogStore, /if \(!process\.env\.DATABASE_URL\) return catalogDemoEnabled\(\) \? staticCourseFallback\(\) : \[\]/);
  assert.doesNotMatch(catalogStore, /for \(const item of staticInstitutions\)/);
  assert.doesNotMatch(catalogStore, /for \(const item of staticCourses\)/);
  assert.doesNotMatch(catalogStore, /const merged =/);
  assert.doesNotMatch(catalogStore, /resolvedUnits/);
  assert.equal((catalogStore.match(/return getVerifiedInstitutionPrograms/g) || []).length, 1);
});

test("catalog metrics ignore revoked and expired course access", () => {
  assert.match(catalogStore, /and\(isNull\(courseAccess\.revokedAt\), or\(isNull\(courseAccess\.expiresAt\), gt\(courseAccess\.expiresAt, now\)\)\)/);
});

test("recommendations exclude owned and unpurchasable courses", () => {
  const slugs = runCatalogModule({ NODE_ENV: "test" }, `
    const { selectRecommendedCourses } = await import("./lib/catalog-store.ts");
    const course = (slug, universitySlug, specialty, availableForPurchase = true) => ({
      slug, universitySlug, specialty, availableForPurchase,
      title: slug, titleEn: slug, university: universitySlug, description: "", price: 1,
      rating: 0, ratingsCount: 0, students: 0, duration: "1 دقيقة", lessons: 1,
      updatedAt: "2026-01-01", instructor: "", color: "", icon: "", access: "", units: [],
    });
    const rows = [
      course("owned", "u1", "s1"),
      course("not-ready", "u1", "s1", false),
      course("primary", "u1", "s1"),
      course("same-program", "u2", "s1"),
      course("same-institution", "u1", "s2"),
      course("unrelated", "u2", "s2"),
    ];
    console.log(JSON.stringify(selectRecommendedCourses(rows, "u1", "s1", ["owned"]).map((item) => item.slug)));
  `);
  assert.deepEqual(slugs, ["primary", "same-program", "same-institution"]);
});

test("template sync creates reviewable drafts tied only to database institutions", () => {
  assert.match(catalogSync, /const TEMPLATE_STATUS = "draft" as const/);
  assert.match(catalogSync, /const coreTemplates = staticCourses\.filter\(\(course\) => institutionBySlug\.has\(course\.universitySlug\)\)/);
  assert.ok((catalogSync.match(/status: TEMPLATE_STATUS/g) || []).length >= 7);
  assert.doesNotMatch(catalogSync, /status: "published",\n\s+featured: (?:Boolean\(course\.featured\)|false)/);
});
