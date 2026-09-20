import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
function isolated(path, mocks = {}, globals = {}) {
  const exports = {};
  const source = readFileSync(new URL("../" + path, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: name => { if (!(name in mocks)) throw new Error(name); return mocks[name]; }, URL, Headers, FormData, AbortController, setTimeout, clearTimeout, __DEV__: false, ...globals });
  return exports;
}
const policy = isolated("src/lib/store-commerce.ts");
for (const platform of ["ios", "android"]) test(platform + " release and development cannot accidentally activate external checkout", () => {
  for (const configuredMode of [undefined, "reader", "iap", "direct", "unexpected"]) {
    for (const development of [false, true]) {
      for (const executionEnvironment of ["standalone", "storeClient"]) {
        assert.equal(policy.resolveStoreMode({ platform, configuredMode, development, executionEnvironment, distribution: "store" }), "reader");
      }
    }
  }
  assert.equal(policy.resolveStoreMode({ platform, configuredMode: "direct", development: false, distribution: "internal" }), "direct");
  assert.equal(policy.resolveStoreMode({ platform, configuredMode: "direct", development: false }), "reader");
});
test("Android consumption-only guidance is text and iOS never offers an external purchase", () => {
  assert.match(policy.subscriptionAccessMessage("android", "example.test"), /example.test/);
  assert.doesNotMatch(policy.subscriptionAccessMessage("ios", "example.test"), /example.test|عبر موقع|اشترك/);
});
for (const platform of ["ios", "android"]) test(platform + " reader API rejects course and AI checkout before any network request", async () => {
  let calls = 0;
  const client = isolated("src/lib/api.ts", {
    "expo-constants": { default: { expoConfig: { extra: { apiUrl: "https://example.test", storeMode: "reader", storeDistribution: "store" } } } },
    "react-native": { Platform: { OS: platform } },
    "@/src/lib/store-commerce": policy,
    "@/src/lib/interaction-events": { requestNativeAdminMfa: async () => false, nativeToast: () => {} },
  }, { fetch: async () => { calls++; return { ok: true, text: async () => JSON.stringify({ ok: true }) }; } });
  for (const path of ["/api/checkout", "/api/checkout/", "/api/ai/subscription/checkout"]) await assert.rejects(() => client.api(path, { method: "POST" }), error => error.status === 403);
  assert.equal(calls, 0);
  await client.api("/api/mobile/dashboard");
  await client.api("/api/mobile/purchases/history");
  assert.equal(calls, 2, "existing entitlements and receipts remain reachable");
});
test("dynamic links keep content and policies native and block external checkout", () => {
  const calls = [];
  const routes = isolated("src/lib/notification-routing.ts", {
    "expo-router": { router: { push: value => calls.push(value) } },
    "react-native": { Linking: { openURL: async value => calls.push(value) } },
    "@/src/lib/api": { API_URL: "https://example.test", DIRECT_COMMERCE_ENABLED: false },
  });
  for (const path of ["/cart", "/cart/", "https://example.test/cart?coupon=1", "https://example.test/checkout/math", "https://pay.example.test/pay", "javascript:alert(1)", "https://user:pass@example.test/privacy"]) {
    routes.openNotificationRoute(path);
  }
  assert.equal(calls.length, 0);
  routes.openNotificationRoute("https://example.test/courses/math");
  routes.openNotificationRoute("https://example.test/privacy");
  assert.equal(calls[0].pathname, "/course/[slug]");
  assert.equal(calls[1].pathname, "/legal");
  const direct = routes.resolveAppAction("https://pay.example.test/pay", { apiUrl: "https://example.test", directCommerce: true });
  assert.equal(direct.external, "https://pay.example.test/pay");
});
test("build configuration rejects retired or unsafe commerce modes", () => {
  const config = (env) => isolated("app.config.ts", { "node:fs": { existsSync: () => false } }, { process: { env } }).default({ config: {} });
  const release = config({ EAS_BUILD_PROFILE: "production" });
  assert.equal(release.extra.storeMode, "reader");
  assert.equal(release.extra.storeDistribution, "store");
  assert.throws(() => config({ EAS_BUILD_PROFILE: "production", EXPO_PUBLIC_STORE_MODE: "direct" }), /Store-distributed/);
  assert.throws(() => config({ EAS_BUILD_PROFILE: "new-profile", EXPO_PUBLIC_STORE_MODE: "direct" }), /Store-distributed/);
  assert.throws(() => config({ EXPO_PUBLIC_STORE_MODE: "iap" }), /reader or direct/);
  assert.equal(config({ EAS_BUILD_PROFILE: "preview", EXPO_PUBLIC_STORE_MODE: "direct" }).extra.storeDistribution, "internal");
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.dependencies["react-native-purchases"], undefined);
});
test("native legal reader receives the same published sections and current support identity", () => {
  const legal = isolated("../components/published-legal-content.tsx", { react: require("react"), "react/jsx-runtime": require("react/jsx-runtime"), "next/link": { default: "a" }, "@/app/legal.module.css": { default: {} } });
  const privacy = legal.publishedLegalDocument("privacy", { support_email: "privacy@example.test" });
  const terms = legal.publishedLegalDocument("terms", { support_email: "" });
  assert.equal(privacy.sections.length, 12);
  assert.equal(terms.sections.length, 15);
  assert.ok(privacy.sections.every(section => section.id && section.title && section.body));
  assert.match(privacy.sections.at(-1).body, /privacy@example.test/);
  assert.match(terms.sections.at(-1).body, /نموذج الدعم/);
  assert.doesNotMatch(JSON.stringify(privacy), /className|<p>|href/);
});
