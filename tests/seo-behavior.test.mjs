import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function isolated(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const key = "__seoTest" + crypto.randomUUID().replaceAll("-", "");
  globalThis[key] = dependencies;
  try {
    const input = "const {" + Object.keys(dependencies).join(",") + "} = globalThis[" + JSON.stringify(key) + "];\n" + source.replace(/^import .+;\r?\n/gm, "");
    return await import("data:text/javascript;base64," + Buffer.from(ts.transpileModule(input, { fileName: path, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText).toString("base64"));
  } finally { delete globalThis[key]; }
}
const seo = await isolated("../lib/seo.ts", { process: { env: { NODE_ENV: "production", APP_URL: "https://meras.example/" } } });
const build = (await isolated("../lib/seo-sitemap.ts", seo)).buildPublicSitemap;
const institution = { slug: "test-university", name: "جامعة الاختبار" };
const course = { slug: "physics", title: "الفيزياء", titleEn: "Physics", code: "PHYS101", universitySlug: institution.slug, specialtySlug: "science", specialty: "العلوم", description: "شرح الحركة والقوى", price: 150, availableForPurchase: true, rating: 4.5, ratingsCount: 2, updatedAt: "2025-01-02T00:00:00.000Z" };
const specialty = { institutionSlug: institution.slug, slug: "science", name: "العلوم", description: "مواد العلوم", updatedAt: "2025-01-01T00:00:00.000Z" };

test("canonical uses the configured origin, encodes route segments and rejects foreign paths", () => {
  const path = "/courses/" + seo.seoSegment("فيزياء/1");
  assert.equal(seo.seoUrl(path), "https://meras.example/courses/%D9%81%D9%8A%D8%B2%D9%8A%D8%A7%D8%A1%2F1");
  for (const value of ["//evil.example", "https://evil.example", "/\\evil", "/courses/with space", "/\nattack"]) assert.throws(() => seo.seoUrl(value));
  const metadata = seo.publicPageMetadata("/courses", "المواد", "  وصف <b>صحيح</b>   للمواد ");
  assert.equal(metadata.alternates.canonical, "https://meras.example/courses");
  assert.equal(metadata.openGraph.url, metadata.alternates.canonical);
  assert.equal(metadata.description, "وصف صحيح للمواد");
  assert.equal(metadata.robots.index, true);
  assert.equal(metadata.twitter.description, metadata.description);
});

test("development, unconfigured, disabled and malformed deployment origins fail closed for indexing", async () => {
  for (const env of [{}, { NODE_ENV: "development", APP_URL: "https://meras.example" }, { NODE_ENV: "production" }, { NODE_ENV: "production", APP_URL: "https://meras.example", SEO_INDEXING_ENABLED: "false" }, { NODE_ENV: "production", APP_URL: "[https://meras.example](https://meras.example)" }, { NODE_ENV: "production", APP_URL: "https://user:pass@meras.example" }, { NODE_ENV: "production", APP_URL: "http://meras.example" }, { NODE_ENV: "production", APP_URL: "http://localhost:3000" }]) {
    const seoModule = await isolated("../lib/seo.ts", { process: { env } });
    assert.equal(seoModule.searchIndexingEnabled(), false, JSON.stringify(env));
    assert.equal(seoModule.publicPageMetadata("/", "مراس", "وصف").robots.index, false);
  }
});

test("filtered and sorted catalog URLs noindex while tracking-only canonical copies remain eligible", () => {
  for (const query of [{ q: "رياضيات" }, { university: "u" }, { sort: "price" }, { page: "2" }, { q: ["", "science"] }]) assert.equal(seo.catalogHasFilters(query), true);
  for (const query of [{}, { q: "" }, { utm_source: "campaign", utm_campaign: "fall", gclid: "123" }, { fbclid: "123" }]) assert.equal(seo.catalogHasFilters(query), false);
  const metadata = seo.publicPageMetadata("/courses", "المواد", "وصف", { noindex: true });
  assert.equal(metadata.robots.index, false);
  assert.equal(metadata.robots.follow, true);
  assert.equal(metadata.robots.googleBot.index, false);
});

test("JSON-LD escapes script-breaking user content without altering parsed data", () => {
  const malicious = { title: "</script><script>alert(1)</script>&\u2028\u2029" };
  const encoded = seo.jsonLd(malicious);
  assert.doesNotMatch(encoded, /[<>&\u2028\u2029]/);
  assert.deepEqual(JSON.parse(encoded), malicious);
});

test("structured course data includes only genuine available offers and valid published ratings", () => {
  const live = seo.courseStructuredData(course)["@graph"][0];
  assert.equal(live.offers.priceCurrency, "SAR");
  assert.equal(live.offers.price, 150);
  assert.equal(live.aggregateRating.ratingCount, 2);
  assert.equal(live.provider["@id"], "https://meras.example/#organization");
  for (const invalid of [{ availableForPurchase: false }, { price: Number.NaN }, { price: -1 }]) assert.equal(seo.courseStructuredData({ ...course, ...invalid })["@graph"][0].offers, undefined);
  for (const invalid of [{ ratingsCount: 0 }, { ratingsCount: -1 }, { ratingsCount: 1.1 }, { rating: Number.NaN }, { rating: 6 }]) assert.equal(seo.courseStructuredData({ ...course, ...invalid })["@graph"][0].aggregateRating, undefined);
  assert.doesNotMatch(JSON.stringify(seo.siteStructuredData()), /PreOrder|accredit|award|aggregateRating|SearchAction/);
});

test("verification accepts only an optional Google meta token, never HTML or a URL", async () => {
  for (const [value, expected] of [["Abcd_1234-xYz", "Abcd_1234-xYz"], ["", undefined], ["<meta content='test'>", undefined], ["https://evil.example", undefined]]) {
    const seoModule = await isolated("../lib/seo.ts", { process: { env: { GOOGLE_SITE_VERIFICATION: value } } });
    assert.equal(seoModule.googleSiteVerification(), expected);
  }
});

test("sitemap uses unique public canonical URLs and truthful modification times only", () => {
  const entries = build([course, course, { ...course, slug: "missing-date", updatedAt: "invalid" }, { ...course, slug: "future", updatedAt: "2999-01-01" }, { ...course, slug: "hidden", universitySlug: "hidden" }], [institution], [specialty]);
  assert.equal(entries.filter(item => item.url.endsWith("/courses/physics")).length, 1);
  assert.equal(entries.find(item => item.url.endsWith("/courses/physics")).lastModified.toISOString(), course.updatedAt);
  assert.equal(entries.find(item => item.url.endsWith("/courses/missing-date")).lastModified, undefined);
  assert.equal(entries.find(item => item.url.endsWith("/courses/future")).lastModified, undefined);
  assert.equal(entries.find(item => item.url.endsWith("/courses/hidden")), undefined);
  assert.equal(entries.find(item => item.url === "https://meras.example/").lastModified, undefined);
  assert.equal(entries.find(item => item.url.endsWith("/specialties/science")).lastModified.toISOString(), course.updatedAt);
  assert.ok(entries.every(item => item.url.startsWith("https://meras.example/") && !item.url.includes("?") && !item.url.includes("localhost")));
  assert.ok(entries.every(item => item.priority === undefined && item.changeFrequency === undefined));
});

test("sitemap includes a genuine specialty with only common courses, never empty or hidden specialties", () => {
  const shared = { ...course, audienceScope: "institution", specialtySlug: "other" };
  const entries = build([shared], [institution], [specialty, { ...specialty, institutionSlug: "hidden" }]);
  assert.equal(entries.filter(item => item.url.includes("/specialties/")).length, 1);
  assert.ok(entries.some(item => item.url.endsWith("/specialties/science")));
  assert.ok(!build([], [institution], [specialty]).some(item => item.url.includes("/specialties/")));
});

test("robots permits reading noindex HTML and public image assets, and staging disallows all", async () => {
  const robotsRoute = await isolated("../app/robots.ts", seo);
  assert.equal(robotsRoute.dynamic, "force-dynamic");
  const active = robotsRoute.default();
  assert.deepEqual(active.rules.disallow, ["/api/", "/r/"]);
  assert.ok(active.rules.allow.includes("/api/covers/"));
  assert.equal(active.sitemap, "https://meras.example/sitemap.xml");
  const disabled = (await isolated("../app/robots.ts", { ...seo, searchIndexingEnabled: () => false })).default();
  assert.equal(disabled.rules.disallow, "/");
  assert.equal(disabled.sitemap, undefined);
});

test("robots observes runtime indexing changes without a build-time response cache", async () => {
  const env = { NODE_ENV: "production", APP_URL: "https://meras.example", SEO_INDEXING_ENABLED: "false" };
  const runtimeSeo = await isolated("../lib/seo.ts", { process: { env } });
  const route = await isolated("../app/robots.ts", runtimeSeo);
  assert.equal(route.default().rules.disallow, "/");
  env.SEO_INDEXING_ENABLED = "true";
  assert.deepEqual(route.default().rules.disallow, ["/api/", "/r/"]);
  env.SEO_INDEXING_ENABLED = "false";
  assert.equal(route.default().rules.disallow, "/");
});

test("sitemap route does not read database or publish demo URLs when indexing disabled", async () => {
  const fail = () => { throw new Error("Must not query disabled sitemap"); };
  const sitemap = await isolated("../app/sitemap.ts", { searchIndexingEnabled: () => false, getCoursesCatalog: fail, getInstitutionsCatalog: fail, getPublicSpecialtyCatalog: fail, buildPublicSitemap: fail });
  assert.equal(sitemap.dynamic, "force-dynamic");
  assert.deepEqual(await sitemap.default(), []);
});

test("sitemap reads the runtime indexing flag without waiting for ISR", async () => {
  const env = { NODE_ENV: "production", APP_URL: "https://meras.example", SEO_INDEXING_ENABLED: "false" };
  const runtimeSeo = await isolated("../lib/seo.ts", { process: { env } });
  const route = await isolated("../app/sitemap.ts", { ...runtimeSeo, getCoursesCatalog: async () => [course], getInstitutionsCatalog: async () => [institution], getPublicSpecialtyCatalog: async () => [specialty], buildPublicSitemap: build });
  assert.deepEqual(await route.default(), []);
  env.SEO_INDEXING_ENABLED = "true";
  assert.ok((await route.default()).some(item => item.url.endsWith("/courses/physics")));
  env.SEO_INDEXING_ENABLED = "false";
  assert.deepEqual(await route.default(), []);
});

test("specialty metadata returns 404 for invented slugs despite shared courses and allows real program links", async () => {
  const deps = { ...seo, cache: fn => fn, getInstitutionCatalog: async () => institution, getCoursesCatalog: async () => [{ ...course, audienceScope: "institution", specialtySlug: "other" }], getPublicSpecialtyCatalog: async () => [specialty], coursesForSpecialty: (rows, item) => rows.filter(row => row.universitySlug === item.institutionSlug && (row.audienceScope === "institution" || row.specialtySlug === item.slug)), notFound: () => { throw new Error("404"); } };
  const page = await isolated("../app/universities/[slug]/specialties/[specialtySlug]/page.tsx", deps);
  await assert.rejects(page.generateMetadata({ params: Promise.resolve({ slug: institution.slug, specialtySlug: "invented" }) }), /404/);
  const actual = await page.generateMetadata({ params: Promise.resolve({ slug: institution.slug, specialtySlug: specialty.slug }) });
  assert.equal(actual.robots.index, true);
  assert.match(actual.title, /العلوم/);
  assert.ok(actual.alternates.canonical.endsWith("/specialties/science"));
  const empty = await isolated("../app/universities/[slug]/specialties/[specialtySlug]/page.tsx", { ...deps, getCoursesCatalog: async () => [] });
  assert.equal((await empty.generateMetadata({ params: Promise.resolve({ slug: institution.slug, specialtySlug: specialty.slug }) })).robots.index, false);
});

test("both catalog metadata functions apply real query noindex and clean canonicals", async () => {
  for (const path of ["courses", "universities"]) {
    const page = await isolated(`../app/${path}/page.tsx`, seo);
    const filtered = await page.generateMetadata({ searchParams: Promise.resolve({ q: "علوم" }) });
    assert.equal(filtered.robots.index, false);
    assert.equal(filtered.alternates.canonical, "https://meras.example/" + path);
    assert.equal((await page.generateMetadata({ searchParams: Promise.resolve({}) })).robots.index, true);
  }
});

test("private routes and future admin descendants retain noindex metadata", async () => {
  const admin = await isolated("../app/admin/layout.tsx");
  assert.equal(admin.metadata.robots.index, false);
  for (const path of ["dashboard", "login", "register", "verify-email", "complete-profile", "forgot-password", "reset-password", "onboarding", "cart", "support", "favorites", "notifications", "referrals", "request-course", "supervisor", "checkout/[slug]", "learn/[slug]", "invoices/[orderNumber]", "study-tools", "study-tools/subscribe"]) {
    const source = await readFile(new URL(`../app/${path}/page.tsx`, import.meta.url), "utf8");
    assert.match(source, /robots\s*:\s*\{\s*index\s*:\s*false/, path);
  }
});

test("specialty source requires both published relationship and published specialty, independent of course membership", async () => {
  const rows = [
    { ...specialty, relationStatus: "published", specialtyStatus: "published" },
    { ...specialty, slug: "draft-link", relationStatus: "draft", specialtyStatus: "published" },
    { ...specialty, slug: "draft-specialty", relationStatus: "published", specialtyStatus: "draft" },
    { ...specialty, slug: "hidden-institution", institutionSlug: "hidden", relationStatus: "published", specialtyStatus: "published" },
  ];
  const table = { institutionSlug: "institutionSlug", specialtySlug: "slug", status: "relationStatus" };
  const definitions = { slug: "slug", name: "name", description: "description", updatedAt: "updatedAt", status: "specialtyStatus" };
  const source = await isolated("../lib/seo-catalog.ts", {
    process: { env: { DATABASE_URL: "mock-only" } }, cache: fn => fn,
    getInstitutionsCatalog: async () => [institution], getCoursesCatalog: async () => [],
    institutionSpecialties: table, catalogSpecialties: definitions,
    eq: (field, value) => row => row[field] === value,
    and: (...conditions) => row => conditions.every(condition => condition(row)),
    getDb: () => ({ select: selection => ({ from: () => ({ innerJoin: () => ({ where: condition => Promise.resolve(rows.filter(condition).map(row => Object.fromEntries(Object.entries(selection).map(([key, field]) => [key, row[field]])))) }) }) }) }),
  });
  assert.deepEqual(await source.getPublicSpecialtyCatalog(), [specialty]);
  assert.deepEqual(source.coursesForSpecialty([{ ...course, audienceScope: "institution", specialtySlug: "other" }, { ...course, universitySlug: "hidden" }], specialty).map(item => item.universitySlug), [institution.slug]);
});

test("demo catalog never invents a specialty slug or duplicate university-specialty page", async () => {
  const source = await isolated("../lib/seo-catalog.ts", { process: { env: {} }, cache: fn => fn, getInstitutionsCatalog: async () => [institution], getCoursesCatalog: async () => [course, course, { ...course, specialtySlug: undefined }, { ...course, universitySlug: "hidden" }] });
  const rows = await source.getPublicSpecialtyCatalog();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].slug, "science");
});
