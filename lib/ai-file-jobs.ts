import { expirePausedStudyJobs } from "@/lib/study-job-control";
import "server-only";
import { pruneStudyPdfExports } from "@/lib/study-pdf";
import { createHash, randomUUID } from "node:crypto";
import { and, count, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiFileJobs, aiFiles, users } from "@/db/schema";
import { AiPlatformError, getAiUsageStatuses } from "@/lib/ai-platform";
import { AiBusyError, boundedAiSetting } from "@/lib/ai-work-control";
import { GeminiProviderError } from "@/lib/gemini-errors";
import { resolveAiSource } from "@/lib/ai-course-source";
import { runCheckpointedFileAction, studyProcessingError } from "@/lib/study-processing";
import { studySourceFingerprint } from "@/lib/study-processing-plan";
import { runAiFileAction, type FileAction, type FileActionOptions } from "@/lib/ai-file-actions";

export function fileJobPayload(job: typeof aiFileJobs.$inferSelect) {
  let progress: Record<string, unknown> | null = null;
  try {
    const value = JSON.parse(job.progressJson || "null");
    if (value && ["preparing", "processing", "waiting", "replanning", "assembling", "complete", "failed", "review", "pausing", "paused", "cancelled"].includes(value.phase)) {
      progress = { phase: value.phase };
      for (const key of ["totalUnits", "completedUnits", "totalParts", "completedParts", "percent"]) progress[key] = Math.max(0, Math.min(key === "percent" ? (job.status === "succeeded" ? 100 : 99) : 8192, Number.isSafeInteger(value[key]) ? value[key] : 0));
    }
  } catch { /* Older jobs have no part progress. */ }
  return { id: job.id, status: job.status, action: job.action, createdAt: job.createdAt, updatedAt: job.updatedAt, supportsControl: job.processingVersion === 2, ...(progress ? { progress } : {}),
    ...(["failed", "cancelled"].includes(job.status) ? { error: job.errorMessage || "تعذر إكمال المعالجة.", code: job.errorCode } : {}),
    ...(job.status === "succeeded" && job.resultJson ? { result: JSON.parse(job.resultJson) as Record<string, unknown> } : {}),
  };
}

export async function enqueueAiFileJob(input: { user: { id: number; email: string }; file: typeof aiFiles.$inferSelect; conversationId: number; action: FileAction; options: FileActionOptions; requestId: string; client: "app" | "web" }) {
  const source = await resolveAiSource(input.file, input.user, input.client);
  const { settings } = await getAiUsageStatuses(input.user);
  if (!settings[input.action].enabled) throw new AiPlatformError("AI_SERVICE_DISABLED", "هذه الخدمة متوقفة مؤقتًا.", 423);
  const inputHash = createHash("sha256").update(JSON.stringify({ user: input.user.id, file: input.file.id, conversation: input.conversationId, action: input.action, options: input.options, client: input.client })).digest("hex");
  const limit = boundedAiSetting(process.env.AI_MAX_QUEUED_FILE_JOBS, 500, 10, 10_000);
  return getDb().transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('meras-ai-job-admission'))`);
    const [duplicate] = await tx.select().from(aiFileJobs).where(eq(aiFileJobs.requestId, input.requestId)).limit(1);
    if (duplicate) {
      if (duplicate.userId !== input.user.id || duplicate.inputHash !== inputHash) throw new AiPlatformError("AI_REQUEST_CONFLICT", "معرّف الطلب مستخدم لعملية أخرى.", 409);
      return duplicate;
    }
    const pending = inArray(aiFileJobs.status, ["queued", "processing", "paused"]);
    const [activeUser] = await tx.select({ count: count() }).from(aiFileJobs).where(and(eq(aiFileJobs.userId, input.user.id), pending));
    if (Number(activeUser.count) >= 2) throw new AiPlatformError("AI_USER_QUEUE_FULL", "لديك طلبان قيد المعالجة. انتظر اكتمالهما قبل إرسال طلب آخر.", 429);
    const [queue] = await tx.select({ count: count() }).from(aiFileJobs).where(pending);
    if (Number(queue.count) >= limit) throw new AiBusyError(30, "AI_QUEUE_FULL");
    const now = new Date().toISOString();
    const [job] = await tx.insert(aiFileJobs).values({ id: randomUUID(), requestId: input.requestId, inputHash, userId: input.user.id, fileId: input.file.id, conversationId: input.conversationId, action: input.action, client: input.client, processingVersion: 2, sourceFingerprint: studySourceFingerprint(source), generationConfigJson: JSON.stringify(settings[input.action]), progressJson: JSON.stringify({ phase: "preparing", totalUnits: 0, completedUnits: 0, totalParts: 0, completedParts: 0, percent: 0 }), optionsJson: JSON.stringify(input.options), availableAt: now, createdAt: now, updatedAt: now }).returning();
    return job;
  });
}

export async function claimAiFileJob() {
  return getDb().transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('meras-ai-job-claim'))`);
    const now = new Date().toISOString();
    const maxActive = boundedAiSetting(process.env.AI_WORKER_MAX_ACTIVE, 2, 1, 8);
    const [active] = await tx.select({ count: count() }).from(aiFileJobs).where(and(eq(aiFileJobs.status, "processing"), gt(aiFileJobs.leaseUntil, now)));
    if (Number(active.count) >= maxActive) return null;
    const candidate = await tx.execute(sql`SELECT j.id FROM ai_file_jobs j
      WHERE ((j.status = 'queued' AND j.available_at <= ${now}) OR (j.status = 'processing' AND j.lease_until < ${now}))
      AND NOT EXISTS (SELECT 1 FROM ai_file_jobs busy WHERE busy.user_id = j.user_id AND busy.id <> j.id AND busy.status = 'processing' AND busy.lease_until > ${now})
      ORDER BY j.available_at, j.created_at LIMIT 1 FOR UPDATE OF j SKIP LOCKED`);
    const id = candidate.rows[0]?.id;
    if (typeof id !== "string") return null;
    const [job] = await tx.update(aiFileJobs).set({ status: "processing", leaseOwner: randomUUID(), leaseUntil: new Date(Date.now() + 300_000).toISOString(), attempts: sql`${aiFileJobs.attempts} + 1`, updatedAt: now }).where(eq(aiFileJobs.id, id)).returning();
    return job;
  });
}

