import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

async function isolated(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const key = "__seoDiscovery" + crypto.randomUUID().replaceAll("-", "");
  globalThis[key] = dependencies;
  try {
    const input = "const {" + Object.keys(dependencies).join(",") + "} = globalThis[" + JSON.stringify(key) + "];\n" + source.replace(/^import .+;\r?\n/gm, "");
    return await import("data:text/javascript;base64," + Buffer.from(ts.transpileModule(input, { fileName: path, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText).toString("base64"));
  } finally { delete globalThis[key]; }
}
const env = { NODE_ENV: "production", APP_URL: "https://maras.example", DATABASE_URL: "test-only", INDEXNOW_ENABLED: "true", INDEXNOW_KEY: "test-verification-12345" };
const seo = await isolated("../lib/seo.ts", { process: { env } });
const pages = await isolated("../lib/seo-pages.ts", seo);
const course = { slug: "physics", title: "الفيزياء", university: "جامعة الاختبار", universitySlug: "university", description: "شرح الطاقة", price: 100, availableForPurchase: true, specialtySlug: "science" };
const second = { ...course, slug: "math", title: "الرياضيات", price: 80 };
const institution = { slug: "university", name: "جامعة الاختبار" };
const bundle = { slug: "science", title: "باقة العلوم", description: "مادتان للمذاكرة", courseSlugs: ["physics", "math"], courses: [course, second], subtotal: 180, total: 150, discount: 30 };

test("public inventory and sitemap include only bundles whose complete membership remains purchasable and visible", async () => {
  const build = (await isolated("../lib/seo-sitemap.ts", seo)).buildPublicSitemap;
  for (const inventory of [rows => pages.buildSeoPages(rows, [institution], [], [bundle]), rows => build(rows, [institution], [], [bundle])]) {
    const valid = inventory([course, second]).map(item => item.path || new URL(item.url).pathname);
    for (const path of ["/tools", "/about", "/faq", "/bundles", "/bundles/science"]) assert.ok(valid.includes(path));
    for (const rows of [[course], [course, { ...second, availableForPurchase: false }], [course, { ...second, universitySlug: "hidden" }]]) {
      assert.ok(!inventory(rows).some(item => (item.path || item.url).endsWith("/bundles/science")));
    }
  }
});

test("metadata overrides accept plain text only and preserve canonical, privacy and deployment indexing controls", async () => {
  const valid = pages.validateSeoOverride({ title: " عنوان واضح ", description: "وصف موجز" });
  assert.deepEqual(valid, { title: "عنوان واضح", description: "وصف موجز" });
  for (const input of [{ title: "<script>x</script>", description: "" }, { title: "x".repeat(101), description: "" }, { title: "", description: "x".repeat(181) }, { title: "", description: "", canonical: "https://evil.test" }, { title: "", description: "", robots: true }, { title: null, description: "" }]) assert.throws(() => pages.validateSeoOverride(input), TypeError);
  let stored = JSON.stringify(valid);
  const deps = { ...seo, ...pages, createHash, cache: fn => fn, eq: () => true, platformSettings: {}, process: { env }, getDb: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ value: stored }] }) }) }) }) };
  const settings = await isolated("../lib/seo-settings.ts", deps);
  assert.equal(settings.parseSeoOverride('{"title":"<script>","description":""}'), null);
  const metadata = await settings.resolvedPublicPageMetadata("/courses/physics", "أصلي", "الوصف الأصلي", { noindex: true });
  assert.equal(metadata.title, valid.title);
  assert.equal(metadata.description, valid.description);
  assert.equal(metadata.alternates.canonical, "https://maras.example/courses/physics");
  assert.equal(metadata.robots.index, false);
  assert.equal(metadata.robots.googleBot.index, false);
  stored = "{}";
  assert.equal((await settings.resolvedPublicPageMetadata("/courses/physics", "أصلي", "وصف")).title, "أصلي");
  assert.notEqual(settings.seoOverrideKey("/courses/a"), settings.seoOverrideKey("/courses/b"));
});

