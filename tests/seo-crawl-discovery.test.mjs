import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { pureSource, seoPureDependencies } from "./helpers/pure-source.mjs";

const eligibility = await pureSource("lib/seo-eligibility.ts");
const seo = await pureSource("lib/seo.ts", await seoPureDependencies({ process: { env: { NODE_ENV: "production", APP_URL: "https://maras.example" } } }));
const { buildPublicSitemap } = await pureSource("lib/seo-sitemap.ts", { ...seo, ...eligibility });

const institution = { slug: "test-university", name: "جامعة الاختبار" };
const specialty = (slug, description = "") => ({ institutionSlug: institution.slug, slug, description, name: slug });
const course = { universitySlug: institution.slug, specialtySlug: "physics", slug: "mechanics", audienceScope: "specialty" };

test("specialty navigation agrees with sitemap eligibility without promoting empty or unrelated pages", () => {
  const specialties = [specialty("physics"), specialty("empty"), specialty("editorial", "وصف مفصل للتخصص وخطته الدراسية وفرص التعلم. ".repeat(4)), { ...specialty("foreign"), institutionSlug: "another-university" }];
  const courses = [course, { ...course, universitySlug: "another-university", specialtySlug: "empty" }];
  const navigation = eligibility.discoverableInstitutionSpecialties(specialties, courses, institution.slug);
  assert.deepEqual(navigation.map(item => item.slug), ["physics", "editorial"]);
  const sitemap = buildPublicSitemap(courses, [institution], specialties);
  assert.deepEqual(navigation.map(item => seo.seoUrl(`/universities/${institution.slug}/specialties/${item.slug}`)), sitemap.filter(item => item.url.includes("/specialties/")).map(item => item.url));
  assert.equal(eligibility.specialtyIsIndexable("", 0), false, "empty specialty pages keep noindex");
});

test("common university courses make genuine specialties discoverable only in their institution", () => {
  const specialties = [specialty("physics"), specialty("math"), { ...specialty("foreign"), institutionSlug: "another-university" }];
  assert.deepEqual(eligibility.discoverableInstitutionSpecialties(specialties, [{ ...course, audienceScope: "institution" }], institution.slug).map(item => item.slug), ["physics", "math"]);
  assert.deepEqual(eligibility.discoverableInstitutionSpecialties(specialties, [{ ...course, audienceScope: "institution", universitySlug: "another-university" }], institution.slug), []);
});

test("suggested course searches render native GET buttons instead of crawlable query links", async () => {
  const source = await readFile(new URL("../components/institution-programs.tsx", import.meta.url), "utf8");
  const courseNames = ["فيزياء 1", "رياضيات & إحصاء"];
  const icon = () => null;
  const dependencies = { React, useMemo: React.useMemo, useState: React.useState, Link: props => React.createElement("a", props, props.children), ArrowLeft: icon, BookMarked: icon, BookOpen: icon, GraduationCap: icon, Search: icon, Sparkles: icon, getProgramCourses: () => courseNames };
  const key = "__program_search_" + crypto.randomUUID().replaceAll("-", "");
  globalThis[key] = dependencies;
  try {
    const code = `const {${Object.keys(dependencies).join(",")}} = globalThis[${JSON.stringify(key)}];\n` + source.replace(/^import\s[\s\S]*?;\r?\n/gm, "");
    const compiled = ts.transpileModule(code, { fileName: "institution-programs.tsx", compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React } }).outputText;
    const { InstitutionPrograms } = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
    const html = renderToStaticMarkup(React.createElement(InstitutionPrograms, { institutionName: institution.name, programs: [{ name: "العلوم", area: "علوم", degree: "بكالوريوس", verificationStatus: "pending-review" }] }));
    assert.match(html, /<form[^>]*action="\/courses"[^>]*method="get"/);
    assert.match(html, /<button(?=[^>]*type="submit")(?=[^>]*name="q")(?=[^>]*value="فيزياء 1")[^>]*>/);
    assert.match(html, /<button(?=[^>]*type="submit")(?=[^>]*name="q")(?=[^>]*value="رياضيات &amp; إحصاء")[^>]*>/);
    assert.doesNotMatch(html, /href="\/courses\?/);
    assert.match(html, /href="\/request-course"/, "course requests stay accessible");
  } finally { delete globalThis[key]; }
});