export async function runAiFileJobOnce() {
  const job = await claimAiFileJob();
  if (!job) return false;
  try {
    if (Date.now() - Date.parse(job.createdAt) > (job.processingVersion === 2 ? 7 * 86400_000 : 30 * 60_000)) throw new AiPlatformError("AI_QUEUE_EXPIRED", job.processingVersion === 2 ? "انتهت نافذة استكمال الطلب (7 أيام). بقيت الأجزاء المعتمدة في السجل؛ الانتظار وحده لا يستهلك حصة." : "انتهت مهلة انتظار الطلب بسبب الضغط. أعد المحاولة لاحقًا؛ لم تُخصم حصة للانتظار.", 503);
    const [user] = await getDb().select({ id: users.id, email: users.email, status: users.status }).from(users).where(eq(users.id, job.userId)).limit(1);
    if (!user || user.status !== "active") throw new AiPlatformError("AI_ACCOUNT_UNAVAILABLE", "الحساب غير متاح للمعالجة.", 403);
    const input = { user, fileId: job.fileId, conversationId: job.conversationId, action: job.action as FileAction, options: JSON.parse(job.optionsJson) as FileActionOptions, requestId: `${job.requestId}:attempt:${job.attempts}`, client: job.client === "app" ? "app" as const : "web" as const, job: { id: job.id, owner: job.leaseOwner! } };
    if (job.processingVersion === 2) await runCheckpointedFileAction(input, job);
    else await runAiFileAction(input);
  } catch (failure) {
    const error = studyProcessingError(failure);
    if (job.processingVersion === 2) { await settleCheckpointFailure(job, error); return true; }
    const busy = error instanceof AiBusyError;
    const canRetry = busy || error instanceof GeminiProviderError && error.retryable && ["AI_RATE_LIMITED", "AI_PROVIDER_TIMEOUT", "AI_PROVIDER_UNAVAILABLE"].includes(error.code) && job.failures < 2;
    const delay = busy ? error.retryAfterSeconds : error instanceof GeminiProviderError ? Math.max(error.retryAfterSeconds || 0, 30 * 2 ** job.failures) : 0;
    const now = new Date().toISOString();
    await getDb().update(aiFileJobs).set({
      status: canRetry ? "queued" : "failed", leaseUntil: null, leaseOwner: null,
      availableAt: new Date(Date.now() + Math.min(3600, delay) * 1000 + Math.floor(Math.random() * 1000)).toISOString(),
      failures: job.failures + (busy ? 0 : 1), updatedAt: now,
      errorCode: error instanceof AiPlatformError ? error.code : "AI_JOB_FAILED",
      errorMessage: error instanceof AiPlatformError ? error.message : "تعذر إكمال المعالجة. حاول مجددًا لاحقًا.",
    }).where(and(eq(aiFileJobs.id, job.id), eq(aiFileJobs.leaseOwner, job.leaseOwner!), sql`${aiFileJobs.leaseUntil}::timestamptz > clock_timestamp()`));
  }
  return true;
}