test("IndexNow rejects private, foreign, query and encoded traversal URLs and never sends while queuing", async () => {
  const writes = [];
  const queue = await isolated("../lib/seo-indexnow.ts", { ...seo, ...pages, createHash, process: { env }, platformSettings: { key: "key" }, getDb: () => ({ transaction: async fn => fn({ insert: () => ({ values: value => ({ onConflictDoUpdate: async () => writes.push(value) }) }) }) }), fetch: () => { throw new Error("Queue must never send HTTP"); } });
  for (const path of ["/", "/tools", "/bundles/a", "/courses/" + encodeURIComponent("فيزياء"), "/universities/u/specialties/s"]) assert.equal(queue.isPublicSeoPath(path), true, path);
  for (const path of ["/admin", "/study-tools", "/api/users", "//evil.test", "https://evil.test", "/courses/a?token=secret", "/courses/../admin", "/courses/%2e%2e", "/courses/%252e%252e", "/courses/a%2Fb", "/bundles/a/specialties/b", "/courses/a#private"]) {
    assert.equal(queue.isPublicSeoPath(path), false, path);
    assert.throws(() => queue.indexNowPayload([path]), TypeError);
  }
  assert.deepEqual(queue.indexNowPayload(["/tools", "/tools"]).urlList, ["https://maras.example/tools"]);
  const result = await queue.enqueuePublicSeoUrls(["/tools", "/tools"]);
  assert.equal(result.queued, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].isPublic, false);
  assert.equal(JSON.parse(writes[0].value).path, "/tools");
  const disabled = await isolated("../lib/seo-indexnow.ts", { ...seo, ...pages, process: { env: { ...env, INDEXNOW_ENABLED: "false" } }, getDb: () => { throw new Error("disabled"); }, fetch: () => { throw new Error("disabled"); } });
  assert.deepEqual(await disabled.enqueuePublicSeoUrls(["/tools"]), { queued: 0, disabled: true });
  assert.equal((await disabled.dispatchSeoIndexNow()).status, "disabled");
});

test("IndexNow dispatch retains failed URLs with backoff and deletes only a successful batch", async () => {
  for (const status of [200, 202, 429, 500]) {
    const deleted = [], updated = [], requests = [];
    const queued = { key: "queued", value: JSON.stringify({ path: "/tools", attempts: 0, nextAttemptAt: "2025-01-01T00:00:00.000Z" }) };
    const tx = {
      execute: async () => ({ rows: [{ acquired: true }] }),
      select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => ({ for: async () => [queued] }) }) }) }) }),
      delete: () => ({ where: async condition => deleted.push(condition) }),
      update: () => ({ set: value => ({ where: async () => updated.push(value) }) }),
    };
    const queue = await isolated("../lib/seo-indexnow.ts", { ...seo, ...pages, createHash, process: { env }, platformSettings: {}, sql: () => "", eq: () => true, lte: () => true, and: () => true, asc: () => true, getDb: () => ({ transaction: async fn => fn(tx) }), fetch: async (url, init) => { requests.push({ url, init }); return new Response(null, { status }); } });
    const result = await queue.dispatchSeoIndexNow();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.indexnow.org/indexnow");
    assert.equal(requests[0].init.redirect, "error");
    assert.deepEqual(JSON.parse(requests[0].init.body).urlList, ["https://maras.example/tools"]);
    if (status === 200 || status === 202) { assert.equal(result.status, "submitted"); assert.equal(deleted.length, 1); assert.equal(updated.length, 0); }
    else { assert.equal(result.status, "retry"); assert.equal(deleted.length, 0); assert.equal(JSON.parse(updated[0].value).attempts, 1); assert.ok(Date.parse(updated[0].updatedAt) > Date.now()); }
  }
});

test("SEO API refuses anonymous, students, service tokens and cross-origin edits before persistence", async () => {
  for (const [user, origin] of [[null, true], [{ id: 2, role: "student" }, true], [{ id: 3, role: "admin" }, false]]) {
    const api = await isolated("../app/api/admin/seo/route.ts", { getSessionUser: async () => user, roleAllowed: actor => actor?.role === "admin", sameOriginRequest: () => origin, checkRateLimit: async () => true, jsonError: (message, status = 400) => Response.json({ error: message }, { status }), getDb: () => { throw new Error("Must not access persistence"); } });
    const request = new Request("https://maras.example/api/admin/seo", { method: "POST", headers: { authorization: "Bearer irrelevant" }, body: "{}" });
    assert.equal((await api.POST(request)).status, 403);
  }
});

