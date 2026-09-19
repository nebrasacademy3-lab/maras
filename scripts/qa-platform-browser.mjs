/** Browser checks use dedicated loopback fixtures and synthetic MFA only. */
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { randomBytes, createHash } from "node:crypto";
import { chromium, firefox, webkit } from "playwright";
import { eq } from "drizzle-orm";
import { observeBrowserContext } from "./qa-browser-observations.mjs";
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
  // Public h1 semantics are asserted separately. Admin sections may use h2.
  // A live sync stream is intentionally long-lived; networkidle is not readiness.
  await page.getByRole("heading").first().waitFor({ state: "visible", timeout: 15000 });
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const measure = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(measure.scroll <= measure.width + 2, `${label}: horizontal overflow ${measure.scroll}/${measure.width}`);
}
try {
  for (const name of names) {
    const dir = `.data/platform-browser/${name}`; mkdirSync(dir, { recursive: true });
    const browser = await engines[name].launch({ headless: true, ...(name === "chromium" && process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
    let factorId;
    const checks = [], errors = [], accessFailures = [], observations = [];
    const stage = label => { const progress = { engine: name, stage: label, timestamp: new Date().toISOString() }; writeFileSync(`${dir}/progress.json`, JSON.stringify(progress)); console.log("BROWSER_STAGE", JSON.stringify(progress)); };
    const observePage = page => {
      const onPageError = error => errors.push(error.message);
      const onRequestFailed = request => {
        const failure = request.failure();
        if (!failure?.errorText?.toLowerCase().includes("access control")) return;
        const headers = request.headers();
        accessFailures.push({
          url: request.url(),
          method: request.method(),
          resourceType: request.resourceType(),
          error: failure.errorText,
          origin: headers.origin || null,
          secFetchSite: headers["sec-fetch-site"] || null,
        });
      };
      page.on("pageerror", onPageError);
      page.on("requestfailed", onRequestFailed);
      return () => {
        page.off("pageerror", onPageError);
        page.off("requestfailed", onRequestFailed);
      };
    };
    try {
      const context = await browser.newContext({ locale: "ar-SA", reducedMotion: "reduce", viewport: { width: 1440, height: 1000 } });
      context.setDefaultTimeout(30000); context.setDefaultNavigationTimeout(30000);
      await observeBrowserContext(context, observations, "public");
      const hydration = await context.newPage();
      const stopHydrationObservation = observePage(hydration);
      let releaseScripts;
      const scriptGate = new Promise(resolve => { releaseScripts = resolve; });
      await hydration.route("**/_next/**/*.js*", async route => { await scriptGate; await route.continue(); });
      try {
        await hydration.goto(origin + "/faq", { waitUntil: "commit" });
        const search = hydration.getByLabel("البحث في الأسئلة الشائعة");
        await search.waitFor({ state: "visible" });
        assert.equal(await search.isDisabled(), true, "search cannot silently lose input before hydration");
        assert.ok((await hydration.getByRole("button", { name: /جميع الأسئلة/ }).isDisabled()));
        releaseScripts();
        await search.fill("MFA");
        await hydration.waitForFunction(() => {
          const rows = [...document.querySelectorAll("details")];
          return rows.length > 0 && rows.length < 35 && rows.every(row => row.textContent.toLowerCase().includes("mfa"));
        });
        assert.equal(await search.inputValue(), "MFA");
        checks.push("FAQ controls reject pre-hydration interaction and preserve the first search after scripts load");
      } finally { releaseScripts(); stopHydrationObservation(); await hydration.close(); }
      const paths = ["/about", "/why-maras", "/faq", "/how-it-works", "/privacy", "/terms", "/contact", "/refund-policy"];
      for (const path of paths) {
        const routePage = await context.newPage();
        const stopRouteObservation = observePage(routePage);
        const errorCount = errors.length, failureCount = accessFailures.length;
        try {
          const response = await routePage.goto(origin + path, { waitUntil: "domcontentloaded" }); assert.equal(response.status(), 200, path);
          await routePage.locator("h1").first().waitFor({ state: "visible" });
          await routePage.waitForFunction(() => Boolean(document.documentElement.dataset.palette));
          await routePage.locator('link[rel="canonical"]').waitFor({ state: "attached" });
          assert.ok((await routePage.locator('link[rel="canonical"]').getAttribute("href")).startsWith("https://maras-qa.example/"));
          for (const width of [320, 390, 768, 1440]) {
            await routePage.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
            await assertFits(routePage, `${path}/${width}`);
          }
          await routePage.waitForTimeout(250);
          assert.equal(errors.length, errorCount, `${path}: no active-page JavaScript exceptions`);
          assert.equal(accessFailures.length, failureCount, `${path}: no active-page access-control request failures`);
        } finally {
          stopRouteObservation();
          await routePage.close();
        }
      }
      checks.push("eight public routes render headings and canonical URLs; 320/390/768/1440px have no page overflow");
      const page = await context.newPage();
      const stopPublicObservation = observePage(page);
      await page.goto(origin + "/faq", { waitUntil: "domcontentloaded" });
      const count = await page.locator("details").count(); assert.equal(count, 35);
      const schemaContent = await page.locator('script[type="application/ld+json"]').allTextContents();
      assert.ok(schemaContent.some(value => { const row = JSON.parse(value); return row["@type"] === "FAQPage" && row.mainEntity.length === count; }));
      const originalIds = await page.locator("details").evaluateAll(nodes => nodes.map(node => node.id));
      const expectedIds = await page.locator("details").evaluateAll(nodes => nodes.filter(node => node.textContent.toLowerCase().includes("mfa")).map(node => node.id));
      assert.ok(expectedIds.length > 0 && expectedIds.length < count);
      await page.getByLabel("البحث في الأسئلة الشائعة").fill("MFA");
      await page.waitForFunction(ids => JSON.stringify([...document.querySelectorAll("details")].map(node => node.id)) === JSON.stringify(ids), expectedIds);
      assert.deepEqual(await page.locator("details").evaluateAll(nodes => nodes.map(node => node.id)), expectedIds);
      await page.getByLabel("البحث في الأسئلة الشائعة").fill("qa-no-matching-answer-938471");
      await page.getByRole("heading", { name: "لم نجد تطابقًا", exact: true }).waitFor({ state: "visible" });
      assert.equal(await page.locator("details").count(), 0);
      await page.getByLabel("البحث في الأسئلة الشائعة").fill("");
      await page.waitForFunction(ids => JSON.stringify([...document.querySelectorAll("details")].map(node => node.id)) === JSON.stringify(ids), originalIds);
      checks.push("35 rendered FAQ answers match structured data and search filters the real visible content");
      for (const theme of ["light", "dark"]) {
        const desiredDark = theme === "dark";
        const currentDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
        if (currentDark !== desiredDark) {
          await page.getByRole("button", { name: desiredDark ? "تفعيل الوضع الليلي" : "تفعيل الوضع الفاتح" }).first().click();
        }
        await page.waitForFunction(isDark => document.documentElement.classList.contains("dark") === isDark, desiredDark);
        await page.screenshot({ path: `${dir}/faq-${theme}.png`, fullPage: true, animations: "disabled" });
        const aboutLink = page.locator('a[href="/about"]').first();
        await aboutLink.waitFor({ state: "visible" });
        await Promise.all([page.waitForURL(origin + "/about"), aboutLink.click()]);
        await page.waitForFunction(isDark => document.documentElement.classList.contains("dark") === isDark, desiredDark);
        await page.screenshot({ path: `${dir}/about-${theme}.png`, fullPage: true, animations: "disabled" });
        await page.setViewportSize({ width: 390, height: 844 }); await assertFits(page, `about/${theme}/phone`);
        await page.screenshot({ path: `${dir}/about-${theme}-phone.png`, fullPage: true, animations: "disabled" });
        await page.setViewportSize({ width: 1440, height: 1000 });
        const faqLink = page.locator('a[href="/faq"]').first();
        await faqLink.waitFor({ state: "visible" });
        await Promise.all([page.waitForURL(origin + "/faq"), faqLink.click()]);
        await page.waitForFunction(isDark => document.documentElement.classList.contains("dark") === isDark, desiredDark);
      }
      await page.waitForTimeout(250);
      checks.push("public light/dark theme persists across real Next navigation; desktop and phone screenshots captured");
      stopPublicObservation();
      await page.close();
      await context.close();
      const enrollmentFixture = JSON.parse(readFileSync(".data/qa-security-fixtures.json", "utf8")).enrollment[name];
      const enrolling = await browser.newContext({ locale: "ar-SA", reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
      enrolling.setDefaultTimeout(30000); enrolling.setDefaultNavigationTimeout(30000);
      await observeBrowserContext(enrolling, observations, "enrollment");
      await enrolling.addCookies([cookie(enrollmentFixture.token)]);
      const security = await enrolling.newPage(); observePage(security);
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
      const existing = await db.select({ id: schema.adminMfaFactors.id }).from(schema.adminMfaFactors).where(eq(schema.adminMfaFactors.userId, owner.id));
      assert.equal(existing.length, 0, "browser QA must not touch a pre-existing owner factor");
      const secret = "JBSWY3DPEHPK3PXP", now = new Date().toISOString();
      const [factor] = await db.insert(schema.adminMfaFactors).values({ userId: owner.id, type: "totp", label: "Synthetic browser QA", secretEncrypted: mfa.encryptAdminMfaSecret(secret), counter: Math.floor(Date.now() / 30_000) - 1, verifiedAt: now }).returning({ id: schema.adminMfaFactors.id }); factorId = factor.id;
      await db.update(schema.authSessions).set({ mfaVerifiedAt: now }).where(eq(schema.authSessions.tokenHash, createHash("sha256").update(owner.token).digest("hex")));
      const admin = await browser.newContext({ locale: "ar-SA", reducedMotion: "reduce", viewport: { width: 1440, height: 1000 } }); await admin.addCookies([cookie(owner.token)]);
      admin.setDefaultTimeout(30000); admin.setDefaultNavigationTimeout(30000);
      await observeBrowserContext(admin, observations, "owner");
      const editor = await admin.newPage(); const stopEditorObservation = observePage(editor);
      stage("owner-navigation");
      await editor.goto(origin + "/admin", { waitUntil: "domcontentloaded" });
      await editor.locator("aside").first().waitFor({ state: "visible" });
      const sidebar = editor.locator("aside").first();
      assert.equal(await sidebar.locator("details > summary").count(), 8, "single eight-group owner navigation");
      assert.equal(await editor.locator(".admin-sidebar").count(), 0, "legacy duplicated sidebar removed, not hidden");
      await editor.getByRole("heading", { name: "ما يحتاج متابعتك", exact: true }).waitFor({ state: "visible" });
      await assertFits(editor, "admin/owner/desktop");
      await editor.screenshot({ path: `${dir}/unified-admin-desktop.png`, fullPage: true, animations: "disabled" });
      await editor.setViewportSize({ width: 390, height: 844 });
      await editor.getByRole("button", { name: "فتح أقسام الإدارة", exact: true }).click();
      const navigation = editor.getByRole("dialog", { name: "أقسام الإدارة", exact: true });
      await navigation.waitFor({ state: "visible" });
      await navigation.getByLabel("البحث في أقسام الإدارة المسموحة").fill("الطلاب");
      assert.ok(await navigation.getByRole("link", { name: /الطلاب/ }).count() > 0);
      await editor.keyboard.press("Escape");
      await navigation.waitFor({ state: "hidden" });
      await assertFits(editor, "admin/owner/phone");
      checks.push("owner navigation has eight unified groups, no legacy sidebar, and a searchable keyboard-accessible mobile drawer");
      await editor.setViewportSize({ width: 1440, height: 1000 });
      stage("gemini-operational-verification");
      const operational = await admin.request.get(origin + "/api/admin/operations/summary");
      assert.equal(operational.status(), 200);
      assert.match(operational.headers()["cache-control"], /no-store/);
      const verification = (await operational.json()).geminiVerification;
      assert.deepEqual(Object.keys(verification).sort(), ["projects", "verified", "expired", "expiring", "scheduled", "checking", "failed", "overdue"].sort());
      assert.ok(Object.values(verification).every(value=>Number.isSafeInteger(value)&&value>=0));
      await editor.goto(origin + "/admin/operations", { waitUntil: "domcontentloaded" });
      await editor.getByRole("heading", {name:"إثبات مشاريع Gemini",exact:true}).waitFor();
      for (const theme of ["light","dark"]) {
        const dark=theme==="dark";
        if ((await editor.evaluate(()=>document.documentElement.classList.contains("dark")))!==dark) await editor.getByRole("button",{name:dark?"تفعيل الوضع الليلي":"تفعيل الوضع الفاتح"}).first().click();
        await editor.waitForFunction(value=>document.documentElement.classList.contains("dark")===value,dark);
        for (const width of [320,390,768,1440]) { await editor.setViewportSize({width,height:width<500?844:1000}); await assertFits(editor,`gemini-operations/${theme}/${width}`); }
        await editor.screenshot({path:`${dir}/gemini-operations-${theme}.png`,fullPage:true,animations:"disabled"});
      }
      checks.push("Gemini verification API returns only eight aggregate counters; real operations UI renders at four widths in both themes");
      await editor.goto(origin + "/admin/staff", { waitUntil: "domcontentloaded" });
      await editor.getByRole("button", { name: "إضافة مشرف", exact: true }).click();
      const uniqueEmail = `qa-browser-${name}-${randomBytes(5).toString("hex")}@example.test`;
      await editor.getByLabel("الاسم الكامل", { exact: true }).fill("مشرف اختبار المتصفح");
      await editor.getByLabel("البريد الإلكتروني", { exact: true }).fill(uniqueEmail);
      await editor.getByLabel("كلمة المرور الأولية", { exact: true }).fill(randomBytes(20).toString("base64url") + "aA1!");
      await editor.getByRole("checkbox", { name: /عرض المواد والجهات والتخصصات/ }).check();
      const staffRequests = [];
      const observeStaffResponse = response => {
        if (response.url() === origin + "/api/admin/staff" && response.request().method() === "POST") staffRequests.push(response.status());
      };
      editor.on("response", observeStaffResponse);
      await editor.getByRole("button", { name: "حفظ المشرف", exact: true }).click();
      const dialog = editor.getByRole("dialog", { name: "تأكيد هويتك" }); await dialog.waitFor();
      await editor.screenshot({ path: `${dir}/staff-mfa-preserved-form.png`, fullPage: true, animations: "disabled" });
      await dialog.getByRole("button", { name: "إلغاء والعودة" }).click();
      await editor.getByRole("button", { name: "حفظ المشرف", exact: true }).waitFor({ state: "visible" });
      assert.equal(await editor.getByLabel("البريد الإلكتروني", { exact: true }).inputValue(), uniqueEmail);
      assert.deepEqual(staffRequests, [428], "cancelled verification must not replay the mutation");
      assert.equal((await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, uniqueEmail))).length, 0);
      await editor.getByRole("button", { name: "حفظ المشرف", exact: true }).click(); await dialog.waitFor();
      await dialog.getByLabel("رمز تطبيق المصادقة").fill(mfa.totpCodeForCounter(secret, Math.floor(Date.now() / 30_000)));
      // Register both listeners before verification; do not poll the rate-limited API.
      // The save button changes its accessible name while busy, so it is not a completion signal.
      const [proofResponse, savedResponse] = await Promise.all([
        editor.waitForResponse(response => response.url() === origin + "/api/admin/security/mfa" && response.request().method() === "POST"),
        editor.waitForResponse(response => response.url() === origin + "/api/admin/staff" && response.request().method() === "POST"),
        dialog.getByRole("button", { name: "تحقق ومتابعة", exact: true }).click(),
      ]);
      assert.equal(proofResponse.status(), 200, "MFA proof must succeed");
      assert.equal(savedResponse.status(), 200, "verified staff retry must succeed");
      await editor.getByLabel("البريد الإلكتروني", { exact: true }).waitFor({ state: "detached" });
      assert.deepEqual(staffRequests, [428, 428, 200], "one retry only after a successful proof");
      editor.off("response", observeStaffResponse);
      assert.equal((await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, uniqueEmail))).length, 1);
      checks.push("real staff mutation pauses for MFA, cancellation preserves fields and writes nothing; verified retry creates exactly one supervisor");
      await editor.setViewportSize({ width: 390, height: 844 }); await assertFits(editor, "admin/staff/phone");
      await editor.screenshot({ path: `${dir}/staff-phone.png`, fullPage: true, animations: "disabled" });
      await editor.goto(origin + "/admin/content", { waitUntil: "domcontentloaded" });
      const title = editor.locator("fieldset textarea").first(); await title.fill("عنوان اختبار لم ينشر — مراس العلم");
      await editor.getByRole("button", { name: "نشر التغييرات", exact: true }).click();
      await editor.getByRole("dialog", { name: "نشر محتوى الصفحات؟" }).getByRole("button", { name: "إلغاء والعودة" }).click();
      assert.equal(await title.inputValue(), "عنوان اختبار لم ينشر — مراس العلم"); await assertFits(editor, "admin/content/phone");
      await editor.screenshot({ path: `${dir}/content-editor-phone.png`, fullPage: true, animations: "disabled" });
      checks.push("branded publish confirmation cancellation retains the draft and responsive content editor remains usable");
      stage("financial-owner-review");
      stopEditorObservation();
      await editor.close();
      const reviewOrder = JSON.parse(readFileSync(".data/qa-order-ownership-report.json", "utf8")).reviewOrder;
      assert.ok(/^OWNER-[a-f0-9]+-unbound$/.test(reviewOrder));
      const financePage = await admin.newPage();
      const stopFinanceObservation = observePage(financePage);
      const financeErrorCount = errors.length, financeFailureCount = accessFailures.length;
      await financePage.setViewportSize({ width: 1440, height: 1000 });
      // Streaming SSR may retain a hidden pre-hydration copy. Do not fill that
      // inert copy or select .first(): require one live, hydrated form instead.
      await financePage.route("**/*", async route => {
        if (route.request().resourceType() === "script" && route.request().url().startsWith(origin + "/_next/")) await new Promise(resolve => setTimeout(resolve, 500));
        await route.continue();
      });
      await financePage.goto(origin + "/admin/finance", { waitUntil: "commit" });
      const financeFilters = financePage.getByRole("form", { name: "مرشحات المركز المالي", exact: true });
      await financeFilters.waitFor({ state: "visible" });
      if (await financeFilters.getAttribute("data-finance-ready") === "false") assert.equal(await financeFilters.getByRole("searchbox", { name: "بحث مباشر", exact: true }).isDisabled(), true);
      await financePage.waitForFunction(() => document.querySelectorAll('form[data-finance-ready="true"]').length === 1);
      assert.equal(await financeFilters.count(), 1, "only one accessible finance filter form");
      const financeSearch = financeFilters.getByRole("searchbox", { name: "بحث مباشر", exact: true });
      assert.equal(await financeSearch.count(), 1, "search must have one live accessible target");
      await financeSearch.fill(reviewOrder);
      const filteredResponse = financePage.waitForResponse(response => new URL(response.url()).pathname === "/api/admin/finance" && new URL(response.url()).searchParams.get("search") === reviewOrder && response.request().method() === "GET");
      await financeFilters.getByRole("button", { name: "تطبيق المرشحات", exact: true }).click();
      assert.equal((await filteredResponse).status(), 200);
      assert.equal(await financeSearch.inputValue(), reviewOrder, "the first query survives hydration and loading");
      await financePage.getByRole("row").filter({ hasText: reviewOrder }).click();
      const financialDetail = financePage.getByRole("dialog", { name: "تفاصيل الطلب", exact: true });
      await financialDetail.getByText("ملكية هذا الطلب غير مثبتة.", { exact: false }).waitFor();
      assert.equal(await financialDetail.getByRole("button", { name: "اعتماد الدفعة وتفعيل المواد", exact: true }).isDisabled(), true);
      assert.equal(await financialDetail.getByRole("button", { name: "إنشاء طلب استرداد", exact: true }).isEnabled(), true);
      await financialDetail.getByText("البريد وقت الشراء", { exact: true }).waitFor();
      await financePage.screenshot({ path: `${dir}/financial-owner-review.png`, fullPage: true, animations: "disabled" });
      await financePage.waitForTimeout(250);
      assert.equal(errors.length, financeErrorCount, "admin/finance: no active-page JavaScript exceptions");
      assert.equal(accessFailures.length, financeFailureCount, "admin/finance: no active-page access-control request failures");
      checks.push("financial review explains unresolved ownership and disables activation without hiding the refund path or rewriting historical contact data");
      stopFinanceObservation();
      await financePage.close();
      await admin.close();
      const viewerFixture = JSON.parse(readFileSync(".data/qa-security-fixtures.json", "utf8"));
      const viewer = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); await viewer.addCookies([cookie(viewerFixture.supervisor.token)]);
      viewer.setDefaultTimeout(30000); viewer.setDefaultNavigationTimeout(30000);
      await observeBrowserContext(viewer, observations, "restricted-supervisor");
      const viewerPage = await viewer.newPage(); observePage(viewerPage); await viewerPage.goto(origin + "/admin", { waitUntil: "domcontentloaded" });
      assert.equal(await viewerPage.locator('a[href="/admin/staff"],a[href="/admin/finance"],a[href="/admin/content"]').count(), 0);
      assert.ok([401, 403].includes((await viewer.request.get(origin + "/api/admin/staff")).status()));
      assert.ok([401, 403].includes((await viewer.request.get(origin + "/api/admin/videos/direct?fileName=x.mp4&size=10")).status()));
      const forbiddenOperations = await viewer.request.get(origin + "/api/admin/operations/summary");
      assert.equal(forbiddenOperations.status(), 403);
      assert.equal("geminiVerification" in await forbiddenOperations.json(), false);
      checks.push("catalog-view supervisor has no owner/finance/content navigation and is denied staff and upload-signing APIs");
      await viewer.close();
      if (errors.length) {
        throw new assert.AssertionError({
          message: "no client JavaScript exceptions",
          actual: { errors, accessFailures: accessFailures.slice(0, 40) },
          expected: { errors: [], accessFailures: [] },
          operator: "deepStrictEqual",
        });
      }
      const report = { engine: name, passed: checks.length, checks, clientExceptions: errors, liveProviders: false, devices: "browser viewport emulation, not physical phones" };
      writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2)); reports.push(report); console.log(JSON.stringify(report, null, 2));
    } finally { writeFileSync(`${dir}/observations.json`, JSON.stringify(observations, null, 2)); if (factorId) await db.delete(schema.adminMfaFactors).where(eq(schema.adminMfaFactors.id, factorId)); await browser.close(); }
  }
  writeFileSync(".data/platform-browser/report.json", JSON.stringify({ engines: reports.map(r => r.engine), checks: reports.reduce((n,r) => n + r.passed, 0), reports }, null, 2));
} finally { await closeDb(); }
