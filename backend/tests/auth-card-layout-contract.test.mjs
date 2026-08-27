import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(join(here, "..", relative), "utf8");
const card = await read("components/course-card.tsx");
const auth = await read("components/auth-shell.tsx");
const css = await read("app/globals.css");
const additions = await read("app/additions.css");

test("course savings badge is placed in the upper-left cover corner", () => {
  assert.match(card, /className="sale-pill"/);
  assert.match(css, /\.sale-pill \{[^}]*inset-inline-start: 12px/);
  assert.match(css, /\.preview-pill \{ inset-inline-end: 12px; \}/);
});

test("auth pages use the site header and provide field guidance", () => {
  assert.match(auth, /<SiteHeader \/>/);
  assert.match(auth, /className="field-hint"/);
  assert.match(additions, /\.auth-page > \.auth-grid \{ min-height: calc\(100vh - 76px\); \}/);
  assert.match(additions, /\.field-hint \{ display: block/);
});
