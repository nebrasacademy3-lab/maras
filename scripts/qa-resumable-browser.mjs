/** Browser + real HTTP/SQL/byte verification, restricted to disposable loopback QA. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chromium, firefox, webkit } from "playwright";
import { eq, inArray, sql } from "drizzle-orm";
import { observeBrowserContext } from "./qa-browser-observations.mjs";
const fixtures = JSON.parse(readFileSync(".data/qa-fixtures.json", "utf8"));
const local = JSON.parse(readFileSync(".data/qa-database.json", "utf8"));
const origin = "http://127.0.0.1:3100";
if (fixtures.origin !== origin || new URL(local.url).hostname !== "127.0.0.1" || new URL(local.url).pathname !== "/maras_qa" || process.env.DATABASE_URL !== local.url) throw new Error("Dedicated loopback QA required");
for (const name of ["S3_ENDPOINT", "S3_BUCKET", "GEMINI_API_KEY", "GEMINI_API_KEYS", "RESEND_API_KEY", "TAP_SECRET_KEY"]) if (process.env[name]) throw new Error("Live provider prohibited");
const [{ getDb, closeDb }, s, storage, deletion] = await Promise.all([import("../db/index.ts"), import("../db/schema.ts"), import("../lib/storage.ts"), import("../lib/admin-deletion.ts")]);
const db = getDb(), owner = fixtures.users.find(user => user.role === "admin"), engines = { chromium, firefox, webkit };
const names = (process.env.QA_BROWSERS || "chromium").split(","); if (names.some(name => !engines[name])) throw new Error("Invalid QA browser engine");
const temporary = join(tmpdir(), `meras-resumable-${randomUUID()}.mp4`), reports = [];
try {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=15", "-t", "1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-movflags", "+faststart", temporary], { timeout: 20000 });
  // A legal MP4 free box forces two chunks without a large video-generation job.
  const padding = Buffer.alloc(4 * 1024 * 1024); padding.writeUInt32BE(padding.length); padding.write("free", 4);
  const bytes = Buffer.concat([readFileSync(temporary), padding]);
  for (const name of names) {
    const course = `qa-browser-resume-${randomUUID().slice(0, 8)}`, lesson = `${course}-lesson`, uploadIds = [];
    const browser = await engines[name].launch({ headless: true, ...(name === "chromium" && process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
    const observations = [];
    const evidenceDirectory = `.data/resumable-browser/${name}`;
    mkdirSync(evidenceDirectory, { recursive: true });
    try {
      await db.insert(s.catalogCourses).values({ slug: course, institutionSlug: "qa-university", specialtySlug: "qa-science", title: "فيديو اختبار الاستئناف", status: "published" });
      const [unit] = await db.insert(s.courseUnitsDb).values({ courseSlug: course, title: "وحدة اختبار الاستئناف" }).returning();
      await db.insert(s.lessonsDb).values({ id: lesson, courseSlug: course, unitId: unit.id, title: "درس اختبار الاستئناف" });
      const context = await browser.newContext({ locale: "ar-SA", viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
      context.setDefaultTimeout(30000);
      await observeBrowserContext(context, observations, "resumable-upload");
      await context.addCookies([{ name: "meras_session", value: owner.token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
      const page = await context.newPage(), errors = [], parts = []; let interrupted = false;
      page.on("pageerror", error => errors.push(error.message));
      await context.route("**/api/admin/videos/resumable?*", async route => {
        const req = route.request(), params = new URL(req.url()).searchParams;
        if (req.method() === "PUT") {
          const part = Number(params.get("part")); parts.push(part);
          if (part === 1 && !interrupted) { interrupted = true; return route.abort("connectionfailed"); }
        }
        return route.continue();
      });
      async function selectFile(navigate = true) {
        if (navigate) await page.goto(origin + "/admin?view=content", { waitUntil: "domcontentloaded" });
        await page.locator(`.live-content-grid select option[value="${course}"]`).first().waitFor({ state: "attached" });
        await page.locator(".live-content-grid select").first().selectOption(course, { force: true });
        const form = page.locator("form").filter({ has: page.locator('input[name="file"]') });
        await form.locator(`select[name="lessonId"] option[value="${lesson}"]`).waitFor({ state: "attached" });
        await form.locator('select[name="lessonId"]').selectOption(lesson, { force: true });
        await form.locator('input[type="file"]').setInputFiles({ name: "resumable-fixture.mp4", mimeType: "video/mp4", buffer: bytes });
        return form;
      }
      let form = await selectFile();
      const failed = page.waitForEvent("requestfailed", req => /resumable.*part=1/.test(req.url()));
      await form.getByRole("button", { name: "رفع إلى المخزن الخاص", exact: true }).click(); await failed;
      await form.getByText("تعذر الاتصال بالخادم أثناء الرفع.", { exact: true }).waitFor();
      const [session] = await db.select().from(s.resumableVideoUploads).where(eq(s.resumableVideoUploads.courseSlug, course)); assert.ok(session); uploadIds.push(session.id);
      assert.deepEqual(JSON.parse(session.receivedJson), [0]); assert.equal(session.status, "open");
      const markers = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("meras.video-resume.v1:")));
      assert.equal(markers.length, 1); assert.equal(markers[0][1], session.requestKey);
      // One real reload is the scenario under test. A second immediate goto
      // would discard the freshly mounting document and its in-flight requests.
      await page.reload({ waitUntil: "domcontentloaded" }); form = await selectFile(false);
      await form.getByRole("button", { name: "رفع إلى المخزن الخاص", exact: true }).click();
      await form.getByText(/تم التحقق من الفيديو وربطه بالدرس/).waitFor({ timeout: 60000 });
      assert.deepEqual(parts, [0, 1, 1], "reload must never resend acknowledged part zero");
      const [asset] = await db.select().from(s.videoAssets).where(eq(s.videoAssets.lessonId, lesson)); assert.ok(asset);
      const stored = await storage.getObject(asset.objectKey, undefined, "local"); assert.ok(stored);
      assert.equal(createHash("sha256").update(Buffer.from(await new Response(stored.body).arrayBuffer())).digest("hex"), createHash("sha256").update(bytes).digest("hex"));
      assert.equal((await db.select().from(s.videoProcessingJobs).where(eq(s.videoProcessingJobs.assetId, asset.id))).length, 1);
      assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("meras.video-resume.v1:")).length), 0);
      await page.setViewportSize({ width: 390, height: 844 }); await form.scrollIntoViewIfNeeded();
      mkdirSync(`.data/resumable-browser/${name}`, { recursive: true });
      await form.screenshot({ path: `.data/resumable-browser/${name}/upload-completed.png`, animations: "disabled" });
      assert.deepEqual(errors, []);
      const report = { engine: name, passed: 4, checks: ["real browser upload is interrupted after first committed chunk", "reload and reselect resume only the missing chunk", "HTTP finalization stores exact MP4 bytes and one durable processing job", "resume marker cleared and responsive completion UI captured"], clientExceptions: errors, liveProviders: false, physicalDevices: false };
      reports.push(report); console.log("RESUMABLE_BROWSER", JSON.stringify(report));
    } finally {
      writeFileSync(`${evidenceDirectory}/observations.json`, JSON.stringify(observations, null, 2));
      await browser.close();
      const assets = await db.select({ id: s.videoAssets.id }).from(s.videoAssets).where(eq(s.videoAssets.courseSlug, course));
      for (const asset of assets) await deletion.deleteAdminEntity(db, { entityType: "video", entityId: String(asset.id), actor: "qa-resume-browser@example.test", ipAddress: "127.0.0.1", confirmation: "حذف" });
      // The fixture course has no students, purchases or non-test assets.
      const sessions = await db.select().from(s.resumableVideoUploads).where(eq(s.resumableVideoUploads.courseSlug, course));
      for (const row of sessions) { await storage.deletePrefix(`private/resumable/${row.id}`, "local"); await storage.deleteObject(row.objectKey, "local"); }
      if (sessions.length) await db.delete(s.resumableVideoUploads).where(inArray(s.resumableVideoUploads.id, sessions.map(row => row.id)));
      await db.delete(s.lessonsDb).where(eq(s.lessonsDb.courseSlug, course)); await db.delete(s.courseUnitsDb).where(eq(s.courseUnitsDb.courseSlug, course)); await db.delete(s.catalogCourses).where(eq(s.catalogCourses.slug, course));
      if (uploadIds.length) await db.execute(sql`DELETE FROM storage_cleanup_jobs WHERE source LIKE 'resumable-%' AND (${sql.join(uploadIds.map(id => sql`object_key LIKE ${`%${id}%`}`), sql` OR `)})`);
    }
  }
  writeFileSync(".data/qa-resumable-browser-report.json", JSON.stringify(reports, null, 2));
} finally { rmSync(temporary, { force: true }); await closeDb(); }
