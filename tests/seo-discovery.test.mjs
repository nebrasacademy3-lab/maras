import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { seoPureDependencies } from "./helpers/pure-source.mjs";

async function isolated(path, dependencies = {}) {
  dependencies = await seoPureDependencies(dependencies);
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const key = "__discoveryTest" + crypto.randomUUID().replaceAll("-", "");
  globalThis[key] = dependencies;
  try {
    const input = "const {" + Object.keys(dependencies).join(",") + "} = globalThis[" + JSON.stringify(key) + "];\n" + source.replace(/^import .+;\r?\n/gm, "");
    return await import("data:text/javascript;base64," + Buffer.from(ts.transpileModule(input, { fileName: path, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString("base64"));
  } finally { delete globalThis[key]; }
}
const seo = await isolated("../lib/seo.ts", { process: { env: { NODE_ENV: "production", APP_URL: "https://maras-qa.example" } } });
const pages = await isolated("../lib/seo-pages.ts", seo);
const discovery = await isolated("../lib/seo-discovery.ts", seo);
const institution = { slug: "test-university", name: "جامعة الاختبار" };
const course = { slug: "physics", title: "الفيزياء", university: institution.name, universitySlug: institution.slug, specialtySlug: "science", description: "شرح الحركة والقوى", availableForPurchase: true, price: 100, units: [] };
const dependencies = {
  ...seo, ...pages, ...discovery,
  getInformationContent: async () => ({ content: { about: { intro: "منصة للمذاكرة" } } }),
  getCoursesCatalog: async () => [course], getInstitutionsCatalog: async () => [institution],
  getPublicSpecialtyCatalog: async () => [], getPublicBundleCatalog: async () => [],
};

test("discovery exposes canonical public pages without serializing private fields", () => {
  const inventory = pages.buildSeoPages([{ ...course, passwordHash: "private-fixture-marker", units: [{ lessons: [{ free: false, ready: true, objectKey: "paid-fixture-marker" }] }] }, { ...course, slug: "hidden", universitySlug: "not-published" }], [institution], []);
  const body = discovery.renderPublicDiscovery("منصة للمذاكرة", inventory);
  assert.match(body, /https:\/\/maras-qa\.example\/courses\/physics/);
  assert.match(body, /https:\/\/maras-qa\.example\/universities\/test-university/);
  assert.doesNotMatch(body, /private-fixture-marker|paid-fixture-marker|\/courses\/hidden/);
});

test("identity copy is bounded and cannot inject links or headings", () => {
  const body = discovery.renderPublicDiscovery("مراس", [], {
    name: "مراس العلم",
    alternateNames: ["Maras Al Elm", "fake ](https://evil.example)"],
    description: "<script>bad()</script> وصف عام",
    distinction: "# forged heading\nليست جهة مانحة",
  });
  assert.match(body, /هوية مراس العلم/);
  assert.match(body, /Maras Al Elm/);
  assert.doesNotMatch(body, /evil\.example|<script|bad\(\)|# forged heading/);
});

test("discovery rejects private, foreign, traversal and query URLs, and deduplicates entries", () => {
  const paths = ["/courses/physics", "/courses/physics", "/api/auth/me", "/admin", "/learn/physics", "//evil.example", "https://evil.example", "/courses/../admin", "/courses/%2e%2e/admin", "/courses/physics?token=x", "/courses/physics#private"];
  const body = discovery.renderPublicDiscovery("مراس", paths.map(path => ({ path, title: "الفيزياء", description: "شرح", kind: "مادة" })));
  assert.equal(body.split("https://maras-qa.example/courses/physics").length - 1, 1);
  assert.doesNotMatch(body, /evil\.example|token=|\/admin|\/api\/|\/learn\//);
});

test("discovery cannot inject markup, forged links or new headings through catalog copy", () => {
  const body = discovery.renderPublicDiscovery("<script>unsafe()</script>مراس", [{ path: "/courses/physics", title: "فيزياء ](https://evil.example)\n# fake", description: "<b>شرح</b> [attack](https://evil.example)\u202e", kind: "مادة" }]);
  assert.doesNotMatch(body, /evil\.example|<script|unsafe\(\)|<b>|\u202e|\n# fake/);
  assert.match(body, /\/courses\/physics\)/);
});

test("discovery output is bounded in UTF-8 bytes and links to the full sitemap", () => {
  const inventory = Array.from({ length: 1500 }, (_, i) => ({ path: `/courses/item-${i}`, title: "مادة ".repeat(40), description: "شرح ".repeat(200), kind: "مادة" }));
  const body = discovery.renderPublicDiscovery("مراس", inventory);
  assert.ok(Buffer.byteLength(body, "utf8") <= discovery.DISCOVERY_MAX_BYTES);
  assert.ok((body.match(/\/courses\/item-/g) || []).length <= discovery.DISCOVERY_MAX_ENTRIES);
  assert.match(body, /https:\/\/maras-qa\.example\/sitemap\.xml/);
});

test("disabled discovery does not query any catalog and returns no-store noindex", async () => {
  const fail = () => { throw new Error("disabled discovery must not query"); };
  const route = await isolated("../app/llms.txt/route.ts", { ...dependencies, searchIndexingEnabled: () => false, getInformationContent: fail, getCoursesCatalog: fail, getInstitutionsCatalog: fail, getPublicSpecialtyCatalog: fail, getPublicBundleCatalog: fail });
  assert.equal(route.dynamic, "force-dynamic");
  const response = await route.GET();
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("x-robots-tag"), /noindex/);
  assert.doesNotMatch(await response.text(), /\/courses\/|\/universities\//);
});

test("enabled discovery uses the same public eligibility inventory and safe headers", async () => {
  const route = await isolated("../app/llms.txt/route.ts", dependencies);
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-type"), /text\/plain; charset=utf-8/);
  assert.match(await response.text(), /\/courses\/physics/);
});

test("catalog failure returns retryable 503 without caching or exposing internal errors", async () => {
  const route = await isolated("../app/llms.txt/route.ts", { ...dependencies, getCoursesCatalog: async () => { throw new Error("private-database-fixture-detail"); } });
  const response = await route.GET();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("x-robots-tag"), /noindex/);
  assert.doesNotMatch(await response.text(), /private-database-fixture-detail|\/courses\//);
});

test("discovery observes runtime indexing changes without retaining the previous response", async () => {
  let enabled = true;
  const route = await isolated("../app/llms.txt/route.ts", { ...dependencies, searchIndexingEnabled: () => enabled });
  assert.equal((await route.GET()).status, 200);
  enabled = false;
  assert.equal((await route.GET()).status, 404);
});