async function settleCheckpointFailure(snapshot: typeof aiFileJobs.$inferSelect, error: unknown) {
  const code = error instanceof AiPlatformError ? error.code : "AI_JOB_FAILED";
  const message = error instanceof AiPlatformError ? error.message : "تعذر إكمال الجزء الحالي. الأجزاء المعتمدة محفوظة.";
  if (code === "AI_JOB_LEASE_LOST") return;
  const busy = error instanceof AiBusyError;
  const waiting = busy || ["AI_RATE_LIMITED", "AI_QUOTA_EXHAUSTED", "AI_PROVIDER_UNAVAILABLE"].includes(code);
  const transient = error instanceof GeminiProviderError && error.retryable && ["AI_PROVIDER_TIMEOUT", "AI_PROVIDER_UNAVAILABLE"].includes(code);
  await getDb().transaction(async tx => {
    const [job] = await tx.select().from(aiFileJobs).where(and(eq(aiFileJobs.id, snapshot.id), eq(aiFileJobs.status, "processing"), eq(aiFileJobs.leaseOwner, snapshot.leaseOwner!), sql`${aiFileJobs.leaseUntil}::timestamptz > clock_timestamp()`)).limit(1).for("update");
    if (!job) return;
    const now = new Date().toISOString(), pause = job.pauseRequested || code === "AI_JOB_PAUSED";
    const retry = !pause && (waiting || transient && job.failures < 5);
    const delay = busy ? error.retryAfterSeconds : error instanceof GeminiProviderError ? Math.max(error.retryAfterSeconds || 0, code === "AI_QUOTA_EXHAUSTED" ? 3600 : 30 * 2 ** Math.min(job.failures, 5)) : 60;
    const phase = pause ? "paused" : retry ? "waiting" : /REVIEW|CONFIGURATION|ATTEMPTS|OUTPUT_LIMIT/.test(code) ? "review" : "failed";
    let previous: Record<string, unknown> = {}; try { previous = JSON.parse(job.progressJson || "{}"); } catch { /* safe, empty progress */ }
    await tx.update(aiFileJobs).set({ status: pause ? "paused" : retry ? "queued" : "failed", leaseUntil: null, leaseOwner: null,
      availableAt: new Date(Date.now() + Math.min(3600, Math.max(1, delay)) * 1000 + Math.floor(Math.random() * 1000)).toISOString(),
      failures: job.failures + (waiting || pause ? 0 : 1), errorCode: code, errorMessage: message,
      progressJson: JSON.stringify({ ...previous, phase, percent: Math.min(99, Number(previous.percent) || 0) }), updatedAt: now,
    }).where(eq(aiFileJobs.id, job.id));
    if (!retry && !pause && job.usageEventId) await tx.execute(sql`UPDATE ai_usage_events SET status=CASE WHEN EXISTS (SELECT 1 FROM study_job_attempts WHERE job_id=${job.id} AND billable=true) THEN 'billable_failed' ELSE 'failed' END,
      input_tokens=least(100000000,coalesce((SELECT sum(input_tokens) FROM study_job_attempts WHERE job_id=${job.id}),0)),
      output_tokens=least(100000000,coalesce((SELECT sum(output_tokens) FROM study_job_attempts WHERE job_id=${job.id}),0)), error_code=${code}
      WHERE id=${job.usageEventId} AND user_id=${job.userId} AND status='processing'`);
  });
}

export async function pruneAiWork() {
  await pruneStudyPdfExports();
  await expirePausedStudyJobs();
  // Small batches only: do not lock a growing history table during peak traffic.
  await getDb().execute(sql`DELETE FROM ai_file_cache WHERE key IN (SELECT key FROM ai_file_cache WHERE expires_at < ${new Date().toISOString()} LIMIT 200)`);
  await getDb().execute(sql`DELETE FROM ai_file_jobs WHERE id IN (SELECT id FROM ai_file_jobs WHERE status IN ('succeeded', 'failed', 'cancelled') AND updated_at < ${new Date(Date.now() - 7 * 86400_000).toISOString()} LIMIT 200)`);
}
