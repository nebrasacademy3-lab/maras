/** Bounded anonymous GET checks only. Never load credentials or mutate production data. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const origin = "https://marasalelm.com";
const allowed = new Set([origin, "https://www.marasalelm.com"]);
const checks = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function read(path) {
  let url = new URL(path, origin);
  assert.ok(allowed.has(url.origin) && !url.username && !url.password, "authorized HTTPS origin required");
  for (let redirects = 0; redirects < 4; redirects++) {
    const response = await fetch(url, { method: "GET", redirect: "manual", credentials: "omit", signal: AbortSignal.timeout(15000), headers: { "user-agent": "Maras-ReadOnly-Release-Check/1.0", "cache-control": "no-cache" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      assert.ok(location, "redirect requires a destination");
      url = new URL(location, url);
      assert.ok(allowed.has(url.origin) && !url.username && !url.password, "redirect must stay on authorized HTTPS origins");
      continue;
    }
    const chunks = []; let total = 0;
    if (response.body) {
      const reader = response.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > 2 * 1024 * 1024) { await reader.cancel(); throw new Error("public response exceeds diagnostic bound"); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
    }
    return { status: response.status, headers: response.headers, text: Buffer.concat(chunks).toString("utf8") };
  }
  throw new Error("too many redirects");
}
function record(path, result, assertion) {
  // Boolean assertions prevent an error from dumping public response bodies or headers.
  assertion(result);
  const check = { path, status: result.status, passed: true };
  checks.push(check); console.log(JSON.stringify(check));
}
try {
  if (process.env.EXPECT_NEW_DISCOVERY === "true") {
    let deployed = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const result = await read("/llms.txt");
        if (result.status === 200 && result.text.includes("خريطة الموقع العامة الكاملة") && result.headers.get("cache-control") === "no-store" && result.headers.get("x-permitted-cross-domain-policies") === "none") { deployed = true; break; }
      } catch { /* A bounded rollout retry without logging response bodies. */ }
      await wait(10000);
    }
    assert.ok(deployed, "new public discovery was not observed within the release verification window");
  }
  record("/api/health", await read("/api/health"), result => {
    assert.ok(result.status === 200, "production readiness HTTP status");
    const health = JSON.parse(result.text);
    assert.ok(health.ok === true && health.readiness?.database === "ready" && health.readiness?.storage === "ready", "database and storage readiness");
    assert.ok(/no-store/.test(result.headers.get("cache-control") || ""), "readiness is not cached");
  });
  await wait(500);
  record("/", await read("/"), result => {
    assert.ok(result.status === 200, "homepage HTTP status");
    assert.ok(/<html[^>]*lang="ar"/.test(result.text), "Arabic page language");
    const canonicalTags = (result.text.match(/<link\b[^>]*>/gi) || []).filter(tag => /\brel=["']canonical["']/i.test(tag));
    assert.ok(canonicalTags.length === 1, "one homepage canonical required");
    const href = canonicalTags[0].match(/\bhref=["']([^"']+)["']/i)?.[1];
    // https://example.com and https://example.com/ represent the same root URL.
    assert.ok(href && new URL(href).href === origin + "/", "homepage canonical uses the configured root origin");
    assert.ok(/object-src 'none'/.test(result.headers.get("content-security-policy") || ""), "CSP object restriction");
    assert.ok(result.headers.get("x-content-type-options") === "nosniff", "MIME sniffing restriction");
    assert.ok(/max-age=/.test(result.headers.get("strict-transport-security") || ""), "HSTS present");
    assert.equal(result.headers.get("origin-agent-cluster"), "?1", "production origin isolation");
    assert.equal(result.headers.get("cross-origin-opener-policy"), "same-origin", "production opener isolation");
    assert.equal(result.headers.get("cross-origin-resource-policy"), "same-origin", "production resource isolation");
    assert.equal(result.headers.has("access-control-allow-origin"), false, "production does not expose loopback CORS");
  });
  await wait(500);
  record("/robots.txt", await read("/robots.txt"), result => {
    assert.ok(result.status === 200, "robots HTTP status");
    assert.ok(/Disallow:\s*\/api\//i.test(result.text), "API crawler exclusions");
    assert.ok(/Allow:\s*\/api\/covers\//i.test(result.text), "public covers remain discoverable");
    assert.ok(/Sitemap:\s*https:\/\/marasalelm\.com\/sitemap\.xml/i.test(result.text), "canonical sitemap declaration");
  });
  await wait(500);
  record("/sitemap.xml", await read("/sitemap.xml"), result => {
    assert.ok(result.status === 200, "sitemap HTTP status");
    const locations = [...result.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]));
    assert.ok(locations.length > 0, "sitemap contains public entries");
    assert.ok(new Set(locations.map(url => url.href)).size === locations.length, "sitemap entries are unique");
    for (const url of locations) {
      assert.ok(url.origin === origin && !url.search && !url.hash, "sitemap only contains canonical public URLs");
      assert.ok(!/^\/(?:api|admin|supervisor|dashboard|learn|study-tools|checkout|invoices|profile)(?:\/|$)/.test(url.pathname), "sitemap excludes private namespaces");
    }
  });
  await wait(500);
  record("/llms.txt", await read("/llms.txt"), result => {
    assert.ok(result.status === 200 && /text\/plain/.test(result.headers.get("content-type") || ""), "plain-text discovery response");
    assert.ok(result.text.includes("مراس العلم"), "public platform identity");
    assert.ok(!/https:\/\/(?:www\.)?marasalelm\.com\/(?:api|admin|dashboard|learn|invoices)\//.test(result.text), "directory excludes private API and account URLs");
  });
  await wait(500);
  record("/api/admin/staff", await read("/api/admin/staff"), result => {
    assert.ok([401, 403].includes(result.status), "anonymous staff access is rejected");
    assert.ok(/no-store/.test(result.headers.get("cache-control") || ""), "staff response is not cached");
    assert.ok(/noindex/.test(result.headers.get("x-robots-tag") || ""), "staff response is not indexed");
  });
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), mode: "anonymous GET only; no load test or live transactions", newDiscoveryRequired: process.env.EXPECT_NEW_DISCOVERY === "true", checks }, null, 2));
} finally {
  mkdirSync("verification", { recursive: true });
  writeFileSync("verification/production-public-check.json", JSON.stringify({ checkedAt: new Date().toISOString(), expectedNewDiscovery: process.env.EXPECT_NEW_DISCOVERY === "true", checks }, null, 2));
}
