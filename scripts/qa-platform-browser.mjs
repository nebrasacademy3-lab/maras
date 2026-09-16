/** Browser checks use dedicated loopback fixtures and synthetic MFA only. */
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { chromium, firefox, webkit } from "playwright";
import { eq } from "drizzle-orm";
const fixture = JSON.parse(readFileSync(".data/qa-fixtures.json", "utf8"));
const database = JSON.parse(readFileSync(".data/qa-database.json", "utf8"));
const origin = "http://127.0.0.1:3100";
if (fixture.origin !== origin || new URL(database.url).hostname !== "127.0.0.1" || new URL(database.url).pathname !== "/maras_qa" || process.env.DATABASE_URL !== database.url) throw new Error("Dedicated loopback fixtures and database required");
if (!process.env.ADMIN_MFA_ENCRYPTION_KEY || process.env.GEMINI_API_KEY || process.env.S3_BUCKET || process.env.TAP_SECRET_KEY || process.env.RESEND_API_KEY) throw new Error("Synthetic MFA key and no live credentials required");
const [{ getDb, closeDb }, schema, mfa] = await Promise.all([import("../db/index.ts"), import("../db/schema.ts"), import("../lib/admin-mfa.ts")]);
const db = getDb(), owner = fixture.users.find(u => u.role === "admin");
const engines = { chromium, firefox, webkit };
const names = (process.env.QA_BROWSERS || "chromium").split(",");
if (names.some(name => !engines[name])) throw new Error("Unknown browser engine");
const reports = [];
const cookie = token => ({ name: "meras_session", value: token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" });
async function assertFits(page, label) {
  // The live sync stream is intentionally long-lived; networkidle is not a readiness signal.
  await page.locator("h1").first().waitFor({ state: "visible" });
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const measure = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(measure.scroll <= measure.width + 2, `${label}: horizontal overflow ${measure.scroll}/${measure.width}`);
}
try {
  for (const name of names) {
    const dir = `.data/platform-browser/${name}`; mkdirSync(dir, { recursive: true });
    const browser = await engines[name].launch({ headless: true, ...(name === "chromium" && process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
    let factorId;
    const checks = [], errors = [];
    try {
      const context = await browser.newContext({ locale: "ar-SA", reducedMotion: "reduce", viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
      const paths = ["/about", "/why-maras", "/faq", "/how-it-works", "/privacy", "/terms", "/contact", "/refund-policy"];
      for (const path of paths) {
        const response = await page.goto(origin + path, { waitUntil: "domcontentloaded" }); assert.equal(response.status(), 200, path);
        await page.locator("h1").first().waitFor({ state: "visible" });
        await page.waitForFunction(() => Boolean(document.documentElement.dataset.palette));
        await page.locator('link[rel="canonical"]').waitFor({ state: "attached" });
        assert.ok((await page.locator('link[rel="canonical"]').getAttribute("href")).startsWith("https://maras-qa.example/"));
        for (const width of [320, 390, 768, 1440]) {
          await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
          await assertFits(page, `${path}/${width}`);
        }
      }
      checks.push("eight public routes render headings and canonical URLs; 320/390/768/1440px have no page overflow");
      await page.goto(origin + "/faq", { waitUntil: "domcontentloaded" });
      const count = await page.locator("details").count(); assert.equal(count, 35);
      const schemaContent = await page.locator('script[type="application/ld+json"]').allTextContents();
      assert.ok(schemaContent.some(value => { const row = JSON.parse(value); return row["@type"] === "FAQPage" && row.mainEntity.length === count; }));
      await page.getByLabel("البحث في الأسئلة الشائعة").fill("MFA"); assert.ok(await page.locator("details").count() > 0 && await page.locator("details").count() < count);
      await page.getByLabel("البحث في الأسئلة الشائعة").fill("");
      checks.push("35 rendered FAQ answers match structured data and search filters the real visible content");
      for (const theme of ["light", "dark"]) {
        await page.evaluate(value => localStorage.setItem("meras-theme", value), theme);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(isDark => document.documentElement.classList.contains("dark") === isDark, theme === "dark");
        await page.screenshot({ path: `${dir}/faq-${theme}.png`, fullPage: true, animations: "disabled" });
        await page.goto(origin + "/about", { waitUntil: "domcontentloaded" });
        await page.screenshot({ path: `${dir}/about-${theme}.png`, fullPage: true, animations: "disabled" });
        await page.setViewportSize({ width: 390, height: 844 }); await assertFits(page, `about/${theme}/phone`);
        await page.screenshot({ path: `${dir}/about-${theme}-phone.png`, fullPage: true, animations: "disabled" });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(origin + "/faq", { waitUntil: "domcontentloaded" });
      }
      checks.push("public light/dark theme persists across navigation; desktop and phone screenshots captured");
      await context.close();
      const enrollmentFixture = JSON.parse(readFileSync(".data/qa-security-fixtures.json", "utf8")).enrollment[name];
      const enrolling = await browser.newContext({ locale: "ar-SA", reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
      await enrolling.addCookies([cookie(enrollmentFixture.token)]);
      const security = await enrolling.newPage(); security.on("pageerror", error => errors.push(error.message));
      await security.goto(origin + "/admin/security", { waitUntil: "domcontentloaded" });
      const securityCard = security.locator("article").first();
      await securityCard.getByLabel("كلمة المرور الحالية — مطلوبة للإعداد والتعطيل").fill(enrollmentFixture.password);
      const setupReply = security.waitForResponse(response => response.url().endsWith("/api/admin/security/mfa") && response.request().method() === "POST");
      await securityCard.getByRole("button", { name: "بدء الإعداد الآمن" }).click();
      const setupResponse = await setupReply; assert.equal(setupResponse.status(), 201);
      const setupPayload = await setupResponse.json();
      await securityCard.getByLabel("رمز المصادقة المكون من ستة أرقام").fill(mfa.totpCodeForCounter(setupPayload.secret, Math.floor(Date.now() / 30_000)));
      const verifyReply = security.waitForResponse(response => response.url().endsWith("/api/admin/security/mfa") && response.request().method() === "POST");
      await securityCard.getByRole("button", { name: "تفعيل الحماية", exact: true }).click();
      const verifyResponse = await verifyReply; assert.equal(verifyResponse.status(), 200);
      const verifyPayload = await verifyResponse.json(); assert.equal(verifyPayload.recoveryCodes.length, 10);
      const stored = await db.select({ codeHash: schema.accountMfaRecoveryCodes.codeHash }).from(schema.accountMfaRecoveryCodes).where(eq(schema.accountMfaRecoveryCodes.userId, enrollmentFixture.id));
      assert.equal(stored.length, 10); assert.ok(stored.every(row => !verifyPayload.recoveryCodes.includes(row.codeHash)));
      await securityCard.getByRole("button", { name: "حفظت الرموز، إخفاؤها" }).click();
      assert.equal(await securityCard.getByLabel("كلمة المرور الحالية — مطلوبة للإعداد والتعطيل").inputValue(), "");
      await assertFits(security, "admin/security/enrolled/phone");
      // Only capture after the secret and recovery codes have been cleared from the UI.
      await security.screenshot({ path: `${dir}/security-enrolled-phone.png`, fullPage: true, animations: "disabled" });
      await enrolling.close();
      checks.push("admin enrollment UI reauthenticates with a password, enables TOTP and displays recovery codes once before clearing sensitive fields");
      // The fixture owner never has a production factor: refuse to alter pre-existing factor data.
      const existing = await db.select({ id: schema.adminMfaFactors.id }).from(schema.adminMfaFactors).where(eq(schema.adminMfaFactors.userId, owner.id));
      assert.equal(existing.length, 0, "browser QA must not touch a pre-existing owner factor");
      const secret = "JBSWY3DPEHPK3PXP", now = new Date().toISOString();
      const [factor] = await db.insert(schema.adminMfaFactors).values({ userId: owner.id, type: "totp", label: "Synthetic browser QA", secretEncrypted: mfa.encryptAdminMfaSecret(secret), counter: Math.floor(Date.now() / 30_000) - 1, verifiedAt: now }).returning({ id: schema.adminMfaFactors.id }); factorId = factor.id;
      await db.update(schema.authSessions).set({ mfaVerifiedAt: now }).where(eq(schema.authSessions.tokenHash, createHash("sha256").update(owner.token).digest("hex")));
      const admin = await browser.newContext({ locale: "ar-SA", reducedMotion: "reduce", viewport: { width: 1440, height: 1000 } }); await admin.addCookies([cookie(owner.token)]);
      const editor = await admin.newPage(); editor.on("pageerror", error => errors.push(error.message));
      await editor.goto(origin + "/admin/staff", { waitUntil: "domcontentloaded" });
      await editor.getByRole("button", { name: "إضافة مشرف", exact: true }).click();
      const uniqueEmail = `qa-browser-${name}-${randomBytes(5).toString("hex")}@example.test`;
      await editor.getByLabel("الاسم الكامل", { exact: true }).fill("مشرف اختبار المتصفح");
      await editor.getByLabel("البريد الإلكتروني", { exact: true }).fill(uniqueEmail);
      await editor.getByLabel("كلمة المرور الأولية", { exact: true }).fill(randomBytes(20).toString("base64url") + "aA1!");
      await editor.getByRole("checkbox", { name: /عرض المواد والجهات والتخصصات/ }).check();
      await editor.getByRole("button", { name: "حفظ المشرف", exact: true }).click();
      const dialog = editor.getByRole("dialog", { name: "تأكيد هويتك" }); await dialog.waitFor();
      await editor.screenshot({ path: `${dir}/staff-mfa-preserved-form.png`, fullPage: true, animations: "disabled" });
      await dialog.getByRole("button", { name: "إلغاء والعودة" }).click();
      assert.equal(await editor.getByLabel("البريد الإلكتروني", { exact: true }).inputValue(), uniqueEmail);
      assert.equal((await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, uniqueEmail))).length, 0);
      await editor.getByRole("button", { name: "حفظ المشرف", exact: true }).click(); await dialog.waitFor();
      await dialog.getByLabel("رمز تطبيق المصادقة").fill(mfa.totpCodeForCounter(secret, Math.floor(Date.now() / 30_000)));
      // A busy button changes its accessible name before the POST commits.
      const savedReply = editor.waitForResponse(response => new URL(response.url()).pathname === "/api/admin/staff" && response.request().method() === "POST");
      await dialog.getByRole("button", { name: "تحقق ومتابعة", exact: true }).click();
      const savedResponse = await savedReply;
      assert.equal(savedResponse.status(), 200, "the MFA-authorized staff transaction must succeed");
      const savedPayload = await savedResponse.json();
      assert.equal(savedPayload.ok, true);
      assert.equal(savedPayload.user.email, uniqueEmail);
      await editor.getByRole("button", { name: "إغلاق محرر المشرف", exact: true }).waitFor({ state: "hidden" });
      assert.equal((await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, uniqueEmail))).length, 1);
      checks.push("real staff mutation pauses for MFA, cancellation preserves fields and writes nothing; verified retry creates exactly one supervisor");
      await editor.setViewportSize({ width: 390, height: 844 }); await assertFits(editor, "admin/staff/phone");
      await editor.screenshot({ path: `${dir}/staff-phone.png`, fullPage: true, animations: "disabled" });
      await editor.goto(origin + "/admin/content", { waitUntil: "domcontentloaded" });
      const title = editor.getByLabel("عنوان الصفحة", { exact: true }); await title.fill("عنوان اختبار لم ينشر — مراس العلم");
      await editor.getByRole("button", { name: "نشر التغييرات", exact: true }).click();
      await editor.getByRole("dialog", { name: "نشر محتوى الصفحات؟" }).getByRole("button", { name: "إلغاء والعودة" }).click();
      assert.equal(await title.inputValue(), "عنوان اختبار لم ينشر — مراس العلم"); await assertFits(editor, "admin/content/phone");
      await editor.screenshot({ path: `${dir}/content-editor-phone.png`, fullPage: true, animations: "disabled" });
      checks.push("branded publish confirmation cancellation retains the draft and responsive content editor remains usable");
      await admin.close();
      const viewerFixture = JSON.parse(readFileSync(".data/qa-security-fixtures.json", "utf8"));
      const viewer = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); await viewer.addCookies([cookie(viewerFixture.supervisor.token)]);
      const viewerPage = await viewer.newPage(); await viewerPage.goto(origin + "/admin", { waitUntil: "domcontentloaded" });
      assert.equal(await viewerPage.locator('a[href="/admin/staff"],a[href="/admin/finance"],a[href="/admin/content"]').count(), 0);
      assert.equal((await viewer.request.get(origin + "/api/admin/staff")).status(), 403);
      assert.equal((await viewer.request.get(origin + "/api/admin/videos/direct?fileName=x.mp4&size=10")).status(), 403);
      checks.push("catalog-view supervisor has no owner/finance/content navigation and is denied staff and upload-signing APIs");
      await viewer.close(); assert.deepEqual(errors, [], "no client JavaScript exceptions");
      const report = { engine: name, passed: checks.length, checks, clientExceptions: errors, liveProviders: false, devices: "browser viewport emulation, not physical phones" };
      writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2)); reports.push(report); console.log(JSON.stringify(report, null, 2));
    } finally { if (factorId) await db.delete(schema.adminMfaFactors).where(eq(schema.adminMfaFactors.id, factorId)); await browser.close(); }
  }
  writeFileSync(".data/platform-browser/report.json", JSON.stringify({ engines: reports.map(r => r.engine), checks: reports.reduce((n,r) => n + r.passed, 0), reports }, null, 2));
} finally { await closeDb(); }
