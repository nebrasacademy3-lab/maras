/** Saved-result downloads through the real web UI; only isolated loopback fixtures. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium, firefox, webkit } from "playwright";
import pg from "pg";
const fixture = JSON.parse(readFileSync(".data/qa-fixtures.json", "utf8"));
const origin = "http://127.0.0.1:3100", database = JSON.parse(readFileSync(".data/qa-database.json", "utf8")).url;
if (fixture.origin !== origin || new URL(database).hostname !== "127.0.0.1" || new URL(database).pathname !== "/maras_qa" || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_ENVIRONMENT_ID) throw new Error("Isolated PDF browser fixtures required");
const user = fixture.users.find(u => u.role === "student-a"), other = fixture.users.find(u => u.role === "student-b");
const artifactId = fixture.study.artifactId, pool = new pg.Pool({ connectionString: database });
let conversationId;
try { const result = await pool.query("SELECT conversation_id FROM ai_artifacts WHERE id=$1 AND user_id=$2", [artifactId, user.id]); assert.equal(result.rows.length, 1); conversationId = result.rows[0].conversation_id; } finally { await pool.end(); }
const engines = { chromium, firefox, webkit }, chosen = (process.env.QA_BROWSERS || "chromium,firefox,webkit").split(",");
assert.ok(chosen.length && chosen.every(name => name in engines));
const reports = [], folder = ".data/study-pdf-browser"; mkdirSync(folder, { recursive: true });
for (const name of chosen) {
  const browser = await engines[name].launch({ headless: true, ...(name === "chromium" && process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  const errors = [], checks = []; let generationRequests = 0;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "ar-SA", acceptDownloads: true, reducedMotion: "reduce" });
    await context.addCookies([{ name: "meras_session", value: user.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (request.method() === "POST" && /\/api\/ai\/(?:files\/\d+\/actions|conversations\/\d+\/messages)/.test(request.url())) generationRequests++; });
    const openResult = async () => {
      await page.goto(`${origin}/study-tools?conversation=${conversationId}`, { waitUntil: "domcontentloaded" });
      const legacy = page.locator(`a[href="/api/ai/artifacts/${artifactId}/download"]`);
      await legacy.waitFor({ state: "attached" });
      const details = legacy.locator("xpath=ancestor::*[self::article or self::details][1]");
      await details.waitFor({ state: "attached" });
      if (await details.evaluate(element => element.tagName === "DETAILS" && !element.open)) await details.locator("summary").click();
      const button = details.getByRole("button", { name: "تنزيل PDF", exact: true }); await button.waitFor(); return { details, button };
    };
    let { details, button } = await openResult();
    let pdfRequests = 0; const pdfRequestListener = request => { if (new URL(request.url()).pathname === `/api/ai/artifacts/${artifactId}/download` && new URL(request.url()).searchParams.get("format") === "pdf") pdfRequests++; };
    page.on("request", pdfRequestListener);
    const downloaded = page.waitForEvent("download", { timeout: 90_000 });
    await button.evaluate(element => { element.click(); element.click(); });
    const download = await downloaded; assert.equal(await download.failure(), null); assert.match(download.suggestedFilename(), /\.pdf$/);
    const data = readFileSync(await download.path()); assert.match(data.subarray(0, 8).toString(), /^%PDF-[12]\.\d/); assert.match(data.subarray(-1024).toString(), /%%EOF\s*$/); assert.ok(data.length <= 8 * 1024 * 1024);
    await details.getByRole("status").filter({ hasText: "تم تجهيز ملف PDF للتنزيل" }).waitFor();
    assert.equal(pdfRequests, 1, "double activation must not create two downloads");
    page.off("request", pdfRequestListener);
    checks.push("actual saved-result PDF downloads through the UI; two synchronous clicks dispatch only one request");
    await details.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${folder}/${name}-light.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "تفعيل الوضع الليلي", exact: true }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
    await details.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${folder}/${name}-dark-phone.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), "PDF controls must not overflow the phone viewport");
    checks.push("visible accessible PDF/legacy Word controls in light and dark themes at desktop and 390px widths");

    ({ details, button } = await openResult());
    let unexpectedDownloads = 0; const observeDownload = () => unexpectedDownloads++; page.on("download", observeDownload);
    const pattern = `**/api/ai/artifacts/${artifactId}/download?format=pdf`;
    await page.route(pattern, route => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Not a PDF</title>" }));
    await button.click(); await details.getByRole("status").waitFor(); await button.waitFor({ state: "visible" });
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(button => button.getAttribute('aria-busy') === 'true'));
    assert.match(await details.getByRole("status").innerText(), /PDF/); assert.equal(unexpectedDownloads, 0); await page.unroute(pattern);
    checks.push("HTTP 200 HTML/error content is rejected without creating a download");

    ({ details, button } = await openResult());
    let profileReads = 0;
    await page.route("**/api/profile", async route => {
      profileReads++;
      if (profileReads > 1) await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: other.id } }) });
      else await route.continue();
    });
    await button.click(); await details.getByRole("status").filter({ hasText: "تغيّر الحساب" }).waitFor({ timeout: 90_000 });
    assert.ok(profileReads >= 2); assert.equal(unexpectedDownloads, 0); await page.unroute("**/api/profile"); page.off("download", observeDownload);
    checks.push("account change after a valid response prevents exposing the previous account's PDF");
    assert.equal(generationRequests, 0); assert.deepEqual(errors, []);
    reports.push({ engine: name, passed: checks.length, checks, clientExceptions: errors, generationRequests, pdfBytes: data.length, sha256: createHash("sha256").update(data).digest("hex"), device: "browser viewport simulation, not physical devices" });
    await context.close();
  } finally { await browser.close(); }
}
writeFileSync(`${folder}/report.json`, JSON.stringify({ ok: true, reports }, null, 2)); console.log(JSON.stringify({ ok: true, reports }, null, 2));
