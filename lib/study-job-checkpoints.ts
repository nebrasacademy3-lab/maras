import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiConversations, aiFileCache, aiFileJobs, aiFiles, users } from "@/db/schema";
import { studyJobAttempts, studyJobParts, studyJobPlans } from "@/db/study-processing-schema";
import { resolveAiSource } from "@/lib/ai-course-source";
import { AiPlatformError } from "@/lib/ai-platform";
import { AiBusyError } from "@/lib/ai-work-control";
import { GeminiProviderError } from "@/lib/gemini-errors";
import type { GeminiResult } from "@/lib/gemini";
import type { FileActionInput } from "@/lib/ai-file-actions";
import { assertStudyCoverage, checkedStudyJson, splitStudyPart, studyHash, StudyPlanError, studySourceFingerprint, type StudyPartInput, type StudyPlan } from "@/lib/study-processing-plan";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
export type StudyProgress = { phase: string; totalUnits: number; completedUnits: number; totalParts: number; completedParts: number; percent: number };
export type SavedStudyPart = typeof studyJobParts.$inferSelect;
/** Lock in the same order as final publication. No provider call occurs inside this transaction. */
export async function fencedStudyJob(tx: Tx, input: FileActionInput) {
  if (!input.job) throw new AiBusyError(5, "AI_JOB_LEASE_LOST");
  const [user] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, input.user.id), eq(users.status, "active"))).limit(1).for("share");
  const [conversation] = await tx.select({ id: aiConversations.id }).from(aiConversations).where(and(eq(aiConversations.id, input.conversationId), eq(aiConversations.userId, input.user.id), eq(aiConversations.status, "active"))).limit(1).for("share");
  const [file] = await tx.select().from(aiFiles).where(and(eq(aiFiles.id, input.fileId), eq(aiFiles.userId, input.user.id))).limit(1).for("share");
  if (!user || !conversation || !file) throw new AiPlatformError("AI_SOURCE_ACCESS", "لم يعد الحساب أو المصدر متاحًا للمعالجة.", 403);
  const source = await resolveAiSource(file, input.user, input.client, tx, true);
  const [job] = await tx.select().from(aiFileJobs).where(and(eq(aiFileJobs.id, input.job.id), eq(aiFileJobs.leaseOwner, input.job.owner), eq(aiFileJobs.status, "processing"), sql`${aiFileJobs.leaseUntil}::timestamptz > clock_timestamp()`)).limit(1).for("update");
  if (!job || job.processingVersion !== 2 || job.userId !== input.user.id || job.fileId !== input.fileId || job.conversationId !== input.conversationId || job.action !== input.action) throw new AiBusyError(5, "AI_JOB_LEASE_LOST");
  if (job.sourceFingerprint !== studySourceFingerprint(source)) throw new AiPlatformError("AI_SOURCE_CHANGED", "تغيّر المصدر منذ قبول الطلب؛ لم نخلط إصدارين.", 409);
  return { job, file, conversation, source };
}
export async function loadStudyPlan(jobId: string, database: Pick<Tx, "select"> = getDb()) {
  const [row] = await database.select().from(studyJobPlans).where(eq(studyJobPlans.jobId, jobId)).limit(1);
  if (!row) return null;
  const plan = checkedStudyJson<StudyPlan>(row.planJson, row.sha256);
  if (plan.version !== 1 || !Array.isArray(plan.sourceUnits) || !plan.sourceUnits.length) throw new StudyPlanError("AI_PLAN_INVALID", "نسخة خطة المعالجة غير مدعومة.");
  return plan;
}
export async function loadStudyParts(jobId: string, database: Pick<Tx, "select"> = getDb()) {
  return database.select().from(studyJobParts).where(and(eq(studyJobParts.jobId, jobId), ne(studyJobParts.status, "superseded"))).orderBy(asc(studyJobParts.partId));
}
export async function updateStudyProgress(tx: Tx, jobId: string, phase?: string) {
  const plan = await loadStudyPlan(jobId, tx);
  if (!plan) throw new StudyPlanError("AI_PLAN_INVALID", "خطة المعالجة غير موجودة.");
  const parts = await loadStudyParts(jobId, tx), inputs = parts.map(part => checkedStudyJson<StudyPartInput>(part.inputJson, part.inputSha256));
  assertStudyCoverage(plan.sourceUnits, inputs);
  const completedParts = parts.filter(part => part.status === "committed").length;
  const completedUnits = parts.reduce((sum, part, index) => sum + (part.status === "committed" ? inputs[index].units.length : 0), 0);
  const progress: StudyProgress = { phase: phase || (completedParts === parts.length ? "assembling" : "processing"), totalUnits: plan.sourceUnits.length, completedUnits, totalParts: parts.length, completedParts, percent: Math.min(99, Math.floor(completedUnits / plan.sourceUnits.length * 100)) };
  await tx.update(aiFileJobs).set({ progressJson: JSON.stringify(progress), updatedAt: new Date().toISOString() }).where(eq(aiFileJobs.id, jobId));
  return progress;
}
export async function saveStudyPlan(input: FileActionInput, plan: StudyPlan, parts: StudyPartInput[]) {
  assertStudyCoverage(plan.sourceUnits, parts);
  if (parts.length > 2048) throw new StudyPlanError("AI_DOCUMENT_PLAN_LIMIT", "تجاوز عدد أجزاء المعالجة الحد الآمن.");
  return getDb().transaction(async tx => {
    const { job } = await fencedStudyJob(tx, input);
    const existing = await loadStudyPlan(job.id, tx);
    if (existing) { if (studyHash(existing) !== studyHash(plan)) throw new StudyPlanError("AI_PLAN_CHANGED", "تغيّرت خطة قائمة؛ لا يمكن استبدالها بصمت."); return existing; }
    const planJson = JSON.stringify(plan), now = new Date().toISOString();
    await tx.insert(studyJobPlans).values({ jobId: job.id, planJson, sha256: studyHash(planJson), createdAt: now });
    const rows = parts.map((part, index) => { const inputJson = JSON.stringify(part); return { jobId: job.id, partId: String(index).padStart(4, "0"), inputJson, inputSha256: studyHash(inputJson), createdAt: now, updatedAt: now }; });
    for (let index = 0; index < rows.length; index += 128) await tx.insert(studyJobParts).values(rows.slice(index, index + 128));
    await updateStudyProgress(tx, job.id, "processing");
    return plan;
  });
}
export async function startStudyAttempt(input: FileActionInput, part: SavedStudyPart, model: string) {
  return getDb().transaction(async tx => {
    const { job } = await fencedStudyJob(tx, input);
    if (job.pauseRequested) throw new AiBusyError(5, "AI_JOB_PAUSED");
    const [current] = await tx.select().from(studyJobParts).where(and(eq(studyJobParts.jobId, job.id), eq(studyJobParts.partId, part.partId))).limit(1).for("update");
    if (!current || !["pending", "generating"].includes(current.status) || current.inputSha256 !== part.inputSha256) throw new AiBusyError(5, "AI_JOB_LEASE_LOST");
    if (current.attempts >= 6) throw new StudyPlanError("AI_PART_ATTEMPTS_EXHAUSTED", "بلغ الجزء حد محاولاته الآمن. الأجزاء السابقة محفوظة؛ يلزم مراجعة سبب التعثر.");
    const now = new Date().toISOString();
    await tx.update(studyJobAttempts).set({ status: "uncertain", errorCode: "AI_WORKER_INTERRUPTED", updatedAt: now }).where(and(eq(studyJobAttempts.jobId, job.id), eq(studyJobAttempts.status, "started"), ne(studyJobAttempts.leaseOwner, input.job!.owner)));
    const id = randomUUID();
    await tx.insert(studyJobAttempts).values({ id, jobId: job.id, partId: part.partId, leaseOwner: input.job!.owner, model, createdAt: now, updatedAt: now });
    await tx.update(studyJobParts).set({ status: "generating", attempts: current.attempts + 1, updatedAt: now }).where(and(eq(studyJobParts.jobId, job.id), eq(studyJobParts.partId, part.partId)));
    return id;
  });
}
export async function recordStudyReceipt(input: FileActionInput, attemptId: string, result: GeminiResult) {
  const bounded = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(100_000_000, Math.floor(value))) : 0;
  // A late worker may record measured usage, but never publish content or change
  // its successor's ownership. Unknown usage remains NULL, not invented zero.
  await getDb().update(studyJobAttempts).set({ inputTokens: bounded(result.inputTokens), outputTokens: bounded(result.outputTokens), model: result.model, keyId: result.keyId, updatedAt: new Date().toISOString() }).where(and(eq(studyJobAttempts.id, attemptId), eq(studyJobAttempts.jobId, input.job!.id), eq(studyJobAttempts.leaseOwner, input.job!.owner), ne(studyJobAttempts.status, "committed")));
}
export async function failStudyAttempt(input: FileActionInput, attemptId: string, error: unknown) {
  const code = error instanceof AiPlatformError || error instanceof StudyPlanError ? error.code : "AI_PART_INTERRUPTED";
  return getDb().transaction(async tx => {
    const [receipt] = await tx.select().from(studyJobAttempts).where(and(eq(studyJobAttempts.id, attemptId), eq(studyJobAttempts.jobId, input.job!.id), eq(studyJobAttempts.leaseOwner, input.job!.owner), ne(studyJobAttempts.status, "committed"))).limit(1).for("update");
    if (!receipt) return;
    const measured = receipt.inputTokens !== null || receipt.outputTokens !== null;
    const noDispatch = !measured && (error instanceof AiBusyError || error instanceof AiPlatformError && !(error instanceof GeminiProviderError) && ["AI_PROVIDER_UNAVAILABLE", "AI_KEY_STORE_UNAVAILABLE", "AI_KEY_DECRYPTION_FAILED", "AI_MODEL_INVALID", "AI_SERVICE_DISABLED", "AI_PROJECT_UNVERIFIED", "AI_PROJECT_INPUT_LIMIT", "AI_PROJECT_OUTPUT_LIMIT"].includes(code));
    const rejected = !measured && (noDispatch || error instanceof GeminiProviderError && [400, 401, 403, 404, 429].includes(error.providerStatus));
    const [attempt] = await tx.update(studyJobAttempts).set({ status: rejected ? "rejected" : error instanceof StudyPlanError || ["AI_OUTPUT_TOKEN_LIMIT", "AI_OUTPUT_INCOMPLETE"].includes(code) ? "invalid" : "uncertain", billable: !rejected, errorCode: code, updatedAt: new Date().toISOString() }).where(and(eq(studyJobAttempts.id, attemptId), eq(studyJobAttempts.jobId, input.job!.id), eq(studyJobAttempts.leaseOwner, input.job!.owner), ne(studyJobAttempts.status, "committed"))).returning();
    if (attempt && rejected) {
      // Waiting for a shared slot/quota is not a generation attempt. A newer
      // worker must not have its counter changed by this old response.
      await tx.execute(sql`UPDATE study_job_parts p SET attempts=greatest(0,p.attempts-1) FROM ai_file_jobs j WHERE j.id=p.job_id AND j.id=${input.job!.id} AND j.lease_owner=${input.job!.owner} AND j.status='processing' AND p.part_id=${attempt.partId} AND p.status='generating'`);
      if (noDispatch) await tx.delete(studyJobAttempts).where(eq(studyJobAttempts.id, attemptId));
    }
  });
}
export async function commitStudyPart(input: FileActionInput, part: SavedStudyPart, value: unknown, attemptId: string | null, cache?: { key: string; scope: string }) {
  const resultJson = JSON.stringify(value), resultSha256 = studyHash(resultJson);
  if (Buffer.byteLength(resultJson, "utf8") > 2_097_152) throw new StudyPlanError("AI_PART_RESULT_LIMIT", "نتيجة الجزء تتجاوز حد التخزين الآمن؛ لم تُقص.");
  return getDb().transaction(async tx => {
    const { job, source } = await fencedStudyJob(tx, input);
    const [current] = await tx.select().from(studyJobParts).where(and(eq(studyJobParts.jobId, job.id), eq(studyJobParts.partId, part.partId))).limit(1).for("update");
    if (!current || current.inputSha256 !== part.inputSha256 || !["pending", "generating", "committed"].includes(current.status)) throw new AiBusyError(5, "AI_JOB_LEASE_LOST");
    if (current.status === "committed") { if (current.resultSha256 !== resultSha256) throw new StudyPlanError("AI_CHECKPOINT_CONFLICT", "الجزء معتمد بنتيجة مختلفة؛ لم نستبدلها."); return updateStudyProgress(tx, job.id); }
    const now = new Date().toISOString();
    if (attemptId) {
      const changed = await tx.update(studyJobAttempts).set({ status: "committed", updatedAt: now }).where(and(eq(studyJobAttempts.id, attemptId), eq(studyJobAttempts.jobId, job.id), eq(studyJobAttempts.partId, part.partId), eq(studyJobAttempts.leaseOwner, input.job!.owner), eq(studyJobAttempts.status, "started"))).returning({ id: studyJobAttempts.id });
      if (!changed.length) throw new AiBusyError(5, "AI_JOB_LEASE_LOST");
    }
    await tx.update(studyJobParts).set({ status: "committed", resultJson, resultSha256, updatedAt: now }).where(and(eq(studyJobParts.jobId, job.id), eq(studyJobParts.partId, part.partId)));
    if (cache) {
      if (cache.scope !== source.cacheScope) throw new StudyPlanError("AI_CACHE_SCOPE_INVALID", "نطاق ذاكرة النتيجة لا يطابق ملكية المصدر.");
      const cached = JSON.stringify({ version: 1, inputSha256: part.inputSha256, resultJson, resultSha256 });
      await tx.insert(aiFileCache).values({ key: cache.key, scope: cache.scope, resultJson: cached, createdAt: now, expiresAt: new Date(Date.now() + 14 * 86400_000).toISOString() }).onConflictDoUpdate({ target: aiFileCache.key, set: { resultJson: cached, createdAt: now, expiresAt: new Date(Date.now() + 14 * 86400_000).toISOString() } });
    }
    return updateStudyProgress(tx, job.id);
  });
}
export async function subdivideStudyPart(input: FileActionInput, part: SavedStudyPart) {
  const original = checkedStudyJson<StudyPartInput>(part.inputJson, part.inputSha256), children = splitStudyPart(original);
  if (part.partId.split(".").length >= 13) throw new StudyPlanError("AI_DOCUMENT_REVIEW_REQUIRED", "بلغ الجزء عمق التقسيم الآمن. الأجزاء المعتمدة محفوظة.");
  return getDb().transaction(async tx => {
    const { job } = await fencedStudyJob(tx, input);
    const [row] = await tx.select().from(studyJobParts).where(and(eq(studyJobParts.jobId, job.id), eq(studyJobParts.partId, part.partId))).limit(1).for("update");
    if (!row || row.inputSha256 !== part.inputSha256 || !["pending", "generating"].includes(row.status)) throw new AiBusyError(5, "AI_JOB_LEASE_LOST");
    const total = await tx.execute(sql`SELECT count(*)::int AS total FROM study_job_parts WHERE job_id=${job.id}`);
    if (Number(total.rows[0].total) > 8190) throw new StudyPlanError("AI_DOCUMENT_PLAN_LIMIT", "بلغت الخطة حد الأجزاء الآمن.");
    const now = new Date().toISOString();
    await tx.update(studyJobParts).set({ status: "superseded", updatedAt: now }).where(and(eq(studyJobParts.jobId, job.id), eq(studyJobParts.partId, part.partId)));
    await tx.insert(studyJobParts).values(children.map((child, index) => { const inputJson = JSON.stringify(child); return { jobId: job.id, partId: `${part.partId}.${index}`, parentId: part.partId, inputJson, inputSha256: studyHash(inputJson), createdAt: now, updatedAt: now }; }));
    return updateStudyProgress(tx, job.id);
  });
}
export async function yieldStudyJob(input: FileActionInput, phase = "processing") {
  return getDb().transaction(async tx => {
    const { job } = await fencedStudyJob(tx, input);
    const now = new Date().toISOString();
    await updateStudyProgress(tx, job.id, job.pauseRequested ? "paused" : phase);
    await tx.update(aiFileJobs).set({ status: job.pauseRequested ? "paused" : "queued", leaseOwner: null, leaseUntil: null, availableAt: now, failures: 0, errorCode: null, errorMessage: null, updatedAt: now }).where(eq(aiFileJobs.id, job.id));
  });
}
