/* Local, read-only browser smoke checks. Requires Playwright in NODE_PATH. */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright");

(async () => {
  const baseURL = process.env.MARAS_TEST_URL || "http://localhost:3000";
  const browser = await chromium.launch({ headless: true, channel: process.env.MARAS_TEST_BROWSER || "msedge" });
  const folder = path.resolve("outputs/responsive-review");
  fs.mkdirSync(folder, { recursive: true });
  const results = [];
  try {
    for (const width of [375, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: "reduce" });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const response = await page.goto(baseURL, { waitUntil: "load", timeout: 60000 });
      assert.equal(response.status(), 200);
      await page.getByRole("heading", { level: 1 }).waitFor();
      assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, "Homepage overflows viewport");
      assert.equal(await page.getByText("السجل التجاري", { exact: true }).count() > 0, true);
      const courseTab = page.getByRole("tab", { name: "أبحث عن مادة" });
      await courseTab.focus();
      await page.keyboard.press("ArrowLeft");
      assert.equal(await page.getByRole("tab", { name: "لدي سلايدات" }).getAttribute("aria-selected"), "true");
      await courseTab.click();
      await page.screenshot({ path: path.join(folder, "home-" + width + ".png"), fullPage: true });
      await page.getByRole("button", { name: "تفعيل الوضع الليلي", exact: true }).click();
      await page.getByRole("button", { name: "تفعيل الوضع الفاتح", exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, "Dark homepage overflows viewport");
      await page.screenshot({ path: path.join(folder, "home-dark-" + width + ".png"), fullPage: true });
      await page.getByRole("button", { name: "تفعيل الوضع الفاتح", exact: true }).click();
      await page.goto(baseURL + "/universities", { waitUntil: "load", timeout: 60000 });
      const select = page.getByRole("combobox", { name: "نوع الجهة", exact: true });
      await select.click();
      const search = page.getByRole("combobox", { name: "ابحث في الخيارات...", exact: true });
      await search.fill("اهلية");
      assert.equal(await page.getByRole("option", { name: "أهلية", exact: true }).count(), 1);
      await page.keyboard.press("Enter");
      assert.equal(await select.innerText(), "أهلية");
      assert.equal(await page.locator("select").first().inputValue(), "أهلية");
      await select.click();
      await search.fill("خيار غير موجود");
      assert.equal(await page.getByText("لا توجد نتائج مطابقة. جرّب اسمًا آخر.").isVisible(), true);
      await page.keyboard.press("Escape");
      assert.equal(await select.getAttribute("aria-expanded"), "false");
      await page.screenshot({ path: path.join(folder, "universities-" + width + ".png"), fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, "Universities overflow viewport");
      assert.deepEqual(errors, [], "Browser runtime errors");
      results.push({ width, homepage: "passed", darkMode: "passed", searchableSelect: "passed", runtimeErrors: errors.length });
      await context.close();
    }
    console.log(JSON.stringify({ ok: true, results, screenshots: folder }, null, 2));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
