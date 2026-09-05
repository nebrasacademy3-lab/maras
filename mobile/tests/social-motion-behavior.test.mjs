import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function load(path) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, URL });
  return exports;
}
const { mobileSocialLinks } = load("src/lib/public-social-links.ts");
const { intersectsMotionViewport } = load("src/lib/motion-visibility.ts");

test("native channels consume the server list and ignore unsafe or duplicate entries", () => {
  const valid = { id: "x", key: "social_x", label: "X", labelAr: "إكس", icon: "logo-x", url: "https://x.com/meras" };
  const links = mobileSocialLinks({ social_links: [valid, { ...valid }, { ...valid, id: "tiktok", url: "javascript:alert(1)" }, { ...valid, id: "youtube", url: "https://user:pass@youtube.com/meras" }] });
  assert.equal(links.length, 1);
  assert.equal(links[0], valid);
  assert.equal(mobileSocialLinks().length, 0);
  assert.equal(mobileSocialLinks({ social_links: null }).length, 0);
});

test("scroll reveal waits for the actual visible viewport rather than mount time", () => {
  assert.equal(intersectsMotionViewport(900, 180, 0, 800), false);
  assert.equal(intersectsMotionViewport(790, 180, 0, 800), true);
  assert.equal(intersectsMotionViewport(830, 180, 0, 800), true);
  assert.equal(intersectsMotionViewport(-300, 200, 0, 800), false);
  assert.equal(intersectsMotionViewport(-300, 1300, 0, 800), true);
  assert.equal(intersectsMotionViewport(100, 0, 0, 800), false);
  assert.equal(intersectsMotionViewport(Number.NaN, 180, 0, 800), false);
  assert.equal(intersectsMotionViewport(430, 160, 40, 390), true);
});

test("shared native motion replays on focus and measures only unrevealed sections", () => {
  const ui = read("src/components/ui.tsx");
  assert.match(ui, /useFocusEffect\(useCallback/);
  assert.match(ui, /onScroll=\{reveals.check\}/);
  assert.match(ui, /entries\.current\.delete\(ref\)/);
  assert.match(ui, /reduceMotion\) \{ value\.setValue\(1\)/);
  assert.match(ui, /unregister\?\.\(\); value\.stopAnimation/);
});

test("foreground and admin saves invalidate live social settings", () => {
  assert.match(read("src/providers/RealtimeSyncProvider.tsx"), /queryKey: \["settings"\], refetchType: "active"/);
  assert.match(read("app/admin.tsx"), /payload.action === "saveSettings"\) await client.invalidateQueries/);
  for (const path of ["src/components/MobileFooter.tsx", "app/contact.tsx"]) assert.match(read(path), /mobileSocialLinks\(/);
});
