import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { unstable_getResponseFromNextConfig: responseFromConfig } = require("next/experimental/testing/server");
const source = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function configuration(extraEnv = {}) {
  const exports = {};
  vm.runInNewContext(code, { exports, URL, process: { env: { NODE_ENV: "production", APP_URL: "https://maras.example", NEXT_PUBLIC_SITE_URL: "https://www.maras.example", ...extraEnv } } });
  return exports.default;
}
const response = (url, headers = {}, env = {}) => responseFromConfig({ url, headers, nextConfig: configuration(env) });

// Use Next's actual custom-route loader/matcher/destination builder, rather than
// reimplementing has/missing, escaping, query forwarding or 308 selection.
test("production HTTP upgrades only configured public hosts and preserves OAuth/payment query values", async () => {
  for (const host of ["maras.example", "www.maras.example"]) {
    for (const forwarded of ["http"]) {
      for (const pathname of ["/", "/api/auth/oauth/google/callback?code=synthetic%2Bcode&state=opaque%2Fvalue", "/dashboard?tap_id=chg_synthetic&order=ORDER-1"]) {
        const headers = forwarded ? { "x-forwarded-proto": forwarded } : {};
        const result = await response(`http://${host}${pathname}`, headers);
        assert.equal(result.status, 308, `${host}${pathname}`);
        assert.equal(result.headers.get("location"), `https://${host}${pathname}`);
        assert.equal(result.headers.has("strict-transport-security"), false, "HSTS must not be sent on the insecure redirect");
      }
    }
  }
});

test("an absent proxy protocol never loops an actual HTTPS request back onto itself", async () => {
  for (const protocol of ["http", "https"]) {
    const result = await response(`${protocol}://maras.example/login`);
    assert.equal(result.status, 200);
    assert.equal(result.headers.has("location"), false);
    assert.equal(result.headers.has("strict-transport-security"), false);
  }
});

test("TLS termination is recognized without a redirect loop and production HSTS stays scoped to HTTPS", async () => {
  for (const pathname of ["/", "/login", "/checkout", "/api/auth/oauth/apple/callback", "/api/webhooks/tap"]) {
    const result = await response(`http://maras.example${pathname}`, { "x-forwarded-proto": "https" });
    assert.equal(result.status, 200, pathname);
    assert.equal(result.headers.has("location"), false);
    assert.equal(result.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
    assert.doesNotMatch(result.headers.get("strict-transport-security"), /preload/);
  }
});

test("untrusted Host and forwarded-host values cannot create an open redirect", async () => {
  for (const host of ["attacker.example", "marasXexample", "maras.example.attacker.example", "localhost:3100", "127.0.0.1:3100"]) {
    const result = await response(`http://${host}/login?return_to=%2Fadmin`, { "x-forwarded-proto": "http", "x-forwarded-host": "maras.example" });
    assert.equal(result.status, 200, host);
    assert.equal(result.headers.has("location"), false, host);
  }
  const result = await response("http://maras.example/api/auth/oauth/google/callback?redirect=https%3A%2F%2Fattacker.example", { "x-forwarded-proto": "http", "x-forwarded-host": "attacker.example" });
  assert.equal(new URL(result.headers.get("location")).origin, "https://maras.example");
});

test("HTTPS redirect configuration rejects local, private, malformed and credential-bearing origins", async () => {
  for (const origin of ["http://maras.example", "https://localhost", "https://127.0.0.1", "https://10.0.0.1", "https://service.railway.internal", "https://host.local", "https://[::1]", "https://user:password@maras.example", "https://maras.example/path", "https://maras.example?next=evil", "https://maras.example#fragment", "not a URL"]) {
    const config = configuration({ APP_URL: origin, NEXT_PUBLIC_SITE_URL: "" });
    assert.deepEqual(JSON.parse(JSON.stringify(await config.redirects())), [], origin);
  }
});

test("development and explicit loopback QA do not force HTTPS or persist HSTS", async () => {
  for (const env of [{ NODE_ENV: "development" }, { MARAS_LOOPBACK_QA: "true", CI: "true", GITHUB_ACTIONS: "true" }]) {
    const config = configuration(env);
    assert.equal((await config.redirects()).length, 0);
    for (const protocol of ["http", "https"]) {
      const result = await responseFromConfig({ url: "http://127.0.0.1:3100/login", headers: { "x-forwarded-proto": protocol }, nextConfig: config });
      assert.equal(result.status, 200);
      assert.equal(result.headers.has("strict-transport-security"), false);
    }
  }
});

test("isolated QA flags cannot disable the production HTTPS policy on Railway", async () => {
  const env = { MARAS_LOOPBACK_QA: "true", CI: "true", GITHUB_ACTIONS: "true", RAILWAY_PROJECT_ID: "synthetic-project" };
  const insecure = await response("http://maras.example/login", { "x-forwarded-proto": "http" }, env);
  assert.equal(insecure.status, 308);
  const secure = await response("https://maras.example/login", { "x-forwarded-proto": "https" }, env);
  assert.equal(secure.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(secure.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
});

test("COOP and frame protections remain present on sign-in, payment, account, and administrative responses", async () => {
  for (const pathname of ["/", "/login", "/register", "/checkout", "/dashboard", "/admin", "/api/auth/oauth/google/callback", "/api/webhooks/tap"]) {
    const result = await response(`https://maras.example${pathname}`, { "x-forwarded-proto": "https" });
    assert.equal(result.headers.get("cross-origin-opener-policy"), "same-origin", pathname);
    assert.equal(result.headers.get("x-frame-options"), "SAMEORIGIN", pathname);
  }
});
