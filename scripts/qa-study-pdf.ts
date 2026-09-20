/** Isolated acceptance: actual PostgreSQL, actual Chromium, actual route/session
 * authorization. Saved synthetic results only; no AI or external provider calls. */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { eq, inArray } from "drizzle-orm";
const local = JSON.parse(readFileSync(".data/qa-database.json", "utf8")) as { url: string };
const url = new URL(local.url);
if (url.hostname !== "127.0.0.1" || url.pathname !== "/maras_qa" || process.env.DATABASE_URL && process.env.DATABASE_URL !== local.url) throw new Error("Dedicated loopback maras_qa database required");
for (const key of ["RAILWAY_PROJECT_ID", "RAILWAY_ENVIRONMENT_ID", "GEMINI_API_KEY", "GEMINI_API_KEYS", "GEMINI_PAID_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_API_KEY", "RESEND_API_KEY", "TAP_SECRET_KEY", "S3_BUCKET", "BUCKET"]) if (process.env[key]) throw new Error("Live configuration forbidden");
const origin = "https://maras-qa.example", nonce = randomUUID(), now = new Date().toISOString();
Object.assign(process.env, { DATABASE_URL: local.url, DATABASE_SSL: "false", APP_URL: origin, NEXT_PUBLIC_SITE_URL: origin, SESSION_SECRET: randomBytes(40).toString("hex"), AUTO_SEED_CATALOG: "false", RUN_DB_MIGRATIONS: "false", MARAS_LOOPBACK_QA: "true", CI: "true", GITHUB_ACTIONS: "true", STUDY_PDF_QA_NO_SANDBOX: "true" });
const [s, { studyPdfExports }, { getDb, closeDb }, auth, route, pdf] = await Promise.all([import("../db/schema"), import("../db/study-pdf-schema"), import("../db"), import("../lib/auth"), import("../app/api/ai/artifacts/[id]/download/route"), import("../lib/study-pdf")]);
const db = getDb(), users: number[] = [], resources: number[] = [], checks: string[] = [];
let report: Record<string, unknown> = { ok: false, checks };
const originalSettings = await db.select().from(s.platformSettings).where(inArray(s.platformSettings.key, ["footer_description", "whatsapp_number", "social_youtube", "social_instagram", "content_view_mode"]));
let providerCalls = 0;
const fetch = globalThis.fetch;
globalThis.fetch = async () => { providerCalls++; throw new Error("No network/provider calls are allowed in saved-result PDF export"); };
function request(path: string, token = "", native = false, signal?: AbortSignal) {
  return new Request(origin + path, { signal, headers: { "user-agent": "Maras PDF isolated QA", "x-meras-device-id": `pdf-${nonce}-${native ? "app" : "web"}`, ...(native ? { "x-meras-client": "mobile-v1", "x-meras-platform": "android", authorization: `Bearer ${token}` } : { origin, cookie: `${auth.SESSION_COOKIE}=${token}` }) } });
}
const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
const pass = (message: string) => { checks.push(message); console.log(`PASS PDF ${message}`); };
async function setting(key: string, value: string) { await db.insert(s.platformSettings).values({ key, value }).onConflictDoUpdate({ target: s.platformSettings.key, set: { value } }); }
async function account(label: string) {
  const [row] = await db.insert(s.users).values({ email: `qa-pdf-${nonce}-${label}@example.test`, fullName: "حساب PDF اصطناعي", universitySlug: "qa-university", specialty: "علوم", academicLevel: "1", emailVerifiedAt: now, profileCompletedAt: now, onboardingCompletedAt: now }).returning(); users.push(row.id);
  const web = await auth.createSession(row.id, request("/api/auth/login"));
  const app = await auth.createSession(row.id, request("/api/mobile/auth/login", "", true));
  return { ...row, web: web.token, app: app.token };
}
type Account = Awaited<ReturnType<typeof account>>;
const science = ["# القياس والدقة · Measurement", "الكتلة مقدار المادة وتُقاس بالكيلوغرام. لا تتغير في هذا المثال.", "Mass measures the amount of matter in kilograms. It does not change in this example.", "$$", "F=ma,\\qquad E=mc^2", "$$", "| Quantity | Value | Unit |", "| --- | --- | --- |", "| Mass | 5.25 | kg |", "| Acceleration | 9.81 | m/s² |", "النفي محفوظ: لا يعني الارتباط وجود علاقة سببية.", "Correlation does not imply causation.", "$\\alpha+\\beta=\\gamma$", "$\\ce{SO4^2- + Ba^2+ -> BaSO4 v}$", "مرجع تعليمي اصطناعي: الفصل 1."].join("\n");
async function fixture(user: Account, content = science, official = false) {
  const [conversation] = await db.insert(s.aiConversations).values({ userId: user.id, title: "Saved synthetic result", kind: "summary" }).returning();
  let resourceId: number | null = null;
  if (official) {
    const [resource] = await db.insert(s.courseResources).values({ courseSlug: "qa-physics", lessonId: "qa-physics-lesson", title: "Synthetic verified source", objectKey: `qa-pdf/${nonce}/${randomUUID()}.txt`, originalName: "physics.txt", contentType: "text/plain", sizeBytes: 200, scanStatus: "clean", scanSha256: "a".repeat(64), status: "active", studentVisible: true }).returning(); resourceId = resource.id; resources.push(resource.id);
    await db.insert(s.courseAccess).values({ userId: user.id, userEmail: user.email, courseSlug: "qa-physics", startsAt: now }).onConflictDoUpdate({ target: [s.courseAccess.userId, s.courseAccess.courseSlug], set: { revokedAt: null, expiresAt: null, suspendedAt: null } });
  }
  const [file] = await db.insert(s.aiFiles).values({ userId: user.id, conversationId: conversation.id, sourceResourceId: resourceId, objectKey: `qa-pdf/${nonce}/${randomUUID()}.txt`, storageProvider: official ? "course-resource" : "local", originalName: "علم-اصطناعي.txt", contentType: "text/plain", sizeBytes: 200, scanStatus: "clean", scanSha256: "a".repeat(64), status: "ready" }).returning();
  const [artifact] = await db.insert(s.aiArtifacts).values({ userId: user.id, conversationId: conversation.id, fileId: file.id, kind: "summary", title: "مراس العلم · ملخص علمي ثنائي", content, model: "synthetic-no-provider" }).returning();
  return { user, file, artifact, resourceId };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const download = (f: Fixture, token = f.user.web, query = "format=pdf", native = false, signal?: AbortSignal) => route.GET(request(`/api/ai/artifacts/${f.artifact.id}/download?${query}`, token, native, signal), params(f.artifact.id));
async function waitLease(f: Fixture) {
  for (let i = 0; i < 250; i++) {
    const [row] = await db.select().from(studyPdfExports).where(eq(studyPdfExports.artifactId, f.artifact.id));
    if (row?.status === "rendering") return row;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Expected durable rendering reservation");
}
async function expectPdf(response: Response) {
  assert.equal(response.status, 200, response.status === 200 ? "" : await response.text());
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const data = Buffer.from(await response.arrayBuffer()); assert.equal(data.subarray(0, 5).toString(), "%PDF-");
  assert.equal(Number(response.headers.get("content-length")), data.length); return data;
}
try {
  await setting("content_view_mode", "both"); await setting("footer_description", "نبذة اختبار اصطناعية لمراس العلم."); await setting("whatsapp_number", "966500000000"); await setting("social_youtube", "https://youtube.com/@maras-qa"); await setting("social_instagram", "");
  const alice = await account("alice"), bob = await account("bob");
  const base = await fixture(alice, Array.from({ length: 6 }, (_, i) => `# الوحدة ${i + 1}\n${science}`).join("\n\n"));
  const response = await download(base), savedId = response.headers.get("x-maras-export-id");
  const bytes = await expectPdf(response); assert.ok(savedId); assert.match(response.headers.get("content-disposition") || "", /\.pdf/);
  mkdirSync(".data/study-pdf", { recursive: true }); writeFileSync(".data/study-pdf/bilingual-science.pdf", bytes);
  const info = execFileSync("pdfinfo", [".data/study-pdf/bilingual-science.pdf"], { encoding: "utf8" });
  const pages = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1]); assert.ok(pages >= 3 && pages <= 20);
  const text = execFileSync("pdftotext", ["-layout", ".data/study-pdf/bilingual-science.pdf", "-"], { encoding: "utf8" });
  assert.match(text, /Mass measures/); assert.match(text, /Correlation does not imply causation/); assert.match(text, /5\.25/); assert.match(text, /9\.81/); assert.match(text, /966500000000/); assert.match(text, /[\u0600-\u06ff]/);
  assert.equal(text.split("marasalelm").length - 1, 0); assert.equal(text.split("maras-qa.example").length - 1, pages);
  assert.equal(providerCalls, 0); pass("actual multilingual searchable multi-page PDF contains science, repeating headers, page numbers and final branding without any provider call");

  const cached = await download(base); assert.equal(cached.headers.get("x-maras-export-id"), savedId); assert.deepEqual(await expectPdf(cached), bytes);
  const native = await download(base, alice.app, "format=pdf", true); assert.deepEqual(await expectPdf(native), bytes);
  assert.equal((await download(base, bob.web)).status, 404); assert.equal((await download(base, "")).status, 401);
  const docx = await download(base, alice.web, ""); assert.equal(docx.status, 200); assert.equal(Buffer.from(await docx.arrayBuffer()).subarray(0, 2).toString(), "PK");
  pass("web/native authorization, identical cached bytes, cross-account rejection and historical DOCX compatibility");

  const duplicate = await fixture(alice); const outcomes = await Promise.all(Array.from({ length: 6 }, () => download(duplicate)));
  assert.ok(outcomes.some(r => r.status === 200)); assert.ok(outcomes.every(r => [200, 202].includes(r.status)));
  const rows = await db.select().from(studyPdfExports).where(eq(studyPdfExports.artifactId, duplicate.artifact.id)); assert.equal(rows.length, 1); assert.equal(rows[0].attempts, 1); assert.equal(rows[0].status, "ready");
  pass("six simultaneous requests coalesce into one durable rendering attempt without duplicate generation or exports");

  await setting("footer_description", "هوية جديدة دون إعادة توليد النص.");
  const fresh = await download(base); assert.notEqual(fresh.headers.get("x-maras-export-id"), savedId); assert.notDeepEqual(await expectPdf(fresh), bytes);
  assert.deepEqual(await expectPdf(await download(base, alice.web, `format=pdf&exportId=${savedId}`)), bytes);
  pass("branding changes create a versioned export while the original version and semantic result stay intact");

  await db.update(s.aiFiles).set({ scanStatus: "quarantined" }).where(eq(s.aiFiles.id, base.file.id)); assert.equal((await download(base)).status, 404); assert.equal((await download(base, alice.web, `format=pdf&exportId=${savedId}`)).status, 404);
  await db.update(s.aiFiles).set({ scanStatus: "clean" }).where(eq(s.aiFiles.id, base.file.id));
  const official = await fixture(bob, science, true); await expectPdf(await download(official));
  await db.update(s.courseAccess).set({ revokedAt: now }).where(eq(s.courseAccess.userId, bob.id)); assert.equal((await download(official)).status, 404);
  await db.update(s.courseAccess).set({ revokedAt: null }).where(eq(s.courseAccess.userId, bob.id));
  await setting("content_view_mode", "app_only"); assert.equal((await download(official)).status, 404); await expectPdf(await download(official, bob.app, "format=pdf", true)); await setting("content_view_mode", "both");
  pass("quarantine, course revocation and channel policy invalidate both cached and versioned PDF access");

  const revoked = await fixture(bob); const pending = download(revoked); await waitLease(revoked);
  await db.update(s.aiFiles).set({ scanStatus: "quarantined" }).where(eq(s.aiFiles.id, revoked.file.id));
  assert.equal((await pending).status, 404); const [denied] = await db.select().from(studyPdfExports).where(eq(studyPdfExports.artifactId, revoked.artifact.id)); assert.equal(denied.status, "failed"); assert.equal(denied.data, null);
  pass("quarantine while real Chromium runs prevents publication and clears the rendering lease");

  const charlie = await account("charlie"), changed = await fixture(charlie); const changing = download(changed); await waitLease(changed);
  await db.update(s.aiArtifacts).set({ content: "Changed source-derived text" }).where(eq(s.aiArtifacts.id, changed.artifact.id));
  assert.equal((await changing).status, 503); const [blocked] = await db.select().from(studyPdfExports).where(eq(studyPdfExports.artifactId, changed.artifact.id)); assert.equal(blocked.data, null); assert.equal(blocked.errorCode, "PDF_SOURCE_CHANGED");
  pass("a source/result change during rendering cannot publish bytes for an outdated digest");

  const fenced = await fixture(charlie); const late = download(fenced); const lease = await waitLease(fenced); const newerOwner = randomUUID();
  await db.update(studyPdfExports).set({ owner: newerOwner }).where(eq(studyPdfExports.id, lease.id)); assert.equal((await late).status, 503);
  const [unchanged] = await db.select().from(studyPdfExports).where(eq(studyPdfExports.id, lease.id)); assert.equal(unchanged.owner, newerOwner); assert.equal(unchanged.status, "rendering"); assert.equal(unchanged.data, null);
  await db.delete(studyPdfExports).where(eq(studyPdfExports.id, lease.id));
  pass("late renderer cannot acknowledge, clear or overwrite a newer PostgreSQL lease");

  const cancelFile = await fixture(charlie); const abort = new AbortController(); const cancelled = download(cancelFile, charlie.web, "format=pdf", false, abort.signal); await waitLease(cancelFile); abort.abort();
  assert.equal((await cancelled).status, 499); const [cancelRow] = await db.select().from(studyPdfExports).where(eq(studyPdfExports.artifactId, cancelFile.artifact.id)); assert.equal(cancelRow.data, null); assert.equal(cancelRow.owner, null);
  pass("cancelling a real rendering request kills its process group and releases the durable reservation without partial output");

  const invalid = await fixture(charlie, "$\\href{file:///etc/passwd}{x}$"); assert.equal((await download(invalid)).status, 422);
  const [invalidRow] = await db.select().from(studyPdfExports).where(eq(studyPdfExports.artifactId, invalid.artifact.id)); assert.equal(invalidRow.status, "failed"); assert.equal(invalidRow.errorCode, "PDF_MATH_INVALID");
  assert.equal((await db.select().from(s.aiArtifacts).where(eq(s.aiArtifacts.id, invalid.artifact.id)))[0].content, "$\\href{file:///etc/passwd}{x}$");
  pass("unsafe math fails closed and leaves the saved semantic result unchanged for rendering-only retry");

  const constrained = await fixture(bob); const placeholder = { id: randomUUID(), userId: bob.id, artifactId: constrained.artifact.id, inputDigest: "c".repeat(64), sourceDigest: "d".repeat(64), rendererVersion: "synthetic-capacity", status: "rendering", owner: randomUUID(), leaseUntil: new Date(Date.now() + 120_000).toISOString(), expiresAt: new Date(Date.now() + 240_000).toISOString() };
  await db.insert(studyPdfExports).values(placeholder); assert.equal((await download(constrained)).status, 429); await db.delete(studyPdfExports).where(eq(studyPdfExports.id, placeholder.id));
  pass("shared PostgreSQL capacity blocks a second simultaneous renderer for the same account");

  const david = await account("david"), ended = await fixture(david); const ending = download(ended); await waitLease(ended);
  await db.update(s.authSessions).set({ revokedAt: new Date().toISOString() }).where(eq(s.authSessions.userId, david.id));
  assert.equal((await ending).status, 401);
  pass("session revocation during real rendering prevents delivering the completed PDF to the revoked session");

  const expired = await fixture(bob); await expectPdf(await download(expired));
  await db.update(studyPdfExports).set({ expiresAt: new Date(Date.now() - 10_000).toISOString() }).where(eq(studyPdfExports.artifactId, expired.artifact.id)); await pdf.pruneStudyPdfExports();
  assert.equal((await db.select().from(studyPdfExports).where(eq(studyPdfExports.artifactId, expired.artifact.id))).length, 0);
  assert.equal((await db.select().from(s.aiArtifacts).where(eq(s.aiArtifacts.id, expired.artifact.id))).length, 1);
  assert.equal(providerCalls, 0); pass("cache expiry removes only derived PDF bytes, not the source, historical artifact or provider accounting");
  report = { ok: true, environment: "isolated PostgreSQL + Chromium; synthetic saved results; no live provider", checks, providerCalls, pages, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
} catch (error) {
  report = { ok: false, completed: checks, failure: error instanceof Error ? error.message.slice(0, 1000) : "Failure", providerCalls }; throw error;
} finally {
  globalThis.fetch = fetch;
  try {
    if (users.length) { await db.delete(s.courseAccess).where(inArray(s.courseAccess.userId, users)); await db.delete(s.users).where(inArray(s.users.id, users)); }
    if (resources.length) await db.delete(s.courseResources).where(inArray(s.courseResources.id, resources));
    for (const key of ["footer_description", "whatsapp_number", "social_youtube", "social_instagram", "content_view_mode"]) { const old = originalSettings.find(row => row.key === key); if (old) await setting(key, old.value); else await db.delete(s.platformSettings).where(eq(s.platformSettings.key, key)); }
  } catch (error) { report.ok = false; report.cleanupFailed = true; throw error; }
  finally { await closeDb(); writeFileSync(".data/qa-study-pdf-report.json", JSON.stringify(report, null, 2)); }
}
