// Local visual QA only. Does not create Resend templates or send any email.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { build } = require("esbuild");
const root = process.cwd();
const output = path.join(root, "outputs", "resend-templates");
fs.mkdirSync(output, { recursive: true });
const files = ["01-verify-email.html", "02-change-password.html", "03-reset-password.html"];
const built = await build({ stdin: { contents: 'export * from "./lib/email-branding"; export * from "./lib/social-links";', resolveDir: root, loader: "ts" }, bundle: true, platform: "node", format: "esm", write: false });
const { securityEmailVariables, renderSecurityEmail, SOCIAL_CHANNELS, normalizedSocialLinks } = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
const origin = "https://marasalelm.com";
const resetUrl = origin + "/reset-password?token=LOCAL_EMAIL_PREVIEW_ONLY_NOT_A_REAL_TOKEN_" + "a".repeat(96);
const settings = Object.fromEntries(SOCIAL_CHANNELS.map(channel => [channel.key, channel.id === "whatsapp" ? "0500000000" : `https://${channel.hosts[0]}/meras-preview-only`]));
const socialUrls = normalizedSocialLinks(settings).map(link => link.url);
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const results = [];
try {
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, "emails/resend", file), "utf8");
    const content = file.startsWith("03") ? { kind: "reset-password", resetUrl } : { kind: file.startsWith("01") ? "verify-email" : "change-password", code: "012345" };
    const keys = [...new Set([...source.matchAll(/\{\{\{([A-Z][A-Z0-9_]+)\}\}\}/g)].map(match => match[1]))].sort();
    assert.deepEqual(keys, Object.keys(securityEmailVariables(content, settings, origin)).sort());
    assert.doesNotMatch(source, /<(?:script|iframe|form|svg)\b|@import|display:\s*(?:flex|grid)|\son[a-z]+\s*=/i);
    assert.match(source, /<html lang="ar" dir="rtl"/);
    assert.ok(Buffer.byteLength(source) < 50_000);
    for (const width of [320, 390, 760]) for (const stripHeadStyles of [false, true]) for (const withSocials of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin === origin && (url.pathname === "/brand/mark-light.png" || /^\/email-assets\/[a-z]+\.png$/.test(url.pathname))) return route.fulfill({ contentType: "image/png", body: fs.readFileSync(path.join(root, "public", url.pathname.slice(1))) });
        return route.abort();
      });
      let html = renderSecurityEmail(source, securityEmailVariables(content, withSocials ? settings : {}, origin));
      if (stripHeadStyles) html = html.replace(/<style>[\s\S]*?<\/style>/gi, "");
      await page.setContent(html, { waitUntil: "networkidle" });
      const result = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth,
        direction: getComputedStyle(document.body).direction,
        logoLoaded: [...document.images].every(image => image.complete && image.naturalWidth > 0),
        imageCount: document.images.length,
        background: getComputedStyle(document.body).backgroundColor,
        code: document.querySelector(".code")?.textContent,
        codeDirection: document.querySelector(".code") ? getComputedStyle(document.querySelector(".code")).direction : null,
        links: [...document.links].map(link => link.href),
        heading: document.querySelector("h1").innerText,
        unresolved: document.body.textContent.includes("{{{")
      }));
      assert.ok(result.scrollWidth <= width + 1, file + " overflow: " + JSON.stringify({ width, stripHeadStyles, result }));
      assert.equal(result.direction, "rtl");
      assert.equal(result.logoLoaded, true);
      assert.equal(result.imageCount, withSocials ? 11 : 1);
      assert.equal(result.background, "rgb(248, 250, 255)");
      assert.equal(result.unresolved, false);
      assert.ok(result.links.every(link => link.startsWith(origin + "/") || socialUrls.includes(link)));
      assert.equal(result.links.filter(link => socialUrls.includes(link)).length, withSocials ? 10 : 0);
      if (file.startsWith("03")) assert.equal(result.links.filter(link => link === resetUrl).length, 2);
      else { assert.equal(result.code, "012345"); assert.equal(result.codeDirection, "ltr"); }
      if (width === 390 && !stripHeadStyles && withSocials) await page.screenshot({ path: path.join(output, file.replace(".html", ".png")), fullPage: true });
      results.push({ file, width, stripHeadStyles, withSocials, ...result });
      await page.close();
    }
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ passed: results.length, results, limits: "Local Chromium rendering only; logo fulfilled from existing local asset; not Resend import/delivery or Outlook/Gmail/Apple Mail certification" }, null, 2));
console.log(JSON.stringify({ passed: results.length, output }));
