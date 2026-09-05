import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { pathToRegexp } = require("next/dist/compiled/path-to-regexp");
const source = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
async function configuration(environment = "production") {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, process: { env: { NODE_ENV: environment } } });
  const rules = await exports.default.headers();
  const evaluate = (path) => {
    const headers = new Map();
    for (const rule of rules) if (pathToRegexp(rule.source).test(path)) for (const { key, value } of rule.headers) headers.set(key.toLowerCase(), value);
    return headers;
  };
  evaluate.rules = rules;
  return evaluate;
}

test("private account and administrative pages override public referrer and cache defaults", async () => {
  const headersFor = await configuration();
  for (const path of ["/admin", "/admin/students/student@example.test", "/supervisor", "/dashboard", "/verify-email", "/complete-profile", "/onboarding", "/login", "/register", "/forgot-password", "/reset-password", "/cart", "/checkout/chemistry", "/invoices/order-1", "/favorites", "/notifications", "/referrals", "/learn/chemistry", "/meras-ai", "/study-tools/subscribe", "/request-course"]) {
    const headers = headersFor(path);
    assert.equal(headers.get("cache-control"), "private, no-store, max-age=0", path);
    assert.equal(headers.get("referrer-policy"), "no-referrer", path);
    assert.match(headers.get("x-robots-tag"), /noindex/, path);
  }
});

test("private web and native APIs include no-store on top-level and nested paths", async () => {
  const headersFor = await configuration();
  for (const path of ["/api/auth/me", "/api/auth/oauth/google/callback", "/api/profile", "/api/profile/sessions", "/api/admin/security/mfa", "/api/supervisor/workspace", "/api/cart", "/api/checkout", "/api/coupons/validate", "/api/favorites", "/api/progress", "/api/invoices/order-1/download", "/api/referrals", "/api/ai/conversations/123/messages", "/api/course-requests/42/files", "/api/course-resources/42", "/api/support", "/api/mobile/auth/login", "/api/mobile/account", "/api/mobile/dashboard", "/api/mobile/favorites", "/api/mobile/notes", "/api/mobile/notifications", "/api/mobile/push"]) {
    const headers = headersFor(path);
    assert.match(headers.get("cache-control"), /no-store/, path);
    assert.equal(headers.get("referrer-policy"), "no-referrer", path);
    assert.match(headers.get("x-robots-tag"), /noindex/, path);
  }
});

test("public catalog, assets and media do not inherit private namespace rules", async () => {
  const headersFor = await configuration();
  for (const path of ["/", "/courses", "/courses/chemistry", "/universities/king-saud", "/how-it-works", "/terms", "/api/public/settings", "/api/public/partners/5/logo", "/api/catalog/search", "/api/mobile/catalog", "/api/video/session", "/api/video/lesson-1/hls/master.m3u8", "/api/covers/chemistry", "/api/logos/king-saud", "/api/health", "/administration-public", "/brand/logo.svg", "/institutions/logo.svg"]) {
    const headers = headersFor(path);
    assert.equal(headers.has("x-robots-tag"), false, path);
    assert.doesNotMatch(headers.get("cache-control") || "", /private|no-store/, path);
  }
  assert.match(headersFor("/brand/logo.svg").get("cache-control"), /^public,/);
  assert.match(headersFor("/institutions/logo.svg").get("cache-control"), /^public,/);
  assert.equal(headersFor("/api/video/lesson-1").get("cross-origin-resource-policy"), "cross-origin");
  assert.equal(headersFor("/api/video/lesson-1").get("referrer-policy"), "no-referrer");
});

test("same-origin fullscreen stays allowed while document capture and picture-in-picture are disabled", async () => {
  const headersFor = await configuration();
  for (const path of ["/learn/chemistry", "/courses/chemistry", "/checkout/chemistry"]) {
    const policy = headersFor(path).get("permissions-policy");
    for (const directive of ["fullscreen=(self)", "display-capture=()", "picture-in-picture=()", "camera=()", "microphone=()", "geolocation=()"]) assert.ok(policy.includes(directive), directive);
    assert.doesNotMatch(policy, /fullscreen=\(\)|payment=\(\)/);
  }
});

test("public caching has one unambiguous rule and no rule repeats a header key", async () => {
  const evaluate = await configuration();
  for (const rule of evaluate.rules) {
    const keys = rule.headers.map(({ key }) => key.toLowerCase());
    assert.equal(new Set(keys).size, keys.length, rule.source);
  }
  for (const [path, expected] of [["/brand/logo.svg", 1], ["/institutions/logo.svg", 1], ["/courses", 0], ["/api/public/settings", 0], ["/api/mobile/catalog", 0], ["/api/catalog/search", 0], ["/api/video/lesson-1/hls/master.m3u8", 0]]) {
    const cacheRules = evaluate.rules.filter((rule) => pathToRegexp(rule.source).test(path) && rule.headers.some(({ key }) => key.toLowerCase() === "cache-control"));
    assert.equal(cacheRules.length, expected, path);
  }
});

test("CSP blocks inline event attributes without blocking React bootstrap, HLS or Tap", async () => {
  const headersFor = await configuration();
  const policy = headersFor("/checkout/chemistry").get("content-security-policy");
  const directives = new Map(policy.split(";").map((item) => { const [key, ...values] = item.trim().split(/\s+/); return [key, values.join(" ")]; }));
  assert.equal(directives.get("script-src-attr"), "'none'");
  assert.match(directives.get("script-src"), /'self' 'unsafe-inline'/);
  assert.doesNotMatch(directives.get("script-src"), /unsafe-eval/);
  assert.equal(directives.get("media-src"), "'self' blob:");
  assert.equal(directives.get("worker-src"), "'self' blob:");
  assert.match(directives.get("connect-src"), /https:\/\/api\.tap\.company/);
  assert.match(directives.get("frame-src"), /https:\/\/\*\.tap\.company/);
  assert.equal(directives.get("form-action"), "'self'");
  assert.equal(directives.has("upgrade-insecure-requests"), false);
});

test("localhost development retains evaluator support without relaxing event attributes", async () => {
  const headersFor = await configuration("development");
  const policy = headersFor("/").get("content-security-policy");
  assert.match(policy, /script-src[^;]*'unsafe-eval'/);
  assert.match(policy, /script-src-attr 'none'/);
  assert.doesNotMatch(policy, /upgrade-insecure-requests/);
});
