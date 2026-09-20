/** Real routes, sessions, SQL authorization and publication races. Synthetic
 * loopback data and synthetic Google transport only; never a production test. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
const local = JSON.parse(readFileSync(".data/qa-database.json", "utf8")) as { url: string };
const target = new URL(local.url);
if (target.hostname !== "127.0.0.1" || target.pathname !== "/maras_qa" || process.env.DATABASE_URL && process.env.DATABASE_URL !== local.url) throw new Error("Dedicated loopback maras_qa database required");
for (const name of ["S3_BUCKET", "BUCKET", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "GEMINI_API_KEY", "GEMINI_API_KEYS", "GEMINI_FREE_API_KEY", "GEMINI_FREE_API_KEYS", "GEMINI_PAID_API_KEY", "GEMINI_PAID_API_KEYS", "GEMINI_CONTROL_PLANE_ACCESS_TOKEN", "GEMINI_CONTROL_PLANE_TOKEN_FILE", "GOOGLE_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "RESEND_API_KEY", "TAP_SECRET_KEY", "RAILWAY_PROJECT_ID"]) if (process.env[name]) throw new Error("Live configuration is forbidden");
const nonce = randomUUID(), origin = "https://maras-qa.example", now = new Date().toISOString();
Object.assign(process.env, { DATABASE_URL: local.url, DATABASE_SSL: "false", UPLOAD_DIR: `${process.cwd()}/.data/uploads`, APP_URL: origin, NEXT_PUBLIC_SITE_URL: origin, SESSION_SECRET: randomBytes(40).toString("hex"), AUTO_SEED_CATALOG: "false", RUN_DB_MIGRATIONS: "false", AI_PROVIDER_MIN_INTERVAL_MS: "250", AI_PROVIDER_MAX_CONCURRENT: "2", GEMINI_API_KEY: "AIza" + "synthetic_study_access_".repeat(2) });
const [{ getDb, getPool, closeDb }, s, auth, storage, conversations, conversationRoute, quizRoute, attemptsRoute, artifactRoute, jobRoute, chatRoute, actions, aiPlatform, keys, verification] = await Promise.all([
  import("../db"), import("../db/schema"), import("../lib/auth"), import("../lib/storage"),
  import("../app/api/ai/conversations/route"), import("../app/api/ai/conversations/[id]/route"), import("../app/api/ai/quizzes/[id]/route"), import("../app/api/ai/quizzes/[id]/attempts/route"), import("../app/api/ai/artifacts/[id]/download/route"), import("../app/api/ai/jobs/[id]/route"), import("../app/api/ai/conversations/[id]/messages/route"),
  import("../lib/ai-file-actions"), import("../lib/ai-platform"), import("../lib/ai-keys"), import("../lib/gemini-project-verification"),
]);
const db = getDb(); const checks: string[] = []; const userIds: number[] = []; const resourceIds: number[] = []; const objects: string[] = []; const fileIds: number[] = [];
const [priorPolicy] = await db.select().from(s.platformSettings).where(eq(s.platformSettings.key, "content_view_mode"));
const savedFetch = globalThis.fetch;
let generationCalls = 0, countCalls = 0, controlCalls = 0;
let afterGeneration: (() => Promise<void>) | null = null;
const projectNumber = "8" + String(Date.now()), projectId = "maras-output-qa-" + nonce.slice(0, 8), keyResource = `projects/${projectNumber}/locations/global/keys/output-qa`;
const counted = new Map<string, number>();
const pass = (message: string) => { checks.push(message); console.log(`PASS ${message}`); };
function request(path: string, token = "", body?: unknown, native = false, method = body === undefined ? "GET" : "POST") {
  const headers: Record<string, string> = { "user-agent": "Maras-isolated-study-QA", "x-meras-device-id": `qa-${native ? "native" : "web"}-${nonce}`, ...(native ? { "x-meras-client": "mobile-v1", "x-meras-platform": "android", ...(token ? { authorization: `Bearer ${token}` } : {}) } : { origin, ...(token ? { cookie: `${auth.SESSION_COOKIE}=${token}` } : {}) }), ...(body === undefined ? {} : { "content-type": "application/json" }) };
  return new Request(origin + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const params = (id: string | number) => ({ params: Promise.resolve({ id: String(id) }) });
async function user(label: string) {
  const [row] = await db.insert(s.users).values({ email: `qa-study-${nonce}-${label}@example.test`, fullName: "حساب دراسة اصطناعي", universitySlug: "qa-university", specialty: "علوم الاختبار", academicLevel: "الأول", emailVerifiedAt: now, profileCompletedAt: now, onboardingCompletedAt: now }).returning();
  userIds.push(row.id);
  const web = await auth.createSession(row.id, request("/api/auth/login"));
  const native = await auth.createSession(row.id, request("/api/mobile/auth/login", "", undefined, true));
  assert.equal((await auth.getSessionUser(request("/api/ai/conversations", web.token)))?.id, row.id);
  assert.equal((await auth.getSessionUser(request("/api/ai/conversations", native.token, undefined, true)))?.id, row.id);
  return { ...row, web: web.token, native: native.token };
}
type Account = Awaited<ReturnType<typeof user>>;
async function policy(value: string) { await db.insert(s.platformSettings).values({ key: "content_view_mode", value }).onConflictDoUpdate({ target: s.platformSettings.key, set: { value } }); }
const sourceBytes = Buffer.from("Synthetic controlled study source: F = m * a. Energy is conserved in this example.\n");
async function fixture(account: Account, official = false, status = "ready") {
  const objectKey = `qa-study-output/${nonce}/${randomUUID()}.txt`;
  await storage.putObject(objectKey, new Response(sourceBytes).body!, "text/plain", "local"); objects.push(objectKey);
  const [conversation] = await db.insert(s.aiConversations).values({ userId: account.id, title: "Protected synthetic result", kind: "summary" }).returning();
  let resourceId: number | null = null;
  if (official) {
    const [r] = await db.insert(s.courseResources).values({ courseSlug: "qa-physics", lessonId: "qa-physics-lesson", title: "Synthetic source", objectKey, originalName: "synthetic.txt", contentType: "text/plain", sizeBytes: sourceBytes.length, scanSha256: createHash("sha256").update(sourceBytes).digest("hex"), scanStatus: "clean", status: "active", studentVisible: true }).returning();
    resourceId = r.id; resourceIds.push(r.id);
    await db.insert(s.courseAccess).values({ userId: account.id, userEmail: account.email, courseSlug: "qa-physics", startsAt: now }).onConflictDoUpdate({ target: [s.courseAccess.userId, s.courseAccess.courseSlug], set: { revokedAt: null, suspendedAt: null, expiresAt: null } });
  }
  const [file] = await db.insert(s.aiFiles).values({ userId: account.id, conversationId: conversation.id, sourceResourceId: resourceId, objectKey: official ? `ai-linked/${account.id}/${resourceId}/${nonce}` : objectKey, storageProvider: official ? "course-resource" : "local", originalName: "synthetic.txt", contentType: "text/plain", sizeBytes: sourceBytes.length, scanSha256: createHash("sha256").update(sourceBytes).digest("hex"), scanStatus: status === "ready" ? "clean" : "pending", status }).returning();
  fileIds.push(file.id);
  const [artifact] = await db.insert(s.aiArtifacts).values({ userId: account.id, conversationId: conversation.id, fileId: file.id, kind: "summary", title: "Protected synthetic artifact", content: "QA_PRIVATE_CONTENT: F = m * a", model: "synthetic" }).returning();
  const questions = [{ id: "q1", type: "single_choice", question: "Synthetic question", choices: ["a", "b", "c", "d"], correctIndex: 0, explanation: "QA_PROTECTED_EXPLANATION", translatedExplanation: null, scientificTerms: [] }];
  const [quiz] = await db.insert(s.aiQuizzes).values({ userId: account.id, conversationId: conversation.id, fileId: file.id, title: "Protected synthetic quiz", questionsJson: JSON.stringify(questions) }).returning();
  await db.insert(s.aiMessages).values({ userId: account.id, conversationId: conversation.id, fileId: file.id, role: "assistant", service: "summary", content: "QA_PRIVATE_CONTENT derived from source" });
  const [job] = await db.insert(s.aiFileJobs).values({ id: randomUUID(), requestId: randomUUID(), inputHash: "qa", userId: account.id, fileId: file.id, conversationId: conversation.id, action: "summary", client: "web", optionsJson: "{}", status: "succeeded", resultJson: JSON.stringify({ artifact: { id: artifact.id, content: "QA_PRIVATE_CONTENT" } }), availableAt: now, createdAt: now, updatedAt: now }).returning();
  return { account, conversation, file, artifact, quiz, job, resourceId };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function expectReads(f: Fixture, expected: number, native = false, account = f.account) {
  const token = native ? account.native : account.web;
  const tests: Array<[string, Promise<Response>]> = [
    ["conversation", conversationRoute.GET(request(`/api/ai/conversations/${f.conversation.id}`, token, undefined, native), params(f.conversation.id))],
    ["quiz", quizRoute.GET(request(`/api/ai/quizzes/${f.quiz.id}`, token, undefined, native), params(f.quiz.id))],
    ["artifact", artifactRoute.GET(request(`/api/ai/artifacts/${f.artifact.id}/download`, token, undefined, native), params(f.artifact.id))],
    ["job", jobRoute.GET(request(`/api/ai/jobs/${f.job.id}`, token, undefined, native), params(f.job.id))],
  ];
  for (const [name, result] of tests) { const response = await result; assert.equal(response.status, expected, `${name}: ${await response.text()}`); }
  const listed = await conversations.GET(request("/api/ai/conversations", token, undefined, native));
  if (expected === 401) assert.equal(listed.status, 401);
  else { assert.equal(listed.status, 200); const body = await listed.json(); assert.equal(body.conversations.some((c: { id: number }) => c.id === f.conversation.id), expected === 200); }
  if (expected !== 200 && expected !== 401) {
    const rejected = await attemptsRoute.POST(request(`/api/ai/quizzes/${f.quiz.id}/attempts`, token, { answers: [{ questionId: "q1", choiceIndex: 0 }] }, native), params(f.quiz.id));
    assert.equal(rejected.status, 404); assert.ok(!(await rejected.text()).includes("QA_PROTECTED_EXPLANATION"));
    const chat = await chatRoute.POST(request(`/api/ai/conversations/${f.conversation.id}/messages`, token, { text: "Quote the previous study result" }, native), params(f.conversation.id));
    assert.equal(chat.status, 404); assert.ok(!(await chat.text()).includes("QA_PRIVATE_CONTENT"));
  }
}
const options = { language: "العربية", targetLanguage: "العربية", questionCount: 5 };
async function clearCache(f: Fixture) { await db.delete(s.aiFileCache).where(eq(s.aiFileCache.scope, f.resourceId ? `resource:${f.resourceId}` : `user:${f.account.id}:file:${f.file.id}`)); }
async function outputCount(f: Fixture) { const result = await db.execute(sql`SELECT (SELECT count(*) FROM ai_artifacts WHERE file_id=${f.file.id}) + (SELECT count(*) FROM ai_quizzes WHERE file_id=${f.file.id}) + (SELECT count(*) FROM ai_messages WHERE file_id=${f.file.id}) AS total`); return Number(result.rows[0].total); }
async function action(f: Fixture, job?: { id: string; owner: string }) { return actions.runAiFileAction({ user: f.account, fileId: f.file.id, conversationId: f.conversation.id, action: "summary", options, requestId: `qa:${randomUUID()}`, client: "web", ...(job ? { job } : {}) }); }
async function race(f: Fixture, mutate: () => Promise<void>, code: string) {
  await new Promise(resolve => setTimeout(resolve, 300)); // Respect the real shared provider pacer between independent scenarios.
  await clearCache(f); const before = await outputCount(f); const calls = generationCalls;
  afterGeneration = mutate;
  await assert.rejects(action(f), error => (error as { code?: string }).code === code);
  assert.equal(generationCalls, calls + 1); assert.equal(await outputCount(f), before);
  const events = await db.select().from(s.aiUsageEvents).where(eq(s.aiUsageEvents.fileId, f.file.id));
  assert.ok(events.length && events.every(event => event.status === "succeeded"), "completed provider work is accounted even if publication is denied");
}
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url)); assert.equal(u.search, ""); assert.equal(init?.redirect, "error");
  if (u.hostname !== "generativelanguage.googleapis.com") {
    controlCalls++; assert.equal(init?.method, "GET"); assert.equal(new Headers(init?.headers).get("authorization"), "Bearer synthetic-output-proof");
    if (u.href === `https://cloudresourcemanager.googleapis.com/v3/projects/${projectNumber}`) return Response.json({ name: `projects/${projectNumber}`, projectId, state: "ACTIVE" });
    if (u.href === `https://apikeys.googleapis.com/v2/${keyResource}/keyString`) return Response.json({ keyString: process.env.GEMINI_API_KEY });
    if (u.href === `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`) return Response.json({ name: `projects/${projectId}/billingInfo`, projectId, billingEnabled: false, billingAccountName: "" });
    throw new Error("Unexpected control-plane request; no live network");
  }
  assert.equal(new Headers(init?.headers).get("x-goog-api-key"), process.env.GEMINI_API_KEY);
  assert.match(u.pathname, /^\/v1beta\/models\/[^/]+:(countTokens|generateContent)$/);
  const body = JSON.parse(String(init?.body));
  if (u.pathname.endsWith(":countTokens")) { const generation = { ...body.generateContentRequest }; delete generation.model; const key = JSON.stringify(generation); counted.set(key, (counted.get(key) || 0) + 1); countCalls++; return Response.json({ totalTokens: 40 }); }
  const key = JSON.stringify(body); assert.ok((counted.get(key) || 0) > 0); counted.set(key, counted.get(key)! - 1);
  assert.match(key, /Synthetic controlled study source/); generationCalls++;
  const hook = afterGeneration; afterGeneration = null; if (hook) await hook();
  return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Synthetic generated result: F = m * a." }] } }], usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 15 } });
};
try {
  const indexes = await db.execute(sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('ai_artifacts_conversation_owner_idx', 'ai_quizzes_conversation_owner_idx', 'ai_file_jobs_conversation_owner_idx')`);
  assert.equal(indexes.rows.length, 3);
  pass("migration 0042 supplies all three conversation/owner lookup indexes without rewriting result records");
  await policy("both");
  const a = await user("owner"), other = await user("other");
  const official = await fixture(a, true), privateFile = await fixture(a);
  await expectReads(official, 200); await expectReads(privateFile, 200, true);
  pass("actual web and native sessions read their authorized conversation, quiz, artifact, job and history");
  await expectReads(official, 404, false, other); await expectReads(privateFile, 404, true, other);
  pass("all derived-output routes and quoted chat history reject another owner");
  await db.update(s.users).set({ email: `qa-changed-${nonce}@example.test` }).where(eq(s.users.id, a.id));
  await db.update(s.users).set({ email: a.email }).where(eq(s.users.id, other.id));
  await expectReads(official, 200); await expectReads(official, 404, false, other);
  pass("reusing the original email cannot inherit study results or course authorization");
  for (const [label, set] of [["revoked", { revokedAt: now }], ["suspended", { suspendedAt: now }], ["expired", { expiresAt: "2000-01-01T00:00:00.000Z" }]] as const) {
    await db.update(s.courseAccess).set(set).where(and(eq(s.courseAccess.userId, a.id), eq(s.courseAccess.courseSlug, "qa-physics")));
    await expectReads(official, 404, label === "suspended");
    await db.update(s.courseAccess).set({ revokedAt: null, suspendedAt: null, expiresAt: null }).where(eq(s.courseAccess.userId, a.id));
  }
  pass("revocation, suspension and expiration deny cached results, downloads, grading, previews and chat re-use");
  for (const set of [{ studentVisible: false }, { status: "archived" }, { scanStatus: "quarantined" }]) {
    await db.update(s.courseResources).set(set).where(eq(s.courseResources.id, official.resourceId!)); await expectReads(official, 404);
    await db.update(s.courseResources).set({ studentVisible: true, status: "active", scanStatus: "clean" }).where(eq(s.courseResources.id, official.resourceId!));
  }
  pass("hidden, withdrawn and quarantined official sources block every derived-output surface");
  await db.update(s.aiFiles).set({ scanStatus: "quarantined", status: "quarantined" }).where(eq(s.aiFiles.id, privateFile.file.id));
  await expectReads(privateFile, 404, true);
  await db.update(s.aiFiles).set({ scanStatus: "clean", status: "ready" }).where(eq(s.aiFiles.id, privateFile.file.id));
  pass("quarantining a private upload also revokes its already-completed outputs");
  await policy("app_only"); await expectReads(official, 404); await expectReads(official, 200, true); await expectReads(privateFile, 200);
  await policy("web_only"); await expectReads(official, 404, true); await expectReads(official, 200); await policy("both");
  pass("channel policy is enforced for official results in both clients without restricting private uploads");
  const [pendingConversation] = await db.insert(s.aiConversations).values({ userId: a.id, title: "Pending upload, no generated content" }).returning();
  await db.insert(s.aiFiles).values({ userId: a.id, conversationId: pendingConversation.id, objectKey: `qa-study-output/${nonce}/pending.txt`, originalName: "pending.txt", sizeBytes: 2, contentType: "text/plain", status: "pending_scan", scanStatus: "pending" });
  const pendingResponse = await conversationRoute.GET(request(`/api/ai/conversations/${pendingConversation.id}`, a.web), params(pendingConversation.id));
  assert.equal(pendingResponse.status, 200); assert.equal((await pendingResponse.json()).files[0].scanStatus, "pending");
  pass("pending uploads without derived output remain visible so the scanner UI can continue polling");
  const [orphan] = await db.insert(s.aiConversations).values({ userId: a.id, title: "Quoted orphan content" }).returning();
  await db.insert(s.aiMessages).values([{ userId: a.id, conversationId: orphan.id, role: "assistant", service: "summary", content: "QA_PRIVATE_CONTENT", fileId: null }, { userId: a.id, conversationId: orphan.id, role: "assistant", service: "chat", content: "Quoted QA_PRIVATE_CONTENT" }]);
  assert.equal((await conversationRoute.GET(request(`/api/ai/conversations/${orphan.id}`, a.web), params(orphan.id))).status, 404);
  const [old] = await db.insert(s.aiConversations).values({ userId: a.id, title: "Old reference outside the message page" }).returning();
  await db.insert(s.aiMessages).values(Array.from({ length: 510 }, (_, i) => ({ userId: a.id, conversationId: old.id, role: "user", service: "chat", content: `Synthetic filler ${i}` })));
  await db.insert(s.aiMessages).values({ userId: a.id, conversationId: old.id, role: "assistant", service: "summary", content: "QA_PRIVATE_CONTENT", fileId: official.file.id });
  await db.update(s.courseResources).set({ studentVisible: false }).where(eq(s.courseResources.id, official.resourceId!));
  assert.equal((await conversationRoute.GET(request(`/api/ai/conversations/${old.id}`, a.web), params(old.id))).status, 404);
  const history = await (await conversations.GET(request("/api/ai/conversations", a.web))).json();
  assert.ok(history.conversations.every((c: { id: number }) => ![old.id, orphan.id, official.conversation.id].includes(c.id)));
  await db.update(s.courseResources).set({ studentVisible: true }).where(eq(s.courseResources.id, official.resourceId!));
  pass("SQL checks precede pagination and deny deleted-source quotations and references beyond 500 messages");
  const beforeAttempts = (await db.select().from(s.aiQuizAttempts).where(eq(s.aiQuizAttempts.quizId, official.quiz.id))).length;
  for (const answers of [null, [{ questionId: "unknown", choiceIndex: 0 }], [{ questionId: "q1", choiceIndex: "0" }], [{ questionId: "q1", choiceIndex: 0 }, { questionId: "q1", choiceIndex: 1 }]]) {
    const response = await attemptsRoute.POST(request(`/api/ai/quizzes/${official.quiz.id}/attempts`, a.web, { answers }), params(official.quiz.id)); assert.equal(response.status, 400);
  }
  assert.equal((await attemptsRoute.POST(request(`/api/ai/quizzes/${official.quiz.id}/attempts`, a.web, { answers: [], extra: "x".repeat(20_000) }), params(official.quiz.id))).status, 413);
  const grading = await attemptsRoute.POST(request(`/api/ai/quizzes/${official.quiz.id}/attempts`, a.web, { answers: [{ questionId: "q1", choiceIndex: 0 }] }), params(official.quiz.id));
  assert.equal(grading.status, 201); assert.equal((await grading.json()).attempt.score, 1);
  assert.equal((await db.select().from(s.aiQuizAttempts).where(eq(s.aiQuizAttempts.quizId, official.quiz.id))).length, beforeAttempts + 1);
  pass("real grading rejects oversized, duplicated, unknown and coerced answers; first choice zero grades correctly");
  const body = new ReadableStream<Uint8Array>({ async pull(controller) { await db.update(s.courseResources).set({ studentVisible: false }).where(eq(s.courseResources.id, official.resourceId!)); controller.enqueue(new TextEncoder().encode(JSON.stringify({ answers: [{ questionId: "q1", choiceIndex: 0 }] }))); controller.close(); } }, { highWaterMark: 0 });
  const delayed = new Request(origin + `/api/ai/quizzes/${official.quiz.id}/attempts`, { method: "POST", headers: request("/", a.web, {}).headers, body, duplex: "half" } as RequestInit);
  const late = await attemptsRoute.POST(delayed, params(official.quiz.id)); assert.equal(late.status, 409); assert.ok(!(await late.text()).includes("QA_PROTECTED_EXPLANATION"));
  assert.equal((await db.select().from(s.aiQuizAttempts).where(eq(s.aiQuizAttempts.quizId, official.quiz.id))).length, beforeAttempts + 1);
  await db.update(s.courseResources).set({ studentVisible: true }).where(eq(s.courseResources.id, official.resourceId!));
  pass("revocation during request streaming is rechecked atomically at attempt insertion with no answer disclosure");
  assert.equal((await quizRoute.GET(request("/api/ai/quizzes/1.5", a.web), params("1.5"))).status, 400);
  assert.equal((await conversationRoute.GET(request("/api/ai/conversations/1.5", a.web), params("1.5"))).status, 400);
  pass("fractional identifiers never round down to another stored record");
  const settings = await aiPlatform.getAiServiceSettings();
  await verification.refreshGeminiProject({ projectNumber, projectId, keys: [{ resource: keyResource, fingerprint: keys.aiKeyFingerprint(process.env.GEMINI_API_KEY!) }], models: [{ model: settings.summary.model, rpm: 40, tpm: 500000, rpd: 200, concurrent: 2, inputTokens: 20000, outputTokens: settings.summary.maxOutputTokens }] }, "synthetic-output-proof");
  await race(privateFile, async () => { await db.update(s.aiFiles).set({ scanStatus: "quarantined" }).where(eq(s.aiFiles.id, privateFile.file.id)); }, "AI_FILE_NOT_READY");
  await db.update(s.aiFiles).set({ scanStatus: "clean" }).where(eq(s.aiFiles.id, privateFile.file.id));
  await race(official, async () => { await db.update(s.courseResources).set({ studentVisible: false }).where(eq(s.courseResources.id, official.resourceId!)); }, "AI_SOURCE_UNAVAILABLE");
  await db.update(s.courseResources).set({ studentVisible: true }).where(eq(s.courseResources.id, official.resourceId!));
  await race(official, async () => { await db.update(s.courseAccess).set({ revokedAt: now }).where(eq(s.courseAccess.userId, a.id)); }, "AI_SOURCE_ACCESS");
  await db.update(s.courseAccess).set({ revokedAt: null }).where(eq(s.courseAccess.userId, a.id));
  pass("real provider/publication boundaries reject quarantine, withdrawal and entitlement revocation after generation");
  await race(privateFile, async () => { await db.update(s.aiFiles).set({ scanSha256: "f".repeat(64) }).where(eq(s.aiFiles.id, privateFile.file.id)); }, "AI_SOURCE_CHANGED");
  await db.update(s.aiFiles).set({ scanSha256: privateFile.file.scanSha256 }).where(eq(s.aiFiles.id, privateFile.file.id));
  await race(privateFile, async () => { await db.update(s.aiConversations).set({ status: "archived" }).where(eq(s.aiConversations.id, privateFile.conversation.id)); }, "AI_SOURCE_ACCESS");
  await db.update(s.aiConversations).set({ status: "active" }).where(eq(s.aiConversations.id, privateFile.conversation.id));
  await race(privateFile, async () => { await db.update(s.users).set({ status: "blocked" }).where(eq(s.users.id, a.id)); }, "AI_SOURCE_ACCESS");
  await db.update(s.users).set({ status: "active" }).where(eq(s.users.id, a.id));
  pass("source-version change, archived conversation and blocked account cannot publish an in-flight result");
  const beforeLease = await outputCount(privateFile); const generationBeforeLease = generationCalls;
  await db.update(s.aiFileJobs).set({ status: "processing", leaseOwner: "synthetic-current-owner", leaseUntil: "2000-01-01T00:00:00.000Z" }).where(eq(s.aiFileJobs.id, privateFile.job.id));
  await assert.rejects(action(privateFile, { id: privateFile.job.id, owner: "synthetic-current-owner" }), error => (error as { code?: string }).code === "AI_JOB_LEASE_LOST");
  assert.equal(await outputCount(privateFile), beforeLease); assert.equal(generationCalls, generationBeforeLease);
  pass("expired execution lease cannot publish a cached result even with the correct stale owner token");
  const lock = await getPool().connect(); let pending: Promise<unknown> | null = null;
  try {
    await lock.query("BEGIN"); await lock.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [a.id]);
    const before = await outputCount(privateFile); const calls = generationCalls;
    pending = assert.rejects(action(privateFile), error => (error as { code?: string }).code === "AI_FILE_NOT_READY");
    let waiting = false;
    for (let i = 0; i < 60; i++) { const rows = await db.execute(sql`SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%"users"%for share%'`); if (rows.rows.length) { waiting = true; break; } await new Promise(resolve => setTimeout(resolve, 20)); }
    assert.equal(waiting, true, "publisher must actually block on the owner row, not pass a timing-only test");
    await lock.query("UPDATE ai_files SET scan_status='quarantined' WHERE id=$1", [privateFile.file.id]); await lock.query("COMMIT");
    await pending; pending = null; assert.equal(await outputCount(privateFile), before); assert.equal(generationCalls, calls);
  } finally { await lock.query("ROLLBACK").catch(() => undefined); lock.release(); await pending; }
  await db.update(s.aiFiles).set({ scanStatus: "clean" }).where(eq(s.aiFiles.id, privateFile.file.id));
  pass("real PostgreSQL lock contention forces a cache publisher to re-read source authorization after waiting");
  await new Promise(resolve => setTimeout(resolve, 300));
  const beforeChat = (await db.select().from(s.aiMessages).where(and(eq(s.aiMessages.conversationId, official.conversation.id), eq(s.aiMessages.role, "assistant")))).length;
  afterGeneration = async () => { await db.update(s.courseResources).set({ studentVisible: false }).where(eq(s.courseResources.id, official.resourceId!)); };
  const chat = await chatRoute.POST(request(`/api/ai/conversations/${official.conversation.id}/messages`, a.web, { text: "Explain the Synthetic controlled study source from earlier" }), params(official.conversation.id));
  assert.equal(chat.status, 403); assert.equal((await chat.json()).code, "AI_SOURCE_ACCESS");
  assert.equal((await db.select().from(s.aiMessages).where(and(eq(s.aiMessages.conversationId, official.conversation.id), eq(s.aiMessages.role, "assistant")))).length, beforeChat);
  await db.update(s.courseResources).set({ studentVisible: true }).where(eq(s.courseResources.id, official.resourceId!));
  pass("legacy chat also rechecks source authorization after generation and does not publish a revoked quotation");
  await new Promise(resolve => setTimeout(resolve, 300));
  afterGeneration = async () => { await db.update(s.courseAccess).set({ expiresAt: new Date(Date.now() + 80).toISOString() }).where(eq(s.courseAccess.userId, a.id)); await new Promise(resolve => setTimeout(resolve, 130)); };
  const expiredChat = await chatRoute.POST(request(`/api/ai/conversations/${official.conversation.id}/messages`, a.web, { text: "Re-explain the Synthetic controlled study source" }), params(official.conversation.id));
  assert.equal(expiredChat.status, 403); assert.equal((await expiredChat.json()).code, "AI_SOURCE_ACCESS");
  await db.update(s.courseAccess).set({ expiresAt: null }).where(eq(s.courseAccess.userId, a.id));
  pass("SQL authorization uses the database clock rather than a timestamp captured before a slow provider response");
  const savedVersion = privateFile.file.scanSha256;
  await clearCache(privateFile);
  const changed = Buffer.from(sourceBytes); changed[0] = changed[0] === 88 ? 89 : 88;
  await storage.putObject(privateFile.file.objectKey, new Response(changed).body!, "text/plain", "local");
  const beforeCorrupt = generationCalls + countCalls;
  await assert.rejects(action(privateFile), error => (error as { code?: string }).code === "AI_FILE_INTEGRITY");
  assert.equal(generationCalls + countCalls, beforeCorrupt); assert.equal(privateFile.file.scanSha256, savedVersion);
  pass("same-size replacement of actual local source bytes fails before token counting or generation");
  assert.equal(generationCalls, countCalls); assert.equal(controlCalls, 3); assert.ok([...counted.values()].every(value => value === 0));
  const report = { passed: checks.length, checks, generationCalls, countCalls, controlCalls, environment: "isolated loopback PostgreSQL and actual local files", provider: "synthetic transport, no live Google requests", paidCalls: 0, productionChanges: 0 };
  writeFileSync(".data/qa-study-output-access-report.json", JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} catch (error) { console.error("Study acceptance failed", error); throw error; } finally {
  globalThis.fetch = savedFetch;
  await db.execute(sql`DELETE FROM gemini_project_reservations WHERE project_number=${projectNumber}`);
  await db.execute(sql`DELETE FROM gemini_project_keys WHERE project_number=${projectNumber}`);
  await db.execute(sql`DELETE FROM gemini_project_limits WHERE project_number=${projectNumber}`);
  await db.execute(sql`DELETE FROM gemini_projects WHERE project_number=${projectNumber}`);
  if (priorPolicy) await db.insert(s.platformSettings).values(priorPolicy).onConflictDoUpdate({ target: s.platformSettings.key, set: { value: priorPolicy.value } });
  else await db.delete(s.platformSettings).where(eq(s.platformSettings.key, "content_view_mode"));
  for (const id of userIds) for (const fileId of fileIds) await db.delete(s.aiFileCache).where(eq(s.aiFileCache.scope, `user:${id}:file:${fileId}`));
  if (resourceIds.length) { for (const id of resourceIds) await db.delete(s.aiFileCache).where(eq(s.aiFileCache.scope, `resource:${id}`)); }
  if (userIds.length) { await db.delete(s.courseAccess).where(inArray(s.courseAccess.userId, userIds)); await db.delete(s.users).where(inArray(s.users.id, userIds)); }
  if (resourceIds.length) await db.delete(s.courseResources).where(inArray(s.courseResources.id, resourceIds));
  for (const object of objects) await storage.deleteObject(object, "local");
  await closeDb();
}
