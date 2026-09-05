import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("the homepage uses the focused premium experience without the blocking intro", async () => {
  const [page, layout] = await Promise.all([
    source("app/page.tsx"),
    source("app/layout.tsx"),
  ]);

  assert.match(page, /from "\.\/home\.module\.css"/);
  assert.match(page, /كل ما تحتاجه/);
  assert.match(page, /أدوات المذاكرة/);
  assert.match(page, /تابي/);
  assert.match(page, /تمارا/);
  assert.match(page, /data-home-reveal/);
  assert.doesNotMatch(page, /HomeIntro|نستهدف التوفير خلال 24 ساعة|\+92%/);
  assert.doesNotMatch(layout, /homeIntroScript|home-premium\.css/);
});

test("the hero search is lightweight, semantic, and keyboard accessible", async () => {
  const search = await source("components/hero-search.tsx");

  assert.match(search, /courses: SearchCourse\[\]/);
  assert.match(search, /institutions: SearchInstitution\[\]/);
  assert.doesNotMatch(search, /courses:\s*Course\[\]/);
  assert.match(search, /<form className="hero-search"/);
  assert.match(search, /role="combobox"/);
  assert.match(search, /aria-expanded=\{showResults\}/);
  assert.match(search, /role="listbox"/);
  assert.match(search, /event\.key === "ArrowDown"/);
  assert.match(search, /event\.key === "Escape"/);
  assert.doesNotMatch(search, /24 ساعة|popular-searches/);
});

test("the homepage animation system is responsive and respects reduced motion", async () => {
  const [styles, gatewayStyles, motion] = await Promise.all([
    source("app/home.module.css"),
    source("components/home-gateway.module.css"),
    source("components/motion-orchestrator.tsx"),
  ]);

  assert.match(styles, /@media\(max-width:980px\)/);
  assert.match(styles, /@media\(max-width:640px\)/);
  assert.match(`${styles}\n${gatewayStyles}`, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(gatewayStyles, /@keyframes enterCopy/);
  assert.match(gatewayStyles, /@keyframes enterCanvas/);
  assert.match(motion, /\[data-home-reveal\]/);
});
