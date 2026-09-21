/** Real browser and local production server; only synthetic accounts and loopback traffic. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync } from "node:fs";
import { chromium } from "playwright-core";
const local = JSON.parse(readFileSync(".data/qa-database.json", "utf8"));
const fixtures = JSON.parse(readFileSync(".data/qa-fixtures.json", "utf8"));
const origin = "http://127.0.0.1:3100";
if (process.env.DATABASE_URL !== local.url || new URL(local.url).hostname !== "127.0.0.1" || new URL(local.url).port !== "55439" || new URL(local.url).pathname !== "/maras_qa" || fixtures.origin !== origin || !fixtures.instructor?.email?.endsWith("@example.test")) throw new Error("Dedicated loopback QA fixtures required");
for (const name of ["RAILWAY_PROJECT_ID", "RAILWAY_ENVIRONMENT_ID", "S3_ENDPOINT", "S3_BUCKET", "BUCKET", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "GEMINI_API_KEY", "GEMINI_API_KEYS", "GEMINI_CONTROL_PLANE_TOKEN_FILE", "RESEND_API_KEY", "TAP_SECRET_KEY", "OPENAI_API_KEY"]) if (process.env[name]) throw new Error("Live configuration prohibited");
const security = JSON.parse(readFileSync(".data/qa-security.json", "utf8"));
const dir = ".data/instructor-browser";
mkdirSync(dir, { recursive: true, mode: 0o700 });
const logFile = openSync(`${dir}/server.log`, "w", 0o600);
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3100"], { env: { ...process.env, ...security, APP_URL: origin, UPLOAD_DIR: `${process.cwd()}/.data/qa-uploads`, AUTO_SEED_CATALOG: "false", RUN_DB_MIGRATIONS: "false", AI_WORKER_ENABLED: "false", VIDEO_WORKER_ENABLED: "false", FILE_SCAN_SCHEDULER_ENABLED: "false", LIFECYCLE_SCHEDULER_ENABLED: "false", GEMINI_PROJECT_REFRESH_ENABLED: "false" }, stdio: ["ignore", logFile, logFile] });
closeSync(logFile);
let browser, serverError = false;
server.once("error", () => { serverError = true; });
const checks = [], contexts = [], pageErrors = [];
const pass = name => { checks.push(name); console.log("PASS INSTRUCTOR BROWSER", name); };
const cookie = token => ({ name: "meras_session", value: token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax", secure: false });
async function context(token) {
  const value = await browser.newContext({ locale: "ar-SA", reducedMotion: "reduce", userAgent: "Maras isolated contract QA", viewport: { width: 1440, height: 1000 } });
  contexts.push(value); value.setDefaultTimeout(20000); value.setDefaultNavigationTimeout(20000);
  // Tests never navigate or issue browser requests to a provider or production site.
  await value.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort("blockedbyclient"));
  value.on("page", page => page.on("pageerror", () => { pageErrors.push("browser_exception"); }));
  if (token) await value.addCookies([cookie(token)]);
  return value;
}
async function fits(page) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(size.scroll <= size.width + 2, `Instructor layout overflow at ${size.width}px`);
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 60 && !serverError && server.exitCode === null; attempt++) {
    try { const result = await fetch(origin + "/login", { redirect: "manual", signal: AbortSignal.timeout(1500) }); ready = result.status === 200; await result.body?.cancel(); if (ready) break; } catch { /* bounded local startup */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready && server.exitCode === null && !serverError, "Local production server did not become ready");
  browser = await chromium.launch({ headless: true });
  const alice = await context(fixtures.instructor.token), page = await alice.newPage();
  const response = await page.goto(origin + "/instructor", { waitUntil: "domcontentloaded" });
  assert.equal(response.status(), 200);
  await page.getByRole("navigation", { name: "أقسام حساب الشارح" }).waitFor();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
    for (const label of ["بياناتي وخبرتي", "مستنداتي", "العقد والمواد", "الحساب البنكي", "أمان الحساب"]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await fits(page);
    }
  }
  pass("instructor workspace tabs operate at desktop and mobile widths without horizontal overflow");
  await page.getByRole("button", { name: "العقد والمواد", exact: true }).click();
  await page.getByRole("heading", { name: "عقود العمل", exact: true }).waitFor();
  await page.getByRole("button", { name: "الموافقة والتوقيع", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "توقيع عقد العمل" }); await dialog.waitFor();
  const submit = dialog.getByRole("button", { name: "أوافق وأوقّع هذا العقد", exact: true });
  assert.equal(await submit.isDisabled(), true);
  const canvas = dialog.locator("canvas"); await canvas.scrollIntoViewIfNeeded(); const bounds = await canvas.boundingBox(); assert.ok(bounds);
  await page.mouse.move(bounds.x + bounds.width * 0.12, bounds.y + bounds.height * 0.45); await page.mouse.down();
  for (let i = 1; i <= 30; i++) await page.mouse.move(bounds.x + bounds.width * (0.12 + i * 0.022), bounds.y + bounds.height * (0.45 + Math.sin(i * 0.6) * 0.18));
  await page.mouse.up();
  await dialog.getByRole("checkbox").check();
  await dialog.getByLabel("كلمة مرور حسابك", { exact: true }).fill(fixtures.instructor.password);
  const signedResponse = page.waitForResponse(r => new URL(r.url()).pathname === `/api/instructor/contracts/${fixtures.instructor.offeredContractId}` && r.request().method() === "POST");
  await submit.click(); assert.equal((await signedResponse).status(), 200, "Synthetic browser signature was not accepted");
  await dialog.waitFor({ state: "hidden" });
  await page.getByText("تم توقيع نسخة العقد. يمكنك تنزيل النسخة الموثقة من حسابك.", { exact: true }).waitFor();
  pass("signature UI requires consent/password/drawn strokes and commits the exact offered synthetic contract");
  const pdf = await alice.request.get(origin + `/api/instructor/contracts/${fixtures.instructor.offeredContractId}/download`, { maxRedirects: 0 });
  assert.equal(pdf.status(), 200); assert.equal(pdf.headers()["cache-control"], "private, no-store");
  assert.match((await pdf.body()).subarray(0, 8).toString(), /^%PDF-/); await pdf.dispose();
  pass("the browser-authenticated account retrieves its signed private PDF over the local HTTP server");
  await page.screenshot({ path: `${dir}/workspace-desktop.png`, fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 }); await fits(page);
  await page.screenshot({ path: `${dir}/workspace-mobile.png`, fullPage: false });
  const bob = await context(fixtures.instructorOther.token);
  const denied = await bob.request.get(origin + `/api/instructor/contracts/${fixtures.instructor.offeredContractId}/download`, { maxRedirects: 0 });
  assert.equal(denied.status(), 404); await denied.dispose();
  const anonymous = await context();
  const privateReply = await anonymous.request.get(origin + "/api/instructor/profile", { maxRedirects: 0 });
  assert.equal(privateReply.status(), 401); await privateReply.dispose();
  const student = await context(fixtures.users.find(user => user.role === "student-a").token);
  const roleDenied = await student.request.get(origin + "/api/instructor/contracts", { maxRedirects: 0 });
  assert.equal(roleDenied.status(), 403); await roleDenied.dispose();
  pass("real HTTP boundaries deny anonymous, student-role and cross-instructor contract access");
  assert.equal(pageErrors.length, 0, "Instructor browser journey raised a JavaScript exception");
  writeFileSync(`${dir}/report.json`, JSON.stringify({ ok: true, checkedAt: new Date().toISOString(), source: process.env.GITHUB_SHA || null, syntheticOnly: true, checks }, null, 2));
} finally {
  for (const value of contexts) await value.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  if (server.exitCode === null) { const stopped = new Promise(resolve => server.once("exit", resolve)); server.kill("SIGTERM"); const timer = setTimeout(() => server.kill("SIGKILL"), 5000); await stopped; clearTimeout(timer); }
}
