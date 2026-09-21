import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("every admin shell link opts out of speculative private-route prefetch", async () => {
  const source = await readFile(new URL("../components/admin-shell.tsx", import.meta.url), "utf8");
  // Source contract; the unchanged three-engine browser suite exercises routing
  // and continues to reject every client exception, including cancelled RSC work.
  const links = [...source.matchAll(/<Link\b([^>]*?)(?:>|$)/g)];
  assert.ok(links.length >= 4, "search results, grouped links, account security and brand link remain present");
  for (const [, attributes] of links) assert.match(attributes, /^\s+prefetch=\{false\}\s/);
  assert.match(source, /onClick=\{\(\)\s*=>\s*setMobileOpen\(false\)\}/);
  assert.match(source, /router\.refresh\(\)/, "explicit refresh remains available");
});
