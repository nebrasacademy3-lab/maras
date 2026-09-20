import assert from "node:assert/strict";
import test from "node:test";
import { pureSource, seoPureDependencies } from "./helpers/pure-source.mjs";

const env = { NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://maras-qa.example" };
const seo = await pureSource("lib/seo.ts", await seoPureDependencies({ process: { env } }));
const discovery = await pureSource("lib/seo-discovery.ts", seo);

test("identity is rendered without depending on the presence of catalog entries", () => {
  const body = discovery.renderPublicDiscovery("مراس", [], {
    name: "مراس العلم", alternateNames: ["Maras Al Elm"],
    description: "وصف عام", distinction: "ليست جهة مانحة للدرجات",
  });
  assert.match(body, /## هوية مراس العلم/);
  assert.match(body, /Maras Al Elm/);
  assert.match(body, /ليست جهة مانحة للدرجات/);
  assert.match(body, /\/sitemap\.xml/);
});

test("oversized alternate names cannot bypass the overall discovery byte limit", () => {
  const identity = {
    name: "ع".repeat(10000), description: "ع".repeat(10000), distinction: "ع".repeat(10000),
    alternateNames: Array.from({ length: 10000 }, (_, i) => `alias-${i}-` + "ع".repeat(1000)),
  };
  const pages = Array.from({ length: 1500 }, (_, i) => ({
    path: `/courses/bounded-${i}`, title: "ع".repeat(400), description: "ع".repeat(800), kind: "مادة",
  }));
  const body = discovery.renderPublicDiscovery("ع".repeat(10000), pages, identity);
  assert.ok(Buffer.byteLength(body, "utf8") <= discovery.DISCOVERY_MAX_BYTES);
  assert.match(body, /alias-7-/);
  assert.doesNotMatch(body, /alias-8-/);
  assert.match(body, /\/sitemap\.xml/);
});

test("malformed identity fields remain harmless and script contents are not exposed", () => {
  const body = discovery.renderPublicDiscovery("مراس", [], {
    name: { passwordHash: "PRIVATE_VALUE" }, alternateNames: "not-an-array",
    description: "<script>PRIVATE_SCRIPT</script><style>PRIVATE_STYLE</style> وصف",
    distinction: "# heading\n[text](https://evil.example)\u202e",
  });
  assert.match(body, /هوية مراس العلم/);
  assert.doesNotMatch(body, /PRIVATE_|evil\.example|not-an-array|\u202e|\n# heading/);
});
