// Local visual QA only. Does not create Resend templates or send any email.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = process.cwd();
const output = path.join(root, "outputs", "resend-templates");
fs.mkdirSync(output, { recursive: true });
const files = ["01-verify-email.html", "02-change-password.html", "03-reset-password.html"];
const samples = { CODE: "012345", RESET_URL: "https://marase.up.railway.app/reset-password?token=LOCAL_EMAIL_PREVIEW_ONLY_NOT_A_REAL_TOKEN_" + "a".repeat(96), LOGO_URL: "https://mail-preview.invalid/logo.png" };
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const results = [];
try {
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, "emails/resend", file), "utf8");
    const variables = [...new Set([...source.matchAll(/\{\{\{([A-Z_]+)\}\}\}/g)].map(match => match[1]))].sort();
    assert.deepEqual(variables, file.startsWith("03") ? ["LOGO_URL", "RESET_URL"] : ["CODE", "LOGO_URL"]);
    assert.doesNotMatch(source, /<(?:script|iframe|form|svg)\b|@import|display:\s*(?:flex|grid)|\son[a-z]+\s*=/i);
    assert.match(source, /<html lang="ar" dir="rtl"/);
    assert.ok(Buffer.byteLength(source) < 50_000);
    for (const width of [320, 390, 760]) for (const stripHeadStyles of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.route("**/*", route => route.request().url() === samples.LOGO_URL
        ? route.fulfill({ contentType: "image/png", body: fs.readFileSync(path.join(root, "public/brand/logo-light-hq.png")) })
        : route.abort());
      let html = source.replace(/\{\{\{([A-Z_]+)\}\}\}/g, (_, key) => samples[key]);
      if (stripHeadStyles) html = html.replace(/<style>[\s\S]*?<\/style>/gi, "");
      await page.setContent(html, { waitUntil: "networkidle" });
      const result = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth,
        direction: getComputedStyle(document.body).direction,
        logoLoaded: document.images[0].complete && document.images[0].naturalWidth > 0,
        code: document.querySelector(".code")?.textContent,
        codeDirection: document.querySelector(".code") ? getComputedStyle(document.querySelector(".code")).direction : null,
        links: [...document.links].map(link => link.href),
        heading: document.querySelector("h1").innerText,
        unresolved: document.body.textContent.includes("{{{")
      }));
      assert.ok(result.scrollWidth <= width + 1, file + " overflow: " + JSON.stringify({ width, stripHeadStyles, result }));
      assert.equal(result.direction, "rtl");
      assert.equal(result.logoLoaded, true);
      assert.equal(result.unresolved, false);
      assert.ok(result.links.every(link => link.startsWith("https://marase.up.railway.app/")));
      if (file.startsWith("03")) assert.equal(result.links.filter(link => link === samples.RESET_URL).length, 2);
      else { assert.equal(result.code, "012345"); assert.equal(result.codeDirection, "ltr"); }
      if (width === 390 && !stripHeadStyles) await page.screenshot({ path: path.join(output, file.replace(".html", ".png")), fullPage: true });
      results.push({ file, width, stripHeadStyles, ...result });
      await page.close();
    }
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ passed: results.length, results, limits: "Local Chromium rendering only; logo fulfilled from existing local asset; not Resend import/delivery or Outlook/Gmail/Apple Mail certification" }, null, 2));
console.log(JSON.stringify({ passed: results.length, output }));
