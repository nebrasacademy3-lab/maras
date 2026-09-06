/* Read-only local browser checks. In-page text fixtures never write to the application. */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { homepageContentSignature, assertHomepageContentParity, assertHomepageCardsReadable, assertHomepageRailsReachable } from "./home-responsive-checks.mjs";
const { chromium } = createRequire(import.meta.url)("playwright");
const widths = [320, 360, 390, 768, 1024, 1440];
const baseURL = process.env.MARAS_TEST_URL || "http://127.0.0.1:3000";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL).hostname));
const folder = path.resolve("outputs/home-content-parity", new Date().toISOString().replace(/[:.]/g, "-"));
fs.mkdirSync(folder, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.MARAS_TEST_BROWSER || "msedge" });
const results = [];
let signature;
try {
  for (const width of widths) for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: "reduce", colorScheme: "light" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.setDefaultTimeout(20_000);
    try {
      const response = await page.goto(baseURL, { waitUntil: "load", timeout: 60_000 });
      assert.equal(response?.status(), 200);
      if (theme === "dark") await page.getByRole("button", { name: "تفعيل الوضع الليلي", exact: true }).click();
      await page.evaluate(() => document.fonts.ready);
      signature ||= await homepageContentSignature(page);
      await assertHomepageContentParity(page, signature);
      await assertHomepageCardsReadable(page);
      await assertHomepageRailsReachable(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 1, "Page overflow: " + overflow);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      if ([360, 1440].includes(width)) {
        await page.locator('section[aria-labelledby="home-gateway-title"]').screenshot({ path: path.join(folder, `hero-${width}-${theme}.png`) });
        await page.locator("#coming-soon").screenshot({ path: path.join(folder, `upcoming-${width}-${theme}.png`) });
        await page.locator("#payment").screenshot({ path: path.join(folder, `payments-${width}-${theme}.png`) });
      }
      // Exercise all future-track actions without sending a real registration: intercept only the local POST.
      await page.route("**/api/learning-tracks/interest", route => route.request().method() === "POST"
        ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ active: true, interestCount: 1, message: "تم تفعيل التنبيه" }) })
        : route.continue());
      const firstTrack = page.locator("#coming-soon article").first();
      const interestButton = firstTrack.locator("button");
      if (await interestButton.count()) {
        await interestButton.click();
        await page.waitForFunction(() => document.querySelector("#coming-soon article button")?.getAttribute("aria-pressed") === "true");
        assert.equal(await firstTrack.getByRole("status").innerText(), "تم تفعيل التنبيه");
        await assertHomepageCardsReadable(page);
      }
      // Long admin-entered Arabic content and enlarged text must reflow, never be hidden/truncated.
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "125%";
        document.documentElement.style.setProperty("--font-scale", "1.25");
        const longTitle = "برنامج اللغة الإنجليزية والمهارات الأكاديمية والجامعية المتكاملة للطلاب والطالبات في جميع التخصصات";
        const title = document.querySelector("#coming-soon h3");
        if (title) title.textContent = longTitle;
        const description = document.querySelector("#coming-soon [class*='cardCopy'] p");
        if (description) description.textContent = "تجربة تعليمية متكاملة تشمل التأسيس والتدريب والمراجعة العملية وفق المسار الذي يناسب احتياجات الطالب، مع تفاصيل واضحة وخيارات مرنة ومتابعة لمواعيد فتح التسجيل.";
        const button = document.querySelector("#coming-soon article button");
        if (button) button.lastChild.textContent = "سجّل اهتمامك بالبرنامج وأعلمني عند فتح التسجيل";
        const course = document.querySelector("#home-intent-panel h2");
        if (course) course.textContent = longTitle;
      });
      await assertHomepageCardsReadable(page);
      const stressOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(stressOverflow <= 1, "Enlarged text/long Arabic caused page overflow: " + stressOverflow);
      assert.deepEqual(errors, []);
      results.push({ width, theme, status: "passed", contentParity: true, allCardsReadable: true, allRailCardsReachable: true, textScale: "125%", longArabic: true, interestFeedback: "local mocked response" });
    } catch (error) {
      await page.screenshot({ path: path.join(folder, `failure-${width}-${theme}.png`), fullPage: true }).catch(() => undefined);
      results.push({ width, theme, status: "failed", error: error.message, runtimeErrors: errors });
    } finally { await context.close(); }
    console.log(JSON.stringify(results.at(-1)));
  }
} finally { await browser.close(); }
const report = { ok: results.every(item => item.status === "passed"), results, screenshots: folder };
fs.writeFileSync(path.join(folder, "results.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, passed: results.filter(item => item.status === "passed").length, total: results.length, screenshots: folder }));
if (!report.ok) process.exitCode = 1;