test("SEO API rejects oversized, malformed, unpublished and conflicting edits without changing a row", async () => {
  const body = await isolated("../lib/request-body.ts");
  let mutations = 0;
  const tx = { execute: async () => ({}), select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ value: '{"title":"existing","description":""}', updatedAt: "2026-01-01" }] }) }) }), insert: () => { mutations += 1; throw new Error("No write expected"); } };
  const api = await isolated("../app/api/admin/seo/route.ts", { ...body, ...pages, createHash, seoOverrideKey: path => path, getPublicSeoPages: async () => [{ path: "/tools" }], platformSettings: {}, sql: () => "", eq: () => true, AdminMfaError: class extends Error {}, getSessionUser: async () => ({ id: 1, email: "admin@example.test", role: "admin" }), roleAllowed: () => true, sameOriginRequest: () => true, checkRateLimit: async () => true, jsonError: (message, status = 400) => Response.json({ error: message }, { status }), getDb: () => ({ transaction: async fn => fn(tx) }) });
  for (const [input, status] of [["null", 400], ["{", 400], [JSON.stringify({ value: "x".repeat(9000) }), 413], [JSON.stringify({ action: "save", path: "/admin", title: "", description: "", version: null }), 404], [JSON.stringify({ action: "save", path: "/tools", title: "", description: "", version: null }), 409]]) {
    const response = await api.POST(new Request("https://maras.example/api/admin/seo", { method: "POST", body: input }));
    assert.equal(response.status, status);
  }
  assert.equal(mutations, 0);
});

test("public bundle detail responds with not-found for inactive or unknown bundles", async () => {
  const page = await isolated("../app/bundles/[slug]/page.tsx", { getPublicBundleCatalog: async () => [], notFound: () => { throw new Error("404"); } });
  await assert.rejects(page.generateMetadata({ params: Promise.resolve({ slug: "not-published" }) }), /404/);
  await assert.rejects(page.default({ params: Promise.resolve({ slug: "not-published" }) }), /404/);
});

test("FAQ answers and live bundle membership exist in server HTML before browser JavaScript", async () => {
  const content = await isolated("../lib/seo-content.ts");
  const dependencies = { React, ...seo, ...content, styles: {}, Link: ({ children, href }) => React.createElement("a", { href }, children), PublicInformationPage: ({ title, children }) => React.createElement("main", null, React.createElement("h1", null, title), children) };
  const faq = await isolated("../app/faq/page.tsx", dependencies);
  const html = renderToStaticMarkup(faq.default());
  for (const item of content.PUBLIC_FAQ) { assert.ok(html.includes(item.question)); assert.ok(html.includes(item.answer)); }
  const structured = JSON.parse(html.match(/<script[^>]+type="application\/ld\+json"[^>]*>(.*?)<\/script>/s)[1]);
  assert.equal(structured.mainEntity.length, content.PUBLIC_FAQ.length);
  const catalog = await isolated("../app/bundles/page.tsx", { ...dependencies, getPublicBundleCatalog: async () => [bundle] });
  const bundleHtml = renderToStaticMarkup(await catalog.default());
  assert.ok(bundleHtml.includes("باقة العلوم"));
  assert.ok(bundleHtml.includes("/courses/physics"));
  assert.ok(bundleHtml.includes("/courses/math"));
  assert.ok(bundleHtml.includes("/bundles/science"));
});

test("structured identity uses published optional details and excludes invalid or duplicated links", () => {
  const identity = seo.siteStructuredData({ legalName: "جهة معلنة", description: "وصف منشور", sameAs: ["https://example.test/account", "https://example.test/account", "javascript:alert(1)", "https://user:pass@example.test/"] })["@graph"][0];
  assert.equal(identity.legalName, "جهة معلنة");
  assert.deepEqual(identity.sameAs, ["https://example.test/account"]);
  assert.equal(seo.siteStructuredData()["@graph"][0].legalName, undefined);
  assert.doesNotMatch(JSON.stringify(identity), /aggregateRating|award|accreditation/);
});
