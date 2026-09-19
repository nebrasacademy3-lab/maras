/** Synthetic local integration check. Never connects to a production database or AI provider. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";

const local = JSON.parse(readFileSync(".data/qa-database.json", "utf8")) as { url: string };
const parsed = new URL(local.url);
if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || parsed.pathname !== "/maras_qa") throw new Error("Synthetic loopback maras_qa database required");
if (process.env.DATABASE_URL && process.env.DATABASE_URL !== local.url) throw new Error("Refusing a different database");
for (const name of ["S3_BUCKET", "BUCKET", "GEMINI_API_KEY", "GEMINI_API_KEYS", "GEMINI_FREE_API_KEY", "GEMINI_FREE_API_KEYS", "GEMINI_PAID_API_KEY", "GEMINI_PAID_API_KEYS", "GOOGLE_API_KEY", "GEMINI_CONTROL_PLANE_ACCESS_TOKEN", "RAILWAY_PROJECT_ID", "RESEND_API_KEY", "TAP_SECRET_KEY"]) if (process.env[name]) throw new Error("Run with no live configuration");
Object.assign(process.env, { DATABASE_URL: local.url, DATABASE_SSL: "false", UPLOAD_DIR: `${process.cwd()}/.data/uploads`, AI_PROVIDER_MIN_INTERVAL_MS: "250", AI_PROVIDER_MAX_CONCURRENT: "2", AI_WORKER_MAX_ACTIVE: "2", GEMINI_API_KEY: "AIza" + "synthetic_not_real_".repeat(2) });
const { getDb, closeDb } = await import("../db/index");
const schema = await import("../db/schema");
const { createStudyDocx } = await import("../lib/study-export");
const { DOCX_MIME } = await import("../lib/study-document");
const { putObject } = await import("../lib/storage");
const { resolveAiSource } = await import("../lib/ai-course-source");
const { enqueueAiFileJob, runAiFileJobOnce, fileJobPayload } = await import("../lib/ai-file-jobs");
const { acquireAiWorkLease } = await import("../lib/ai-work-control");
const { aiKeyFingerprint } = await import("../lib/ai-keys");
const { getAiServiceSettings } = await import("../lib/ai-platform");
const { refreshGeminiProject } = await import("../lib/gemini-project-verification");
const { requestGemini } = await import("../lib/gemini-provider");
const db = getDb();
const fixtures = JSON.parse(readFileSync(".data/qa-fixtures.json", "utf8")) as { users: Array<{ id: number; email: string; role: string }>; [key: string]: unknown };
const a = fixtures.users.find(user => user.role === "student-a")!, b = fixtures.users.find(user => user.role === "student-b")!;
const nonce = randomUUID(), now = new Date().toISOString();
const bytes = createStudyDocx({ title: "محاضرة فيزياء اصطناعية للاختبار", sourceName: "مرجع اصطناعي", createdAt: now, content: "# قوانين نيوتن\nالقوة تساوي الكتلة مضروبة بالتسارع. الطاقة محفوظة في النظام المعزول. هذه مادة اصطناعية لاختبارات البرمجيات فقط." });
writeFileSync(".data/qa-study-export.docx", bytes);
const objectKey = `qa-study/${nonce}/lecture.docx`;
await putObject(objectKey, new Response(new Uint8Array(bytes)).body!, DOCX_MIME, "local");
const projectNumber = "9" + String(Date.now());
const projectId = "maras-study-qa-" + nonce.slice(0, 8);
const keyResource = `projects/${projectNumber}/locations/global/keys/study-qa`;
const settings = await getAiServiceSettings();
const plan = { projectNumber, projectId, keys: [{ resource: keyResource, fingerprint: aiKeyFingerprint(process.env.GEMINI_API_KEY!) }], models: [...new Set([settings.summary.model, settings.quiz.model])].map(model => ({ model, rpm: 20, tpm: 200000, rpd: 100, concurrent: 2, inputTokens: 20000, outputTokens: Math.max(settings.summary.maxOutputTokens, settings.quiz.maxOutputTokens) })) };
let providerCalls = 0, tokenCountCalls = 0, controlPlaneCalls = 0;
const countedRequests = new Map<string, number>();
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const target = new URL(String(url));
  assert.equal(target.search, "");
  assert.equal(init?.redirect, "error");
  if (target.hostname !== "generativelanguage.googleapis.com") {
    assert.equal(init?.method, "GET");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer synthetic-study-proof-token");
    controlPlaneCalls++;
    if (target.href === `https://cloudresourcemanager.googleapis.com/v3/projects/${projectNumber}`) return Response.json({ name: `projects/${projectNumber}`, projectId, state: "ACTIVE" });
    if (target.href === `https://apikeys.googleapis.com/v2/${keyResource}/keyString`) return Response.json({ keyString: process.env.GEMINI_API_KEY });
    if (target.href === `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`) return Response.json({ name: `projects/${projectId}/billingInfo`, projectId, billingEnabled: false, billingAccountName: "" });
    throw new Error("Unexpected synthetic control-plane endpoint; live network prohibited");
  }
  assert.match(target.pathname, /^\/v1beta\/models\/[^/]+:(countTokens|generateContent)$/);
  assert.equal(init?.method, "POST");
  assert.equal(new Headers(init?.headers).get("x-goog-api-key"), process.env.GEMINI_API_KEY);
  const body = JSON.parse(String(init?.body));
  const counting = target.pathname.endsWith(":countTokens");
  const request = counting ? { ...body.generateContentRequest } : body;
  if (counting) { assert.equal(request.model, "models/" + target.pathname.split("/").at(-1)!.split(":")[0]); delete request.model; }
  assert.match(JSON.stringify(request.contents), /قوانين نيوتن/);
  assert.ok(!JSON.stringify(request.contents).includes("inlineData"), "Office text is extracted before provider call");
  const snapshot = JSON.stringify(request);
  if (counting) {
    tokenCountCalls++;
    countedRequests.set(snapshot, (countedRequests.get(snapshot) || 0) + 1);
    return Response.json({ totalTokens: 20 });
  }
  assert.ok((countedRequests.get(snapshot) || 0) > 0, "generation must match an unconsumed counted request exactly");
  countedRequests.set(snapshot, countedRequests.get(snapshot)! - 1);
  providerCalls++;
  await new Promise(resolve => setTimeout(resolve, 50));
  const structured = request.generationConfig.responseMimeType === "application/json";
  assert.equal(request.generationConfig.responseSchema, undefined, "JSON Schema must not use the OpenAPI schema field");
  if (structured) {
    assert.equal(request.generationConfig.responseJsonSchema?.type, "object");
    assert.equal(request.generationConfig.responseJsonSchema?.properties?.questions?.type, "array");
  } else assert.equal(request.generationConfig.responseJsonSchema, undefined);
  const text = structured ? JSON.stringify({ title: "اختبار اصطناعي", questions: Array.from({ length: 5 }, (_, i) => ({ question: `سؤال اصطناعي ${i + 1}`, choices: ["أ", "ب", "ج", "د"], correctIndex: 0, explanation: "شرح اصطناعي صحيح بالنسبة للاختبار البرمجي فقط.", translatedExplanation: null, scientificTerms: [] })) }) : "# نتيجة اختبار اصطناعية\nالقوة تساوي الكتلة مضروبة بالتسارع.";
  return Response.json({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 20 } });
};
const successes: string[] = [];
try {
  await assert.rejects(requestGemini({ apiKey: process.env.GEMINI_API_KEY!, model: plan.models[0].model, generation: { contents: [{ role: "user", parts: [{ text: "Synthetic guard test" }] }], generationConfig: { maxOutputTokens: 128 } } }), error => (error as { code: string }).code === "AI_PROJECT_UNVERIFIED");
  assert.equal(providerCalls + tokenCountCalls + controlPlaneCalls, 0);
  successes.push("unverified study key fails before any external transport");
  await refreshGeminiProject(plan, "synthetic-study-proof-token");
  assert.equal(controlPlaneCalls, 3);
  successes.push("study fixture obtains project, key and billing proof through the real verifier with synthetic transport");
  for (const [index, user] of [a, b].entries()) await db.update(schema.users).set({ phone: `+96650000000${index + 1}` }).where(eq(schema.users.id, user.id));
  await db.execute(sql`UPDATE lessons SET video_asset_id=(SELECT id FROM video_assets WHERE lesson_id=lessons.id LIMIT 1) WHERE course_slug IN ('qa-physics','qa-math')`);
  const [resource] = await db.insert(schema.courseResources).values({ courseSlug: "qa-physics", lessonId: "qa-physics-lesson", title: "ملف الدرس الاصطناعي", objectKey, originalName: "lecture.docx", contentType: DOCX_MIME, sizeBytes: bytes.length, studentVisible: true, status: "active", scanStatus: "clean", scannedAt: now, scanSha256: createHash("sha256").update(bytes).digest("hex") }).returning();
  for (const user of [a, b]) await db.insert(schema.courseAccess).values({ userId: user.id, userEmail: user.email, courseSlug: "qa-physics", startsAt: now }).onConflictDoUpdate({ target: [schema.courseAccess.userId, schema.courseAccess.courseSlug], set: { revokedAt: null, suspendedAt: null, expiresAt: null } });
  const refs: Array<Parameters<typeof enqueueAiFileJob>[0]> = [];
  for (const user of [a, b]) {
    const [conversation] = await db.insert(schema.aiConversations).values({ userId: user.id, title: "اختبار اصطناعي" }).returning();
    const [file] = await db.insert(schema.aiFiles).values({ userId: user.id, conversationId: conversation.id, sourceResourceId: resource.id, objectKey: `ai-linked/${user.id}/${resource.id}`, storageProvider: "course-resource", originalName: "lecture.docx", contentType: DOCX_MIME, sizeBytes: bytes.length, status: "ready", scanStatus: "clean" }).returning();
    refs.push({ user, file, conversationId: conversation.id, action: "summary" as const, options: { language: "العربية", targetLanguage: "العربية", questionCount: 5 }, requestId: `qa:${nonce}:${user.id}`, client: "web" as const });
  }
  await assert.rejects(resolveAiSource(refs[0].file, b, "web"), error => (error as { status: number }).status === 404);
  const results = await Promise.all(Array.from({ length: 12 }, () => enqueueAiFileJob(refs[0])));
  assert.equal(new Set(results.map(job => job.id)).size, 1); successes.push("12 duplicate concurrent submissions create exactly one job");
  await assert.rejects(enqueueAiFileJob({ ...refs[0], action: "quiz" }), error => (error as { code: string }).code === "AI_REQUEST_CONFLICT");
  const second = await enqueueAiFileJob(refs[1]);
  for (let round = 0; round < 8; round++) {
    await Promise.all(Array.from({ length: 12 }, () => runAiFileJobOnce()));
    await db.execute(sql`UPDATE ai_file_jobs SET available_at=${new Date().toISOString()} WHERE id IN (${results[0].id}, ${second.id}) AND status='queued'`);
    const jobs = await db.select().from(schema.aiFileJobs).where(sql`id IN (${results[0].id}, ${second.id})`);
    if (jobs.every(job => job.status === "succeeded")) break;
    await new Promise(resolve => setTimeout(resolve, 270));
  }
  const [ja] = await db.select().from(schema.aiFileJobs).where(eq(schema.aiFileJobs.id, results[0].id));
  const [jb] = await db.select().from(schema.aiFileJobs).where(eq(schema.aiFileJobs.id, second.id));
  assert.equal(ja.status, "succeeded", ja.errorMessage || "first job"); assert.equal(jb.status, "succeeded", jb.errorMessage || "second job");
  assert.equal(providerCalls, 1); assert.equal(tokenCountCalls, 1); successes.push("concurrent enrolled users reuse one official-source generation");
  const pa = fileJobPayload(ja) as unknown as { result: { artifact: { id: number }; cached: boolean } }, pb = fileJobPayload(jb) as unknown as typeof pa;
  assert.notEqual(pa.result.artifact.id, pb.result.artifact.id); assert.ok(pa.result.cached || pb.result.cached); successes.push("shared cache yields separate privately owned outputs");
  const usage = await db.select().from(schema.aiUsageEvents).where(sql`file_id IN (${refs[0].file.id}, ${refs[1].file.id}) AND status='succeeded'`);
  assert.equal(usage.length, 1); successes.push("cache hit consumes no additional provider call or monthly quota");
  await db.update(schema.courseAccess).set({ revokedAt: now }).where(eq(schema.courseAccess.userId, b.id));
  await assert.rejects(resolveAiSource(refs[1].file, b, "web"), error => (error as { status: number }).status === 403);
  await assert.rejects(enqueueAiFileJob({ ...refs[1], requestId: randomUUID() }), error => (error as { status: number }).status === 403); successes.push("revoked subscriptions cannot use previously linked sources or cached content");
  await db.update(schema.courseAccess).set({ revokedAt: null }).where(eq(schema.courseAccess.userId, b.id));
  await db.execute(sql`DELETE FROM ai_work_leases WHERE key='provider:pace'`);
  const quiz = await enqueueAiFileJob({ ...refs[0], action: "quiz", requestId: randomUUID() });
  await runAiFileJobOnce();
  const [quizJob] = await db.select().from(schema.aiFileJobs).where(eq(schema.aiFileJobs.id, quiz.id));
  assert.equal(quizJob.status, "succeeded", quizJob.errorMessage || "quiz job");
  const quizPayload = JSON.parse(quizJob.resultJson!);
  assert.equal(quizPayload.quiz.questions.length, 5);
  assert.ok(quizPayload.quiz.questions.every((q: Record<string, unknown>) => !("correctIndex" in q))); successes.push("quiz worker validates and stores answers but does not expose them before submission");
  const leaseKey = `qa-fence:${nonce}`, release = await acquireAiWorkLease(leaseKey);
  assert.ok(release); assert.equal(await acquireAiWorkLease(leaseKey), null);
  await db.update(schema.aiWorkLeases).set({ expiresAt: "2000-01-01T00:00:00.000Z" }).where(eq(schema.aiWorkLeases.key, leaseKey));
  const successor = await acquireAiWorkLease(leaseKey); assert.ok(successor); await release();
  assert.equal(await acquireAiWorkLease(leaseKey), null); await successor(); successes.push("expired leases are recoverable and old workers cannot release their successor's lock");
  assert.equal(providerCalls, 2); assert.equal(tokenCountCalls, 2);
  assert.ok([...countedRequests.values()].every(count => count === 0));
  const reservations = await db.execute(sql`SELECT state FROM gemini_project_reservations WHERE project_number = ${projectNumber}`);
  assert.equal(reservations.rows.length, 2); assert.ok(reservations.rows.every(row => row.state === "settled"));
  successes.push("summary and quiz each count the exact generation once, settle their project reservations and never charge cache hits");
  fixtures.study = { resourceId: resource.id, fileId: refs[0].file.id, jobId: ja.id, artifactId: pa.result.artifact.id, quizId: quizPayload.quiz.id };
  writeFileSync(".data/qa-fixtures.json", JSON.stringify(fixtures));
  console.log(JSON.stringify({ passed: successes.length, checks: successes, provider: "synthetic in-process stub; no live Gemini call", providerCalls, tokenCountCalls, controlPlaneCalls, database: "isolated loopback PostgreSQL", capacityClaim: "none" }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  await db.execute(sql`DELETE FROM gemini_project_reservations WHERE project_number = ${projectNumber}`);
  await db.execute(sql`DELETE FROM gemini_project_keys WHERE project_number = ${projectNumber}`);
  await db.execute(sql`DELETE FROM gemini_project_limits WHERE project_number = ${projectNumber}`);
  await db.execute(sql`DELETE FROM gemini_projects WHERE project_number = ${projectNumber}`);
  await closeDb();
}
