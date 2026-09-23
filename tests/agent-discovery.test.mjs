import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { pureSource, seoPureDependencies } from "./helpers/pure-source.mjs";

async function catalog(env) {
  const process = { env };
  const seo = await pureSource("lib/seo.ts", await seoPureDependencies({ process }));
  return pureSource("app/ai-catalog.json/route.ts", seo);
}
const production = { NODE_ENV: "production", APP_URL: "https://maras.example", DATABASE_URL: "sensitive-database-fixture", GEMINI_API_KEY: "sensitive-gemini-fixture" };

test("agent catalog exposes only public identity and never fabricates callable services", async () => {
  const route = await catalog(production);
  const response = route.GET(new Request("https://attacker.example/ai-catalog.json", { headers: { host: "attacker.example", "x-forwarded-host": "attacker.example", authorization: "Bearer private-fixture" } }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/ai-catalog+json; charset=utf-8");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("link"), /<\/\.well-known\/ard\.json>; rel="ard"/);
  const data = await response.json();
  assert.deepEqual(data, { specVersion: "1.0", host: { displayName: "مراس العلم", documentationUrl: "https://maras.example/about", logoUrl: "https://maras.example/brand/mark-official.png" }, entries: [] });
  assert.doesNotMatch(JSON.stringify(data), /attacker|private-fixture|sensitive-|\/api\/|token|secret|password|session/i);
});

test("development, QA disabled, and nonpublic origins disable agent discovery with noindex", async () => {
  for (const env of [ { ...production, NODE_ENV: "development" }, { ...production, SEO_INDEXING_ENABLED: "false" }, { ...production, APP_URL: "http://127.0.0.1:3100" }, { NODE_ENV: "production" } ]) {
    const response = (await catalog(env)).GET();
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.deepEqual(await response.json(), { error: "Public discovery is disabled." });
  }
});

test("agent discovery observes runtime indexing policy changes", async () => {
  const env = { ...production }; const route = await catalog(env);
  assert.equal(route.GET().status, 200);
  env.SEO_INDEXING_ENABLED = "false";
  assert.equal(route.GET().status, 404);
});

test("both discovery drafts retain unchanged pinned upstream schemas and a shared inventory", async () => {
  for (const [name, digest] of [ ["ai-catalog", "c55238483a4738e08b250bdd6af1f4dc05a91afe882c649d224d09c19cd8fe09"], ["ard-entry", "011b86d55fd5d2883dffae3f0577d26f5efb56ca866eb079edbc78a628f95499"] ]) {
    const bytes = await readFile(new URL(`./fixtures/agent-discovery/${name}.schema.json`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), digest);
    const schema = JSON.parse(bytes); assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.match(schema.$id, /^https:\/\/raw\.githubusercontent\.com\/ards-project\/ard-spec\//);
  }
  const alias = await readFile(new URL("../app/.well-known/ard.json/route.ts", import.meta.url), "utf8");
  assert.match(alias, /export \{ GET \} from "@\/app\/ai-catalog\.json\/route"/);
  assert.match(alias, /dynamic = "force-dynamic"/);
});

test("the real public search renders declarative WebMCP metadata without automatic submission", async () => {
  const source = await readFile(new URL("../components/hero-search.tsx", import.meta.url), "utf8");
  const key = "__webmcp_" + crypto.randomUUID().replaceAll("-", "");
  const dependencies = { React, useEffect: React.useEffect, useId: React.useId, useMemo: React.useMemo, useRef: React.useRef, useState: React.useState, Link: "a", useRouter: () => ({ push: () => assert.fail("render must not navigate") }), normalizeCatalogSearch: value => value, ArrowLeft: () => null, BookOpen: () => null, Building2: () => null, Search: () => null, TrendingUp: () => null };
  globalThis[key] = dependencies;
  try {
    const input = `const {${Object.keys(dependencies)}} = globalThis[${JSON.stringify(key)}];\n` + source.replace(/^import\s[\s\S]*?;\r?\n/gm, "");
    const code = ts.transpileModule(input, { fileName: "hero-search.tsx", compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText;
    const { HeroSearch } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
    const html = renderToStaticMarkup(React.createElement(HeroSearch, { courses: [], institutions: [] }));
    assert.match(html, /<form[^>]+toolname="search_public_courses"[^>]+tooldescription=/);
    assert.match(html, /<form[^>]+action="\/courses"[^>]+method="get"/);
    const inputMarkup = html.match(/<input\b[^>]*>/)?.[0] || "";
    for (const attribute of ['name="q"', 'maxLength="160"', 'toolparamdescription="']) assert.ok(inputMarkup.includes(attribute));
    assert.doesNotMatch(html, /toolautosubmit|registerTool|\/api\/|csrf|authorization/i);
  } finally { delete globalThis[key]; }
});
