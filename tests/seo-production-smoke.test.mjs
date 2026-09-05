import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { test } from "node:test";

const origin = "https://marase.up.railway.app";
async function availablePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", resolve); });
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  return port;
}
function tags(html, tag) {
  return [...html.matchAll(new RegExp("<" + tag + "\\b[^>]*>", "gi"))].map(([value]) => Object.fromEntries([...value.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(([, key, content]) => [key.toLowerCase(), content])));
}
function metadata(html, name) { return tags(html, "meta").find(item => item.name === name)?.content || ""; }
function canonical(html) { return tags(html, "link").find(item => item.rel === "canonical")?.href; }
async function waitForServer(base, child) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("SEO server exited: " + child.exitCode);
    try { if ((await fetch(base + "/login", { signal: AbortSignal.timeout(5000) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("SEO production server startup timed out");
}

test("real production HTTP preserves canonical, crawl, query and private metadata contracts", { timeout: 120_000 }, async t => {
  const port = await availablePort(), base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: new URL("..", import.meta.url), stdio: "ignore", windowsHide: true,
    env: { ...process.env, NODE_ENV: "production", DATABASE_URL: "", APP_URL: origin, NEXT_PUBLIC_SITE_URL: origin, SEO_INDEXING_ENABLED: "true", GOOGLE_SITE_VERIFICATION: "seo_smoke_token_only_123", VIDEO_WORKER_ENABLED: "false", AUTO_SEED_CATALOG: "false", RUN_DB_MIGRATIONS: "false" },
  });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(base, child);
  const get = path => fetch(base + path, { redirect: "manual", headers: { "user-agent": "Googlebot" }, signal: AbortSignal.timeout(30_000) });

  await t.test("home and public catalog have one correct canonical and indexable metadata", async () => {
    for (const path of ["/", "/courses", "/universities"]) {
      const response = await get(path), html = await response.text();
      assert.equal(response.status, 200, path);
      assert.equal(new URL(canonical(html)).href, origin + path, path + " canonical");
      assert.equal(tags(html, "link").filter(item => item.rel === "canonical").length, 1, path);
      assert.match(metadata(html, "robots"), /(?:^|,\s*)index(?:,|$)/, path + " public robots");
      assert.doesNotMatch(metadata(html, "robots"), /noindex/, path);
      assert.ok(metadata(html, "description").length > 30, path + " description");
      assert.doesNotMatch(metadata(html, "description"), /ChatGPT|chat gpt/i);
    }
  });
  await t.test("filter URLs do not create indexable duplicates", async () => {
    for (const path of ["/courses", "/universities"]) {
      const response = await get(path + "?q=test"), html = await response.text();
      assert.equal(response.status, 200);
      assert.equal(canonical(html), origin + path);
      assert.match(metadata(html, "robots"), /noindex/);
      assert.match(metadata(html, "robots"), /follow/);
    }
  });
  await t.test("authentication and private redirects never become searchable", async () => {
    for (const path of ["/login", "/register", "/forgot-password", "/admin", "/dashboard", "/verify-email"]) {
      const response = await get(path);
      assert.ok([200, 307, 308].includes(response.status), path);
      assert.match(response.headers.get("x-robots-tag") || "", /noindex/, path);
      assert.match(response.headers.get("cache-control") || "", /no-store/, path);
      if (response.status === 200) assert.match(metadata(await response.text(), "robots"), /noindex/, path);
    }
  });
  await t.test("runtime robots and sitemap immediately expose the right absolute origin", async () => {
    const robots = await get("/robots.txt"), robotsText = await robots.text();
    assert.equal(robots.status, 200);
    assert.match(robotsText, /Allow: \/(?:\r?\n|$)/);
    assert.doesNotMatch(robotsText, /Disallow: \/(?:\r?\n|$)/);
    assert.ok(robotsText.includes("Sitemap: " + origin + "/sitemap.xml"));
    const sitemap = await get("/sitemap.xml"), xml = await sitemap.text();
    assert.equal(sitemap.status, 200);
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url);
    assert.ok(urls.length > 10, "sitemap must not preserve an empty build-time response");
    assert.ok(urls.every(url => url.startsWith(origin + "/")), "all sitemap URLs use the runtime public origin");
    assert.ok(urls.includes(origin + "/courses"));
    assert.ok(urls.some(url => url.includes("/courses/")));
    assert.equal(new Set(urls).size, urls.length);
    assert.ok(!urls.some(url => /\/(?:admin|login|dashboard|learn|checkout)(?:\/|$)/.test(new URL(url).pathname)));
    assert.doesNotMatch(xml, /localhost|2026-08-22/);
  });
});
