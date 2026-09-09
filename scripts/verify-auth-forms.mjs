// Local browser checks against a running preview, with synthetic API replies only.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const origin = process.env.AUTH_PREVIEW_ORIGIN || "http://localhost:3099";
const output = path.resolve("outputs/review-20260909/auth");
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  const page = await browser.newPage();
  await page.route("**/api/auth/me", route => route.fulfill({ json: { user: null } }));
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    for (const route of ["/forgot-password", "/reset-password?token=LOCAL_TEST_ONLY_TOKEN_0123456789abcdef", "/reset-password"]) {
      await page.goto(origin + route, { waitUntil: "domcontentloaded" });
      await page.locator("main h1").waitFor();
      const state = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, direction: getComputedStyle(document.querySelector("main")).direction, heading: document.querySelector("main h1").textContent }));
      assert.ok(state.scroll <= width + 1, JSON.stringify({ route, ...state }));
      assert.equal(state.direction, "rtl");
      results.push({ route, ...state });
      if (width === 390 || width === 1440) await page.screenshot({ path: path.join(output, `${route.startsWith("/forgot") ? "forgot" : route.includes("token") ? "reset" : "invalid"}-${width}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 390, height: 950 });
  await page.goto(origin + "/reset-password?token=LOCAL_TEST_ONLY_TOKEN_0123456789abcdef");
  await page.locator('input[name="newPassword"]').fill("Example!12345");
  await page.locator('input[name="confirmPassword"]').fill("Different!12345");
  await page.getByRole("button", { name: "حفظ كلمة المرور الجديدة" }).click();
  await page.locator("main").getByRole("alert").filter({ hasText: "غير متطابق" }).waitFor();
  await page.locator('input[name="confirmPassword"]').fill("Example!12345");
  await page.route("**/api/auth/reset-password", route => route.abort("failed"));
  await page.getByRole("button", { name: "حفظ كلمة المرور الجديدة" }).click();
  await page.getByRole("button", { name: "حفظ كلمة المرور الجديدة" }).waitFor();
  await page.locator("main").getByRole("alert").waitFor();
  assert.equal(await page.getByRole("button", { name: "حفظ كلمة المرور الجديدة" }).isEnabled(), true);
  await page.unroute("**/api/auth/reset-password");
  await page.route("**/api/auth/reset-password", async route => { assert.equal(route.request().postDataJSON().password, "Example!12345"); await route.fulfill({ json: { ok: true } }); });
  await page.getByRole("button", { name: "حفظ كلمة المرور الجديدة" }).click();
  await page.getByRole("heading", { name: "أهلًا بعودتك إلى مراس" }).waitFor();
  assert.equal(new URL(page.url()).search, "");
  results.push({ behavior: "confirmation mismatch, network retry, successful reset removes consumed token", passed: true });
  await page.route("**/api/auth/forgot-password", route => { assert.equal(route.request().postDataJSON().email, "student@example.test"); return route.fulfill({ json: { ok: true } }); });
  await page.goto(origin + "/forgot-password");
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill("student@example.test");
  await page.getByRole("button", { name: "إرسال رابط الاستعادة" }).click();
  await page.getByRole("heading", { name: "تحقّق من صندوق الوارد" }).waitFor();
  await page.getByRole("button", { name: "تعديل البريد أو المحاولة مجددًا" }).click();
  assert.equal(await page.getByLabel("البريد الإلكتروني", { exact: true }).inputValue(), "student@example.test");
  results.push({ behavior: "forgot-password safe success and editable email", passed: true });
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ results, limits: "Synthetic responses only; no real email or account changes." }, null, 2));
  console.log(JSON.stringify({ passed: results.length, output }));
} finally { await browser.close(); }
