import "server-only";
import { and, count, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { studyJobAttempts } from "@/db/study-processing-schema";
import { aiConversations, aiFileCache, aiFileJobs, aiFiles } from "@/db/schema";
import { AiPlatformError, beginAiUsage, getAiUsageStatuses, usagePayload, type AiServiceConfig } from "@/lib/ai-platform";
import { acquireAiWorkLease, AiBusyError } from "@/lib/ai-work-control";
import { resolveAiSource } from "@/lib/ai-course-source";
import { readAiFileBytes } from "@/lib/ai-files";
import { fileActionCacheKey, publishAiFileGeneration, type FileActionInput, type Generation } from "@/lib/ai-file-actions";
import { generateFileArtifact, generateFileQuiz, parseQuiz } from "@/lib/ai-generation";
import { studyDocumentText } from "@/lib/study-document";
import { DocumentFormatError } from "@/lib/document-archive";
import { GeminiProviderError } from "@/lib/gemini-errors";
import { assertTranslationNumbers, generateStudyPart, type StudyPartResult } from "@/lib/study-part-generation";
import { assertStudyCoverage, checkedStudyJson, groupStudyUnits, MAX_STUDY_RESULT, studyBytesHash, studyConfigHash, studyHash, studySourceFingerprint, studyTextUnits, StudyPlanError, type StudyPartInput, type StudyPlan } from "@/lib/study-processing-plan";
import { studyPdfPacket, studyPdfPageCount } from "@/lib/study-pdf-source";
import { commitStudyPart, failStudyAttempt, fencedStudyJob, loadStudyParts, loadStudyPlan, recordStudyReceipt, saveStudyPlan, startStudyAttempt, subdivideStudyPart, yieldStudyJob, type SavedStudyPart } from "@/lib/study-job-checkpoints";

function readGeneration(value: unknown, input: FileActionInput, model: string): Generation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new StudyPlanError("AI_CHECKPOINT_CORRUPT", "صيغة النتيجة المحفوظة غير صالحة.");
  const row = value as Record<string, unknown>;
  if (row.kind !== input.action || row.model !== model || typeof row.title !== "string" || !row.title.trim() || row.title.length > 500) throw new StudyPlanError("AI_CHECKPOINT_CORRUPT", "نتيجة لا تطابق أداة المهمة أو نموذجها المثبت.");
  if (input.action === "quiz") {
    const quiz = parseQuiz(JSON.stringify({ title: row.title, questions: row.questions }), input.options.questionCount);
    return { kind: "quiz", title: quiz.title, questions: quiz.questions, language: input.options.language, model };
  }
  if (typeof row.text !== "string" || !row.text.trim() || row.text.length > MAX_STUDY_RESULT || row.text.includes("\u0000")) throw new StudyPlanError("AI_CHECKPOINT_CORRUPT", "النص المحفوظ غير صالح أو تجاوز الحد الآمن.");
  return { kind: input.action, title: row.title, text: row.text, model };
}
function readPartValue(value: unknown, part: StudyPartInput, input: FileActionInput, model: string): Generation | StudyPartResult {
  if (part.mode === "whole") return readGeneration(value, input, model);
  const row = value as Partial<StudyPartResult> | null;
  if (!row || row.kind !== "units" || row.action !== input.action || row.model !== model || !Array.isArray(row.units) || row.units.length !== part.units.length || row.units.some((unit, i) => !unit || unit.id !== part.units[i].id || typeof unit.text !== "string" || !unit.text.trim() || unit.text.length > 100_000 || unit.text.includes("\u0000"))) throw new StudyPlanError("AI_CHECKPOINT_CORRUPT", "تغطية الجزء المحفوظ أو صيغته غير صالحة.");
  return row as StudyPartResult;
}
async function wholeCache(plan: StudyPlan, source: Awaited<ReturnType<typeof resolveAiSource>>, input: FileActionInput, model: string) {
  const [row] = await getDb().select().from(aiFileCache).where(and(eq(aiFileCache.key, plan.cacheKey), eq(aiFileCache.scope, source.cacheScope), gt(aiFileCache.expiresAt, new Date().toISOString()))).limit(1);
  if (!row) return null;
  try {
    const value = JSON.parse(row.resultJson), proof = value.checkpoint;
    if (!proof || proof.version !== 1 || proof.sourceSha256 !== plan.sourceSha256 || proof.unitsSha256 !== studyHash(plan.sourceUnits)) return null;
    const generation = readGeneration(value, input, model);
    if (proof.resultSha256 !== studyHash(generation)) return null;
    return generation;
  } catch { return null; }
}
async function partCache(key: string, scope: string, part: SavedStudyPart, parsed: StudyPartInput, input: FileActionInput, model: string) {
  const [row] = await getDb().select().from(aiFileCache).where(and(eq(aiFileCache.key, key), eq(aiFileCache.scope, scope), gt(aiFileCache.expiresAt, new Date().toISOString()))).limit(1);
  if (!row) return null;
  try {
    const cached = JSON.parse(row.resultJson);
    if (cached.version !== 1 || cached.inputSha256 !== part.inputSha256) return null;
    return readPartValue(checkedStudyJson(cached.resultJson, cached.resultSha256), parsed, input, model);
  } catch { return null; }
}
export async function runCheckpointedFileAction(input: FileActionInput, snapshot: typeof aiFileJobs.$inferSelect) {
  if (!input.job || snapshot.processingVersion !== 2) throw new StudyPlanError("AI_PLAN_INVALID", "مسار استكمال غير صالح.");
  const [file] = await getDb().select().from(aiFiles).where(and(eq(aiFiles.id, input.fileId), eq(aiFiles.userId, input.user.id))).limit(1);
  const [conversation] = await getDb().select({ id: aiConversations.id }).from(aiConversations).where(and(eq(aiConversations.id, input.conversationId), eq(aiConversations.userId, input.user.id), eq(aiConversations.status, "active"))).limit(1);
  if (!file || !conversation) throw new AiPlatformError("AI_SOURCE_ACCESS", "لم يعد الملف أو سجل الأداة متاحًا.", 403);
  const source = await resolveAiSource(file, input.user, input.client), status = await getAiUsageStatuses(input.user);
  const currentConfig = status.settings[input.action];
  if (!currentConfig.enabled) throw new AiPlatformError("AI_SERVICE_DISABLED", "أوقفت الإدارة هذه الخدمة. الأجزاء المعتمدة محفوظة.", 423);
  const config = JSON.parse(snapshot.generationConfigJson || "null") as AiServiceConfig | null;
  if (!config || config.service !== input.action || studyConfigHash(config) !== studyConfigHash(currentConfig)) throw new StudyPlanError("AI_JOB_CONFIGURATION_CHANGED", "تغيّر النموذج أو قاموس التعليمات أو إعدادات المهمة؛ لم نمزج نتائج غير متوافقة. الأجزاء السابقة محفوظة للمراجعة.");
  const fingerprint = studySourceFingerprint(source);
  if (snapshot.sourceFingerprint !== fingerprint) throw new AiPlatformError("AI_SOURCE_CHANGED", "تغيّر مصدر الطلب منذ قبوله؛ لم نخلط نسختين.", 409);
  let bytes: Buffer | null = null;
  const originalBytes = async () => bytes ||= await readAiFileBytes(source, Math.min(config.maxFileBytes, currentConfig.maxFileBytes));
  let plan = await loadStudyPlan(input.job.id);
  if (!plan) {
    const original = await originalBytes();
    let units = studyTextUnits(original, source.contentType), sourcePages: number | undefined;
    if (!units) {
      if (source.contentType === "application/pdf") { sourcePages = await studyPdfPageCount(original); units = Array.from({ length: sourcePages }, (_, index) => ({ id: `page:${index + 1}`, label: `صفحة PDF ${index + 1}`, page: index + 1 })); }
      else units = [{ id: "image:1", label: "الصورة الأصلية" }];
    }
    let parts = groupStudyUnits(units, source.contentType, sourcePages);
    if (input.action === "quiz") {
      // Preserve the existing, strictly validated quiz contract. Large quiz
      // topic allocation is a separate planner, never a partial-file shortcut.
      studyDocumentText(original, source.contentType);
      parts = [{ units, mode: "whole", contentType: source.contentType, ...(sourcePages ? { sourcePages } : {}) }];
    }
    const baseKey = fileActionCacheKey({ scope: source.cacheScope, version: source.cacheVersion, name: source.originalName, action: input.action, options: input.options, config: { model: config.model, instructions: config.instructions, maxOutputTokens: config.maxOutputTokens, temperature: config.temperature } });
    const mode = parts.length === 1 ? "whole" as const : "units" as const;
    plan = { version: 1, sourceSha256: studyBytesHash(original), fingerprint, configHash: studyConfigHash(config), sourceUnits: units.map(unit => unit.id), ...(sourcePages ? { sourcePages } : {}), mode, cacheKey: mode === "whole" ? baseKey : studyHash(`study-units-v1:${baseKey}`), action: input.action };
    await saveStudyPlan(input, plan, parts);
  }
  if (plan.fingerprint !== fingerprint || plan.configHash !== studyConfigHash(config) || plan.action !== input.action) throw new StudyPlanError("AI_PLAN_CHANGED", "خطة المعالجة لا تطابق المصدر والإعدادات المثبتة.");
  let usage = status.statuses[input.action];
  const savedWhole = await wholeCache(plan, source, input, config.model);
  const publish = async (generation: Generation, reused: boolean, completedParts: number) => publishAiFileGeneration(input, { file, conversation, source, generation, usage, reused, metadata: { processing: { version: 1, sourceUnits: plan!.sourceUnits.length, completedParts, coverage: "selected-source-units", scientificReview: "automated-structure-checks-not-specialist-review" } } });
  if (savedWhole) return publish(savedWhole, true, 0);
  let parts = await loadStudyParts(input.job.id);
  const pending = parts.find(part => part.status !== "committed");
  if (pending) {
    const parsed = checkedStudyJson<StudyPartInput>(pending.inputJson, pending.inputSha256), partKey = studyHash({ checkpoint: 1, key: plan.cacheKey, source: plan.sourceSha256, input: pending.inputSha256 });
    // Whole-result lock keeps small official-source jobs deduplicated exactly as
    // before. Large jobs release their part lock after each durable checkpoint.
    const release = await acquireAiWorkLease(plan.mode === "whole" ? `cache:${plan.cacheKey}` : `study-part:${partKey}`, 300);
    if (!release) throw new AiBusyError(5, "AI_SOURCE_PROCESSING");
    try {
      const whole = await wholeCache(plan, source, input, config.model);
      if (whole) return await publish(whole, true, 0);
      let value = await partCache(partKey, source.cacheScope, pending, parsed, input, config.model), attemptId: string | null = null;
      if (!value) {
        const original = await originalBytes();
        if (studyBytesHash(original) !== plan.sourceSha256) throw new StudyPlanError("AI_SOURCE_CHANGED", "تغيّرت بايتات المصدر؛ لم نكمل على نسخة مختلفة.");
        const pdf = parsed.mode === "units" && source.contentType === "application/pdf" ? await studyPdfPacket(original, parsed) : undefined;
        // Reserve once, in the same transaction that links the event to this job.
        const reservation = await beginAiUsage({ requestId: `study-job:${input.job.id}`, user: input.user, service: input.action, fileId: file.id, conversationId: conversation.id, job: input.job });
        usage = usagePayload({ service: input.action, ...reservation });
        attemptId = await startStudyAttempt(input, pending, config.model);
        const onReceipt = (result: Parameters<typeof recordStudyReceipt>[2]) => recordStudyReceipt(input, attemptId!, result);
        try {
          if (parsed.mode === "whole") {
            if (input.action === "quiz") {
              const generated = await generateFileQuiz({ config, bytes: original, contentType: source.contentType, originalName: source.originalName, ...input.options, allowPaidFallback: false, onReceipt });
              value = { kind: "quiz", title: generated.quiz.title, questions: generated.quiz.questions, language: input.options.language, model: generated.result.model };
            } else {
              const generated = await generateFileArtifact({ action: input.action, config, bytes: original, contentType: source.contentType, originalName: source.originalName, ...input.options, allowPaidFallback: false, onReceipt });
              if (input.action === "translation" && parsed.units.every(unit => typeof unit.text === "string")) assertTranslationNumbers(parsed.units.map(unit => unit.text).join("\n"), generated.text);
              value = { kind: input.action, title: `${input.action === "summary" ? "ملخص" : "ترجمة"} ${source.originalName}`.slice(0, 180), text: generated.text, model: generated.model };
            }
          } else {
            if (input.action === "quiz") throw new StudyPlanError("AI_QUIZ_PLAN_REVIEW", "هذا الاختبار يحتاج إعادة تخطيط أسئلته؛ لم نقتطع المصدر.");
            value = (await generateStudyPart({ part: parsed, config, action: input.action, ...input.options, pdf, onReceipt })).value;
          }
          await commitStudyPart(input, pending, value, attemptId, { key: partKey, scope: source.cacheScope });
        } catch (error) {
          await failStudyAttempt(input, attemptId, error).catch(() => undefined);
          if (input.action !== "quiz" && (error instanceof GeminiProviderError || error instanceof AiPlatformError) && ["AI_OUTPUT_TOKEN_LIMIT", "AI_PROJECT_INPUT_LIMIT", "AI_REQUEST_TOKEN_LIMIT", "AI_INPUT_TOKEN_LIMIT", "AI_REQUEST_TOO_LARGE"].includes(error.code)) {
            await subdivideStudyPart(input, pending);
            await yieldStudyJob(input, "replanning");
            return null;
          }
          throw error;
        }
      } else await commitStudyPart(input, pending, value, null);
    } finally { await release().catch(() => undefined); }
    parts = await loadStudyParts(input.job.id);
    if (parts.some(part => part.status !== "committed")) { await yieldStudyJob(input); return null; }
  }
  const inputs = parts.map(part => checkedStudyJson<StudyPartInput>(part.inputJson, part.inputSha256));
  assertStudyCoverage(plan.sourceUnits, inputs);
  const values = parts.map((part, index) => {
    if (part.status !== "committed" || !part.resultJson || !part.resultSha256) throw new StudyPlanError("AI_PART_COVERAGE", "أجزاء غير مكتملة؛ لم ننشر ملفًا نهائيًا.");
    return readPartValue(checkedStudyJson(part.resultJson, part.resultSha256), inputs[index], input, config.model);
  });
  let generation: Generation;
  if (values.length === 1 && values[0].kind !== "units") generation = values[0];
  else {
    if (input.action === "quiz" || values.some(value => value.kind !== "units")) throw new StudyPlanError("AI_PLAN_COVERAGE", "لا يمكن مزج نوعين من نتائج المعالجة.");
    const text = values.map((value, partIndex) => (value as StudyPartResult).units.map((unit, index) => `## ${inputs[partIndex].units[index].label}\n\n${unit.text}`).join("\n\n")).join("\n\n");
    if (text.length > MAX_STUDY_RESULT) throw new StudyPlanError("AI_JOB_OUTPUT_LIMIT", "بلغت النتيجة حد التجميع الآمن. الأجزاء المعتمدة محفوظة؛ لم نحذف النص الزائد أو نزيد الميزانية.");
    generation = { kind: input.action, title: `${input.action === "summary" ? "ملخص" : "ترجمة"} ${source.originalName}`.slice(0, 180), text, model: config.model };
  }
  const complete = readGeneration(generation, input, config.model);
  await getDb().transaction(async tx => {
    await fencedStudyJob(tx, input);
    const now = new Date().toISOString(), resultJson = JSON.stringify({ ...complete, checkpoint: { version: 1, sourceSha256: plan!.sourceSha256, unitsSha256: studyHash(plan!.sourceUnits), resultSha256: studyHash(complete) } });
    await tx.insert(aiFileCache).values({ key: plan!.cacheKey, scope: source.cacheScope, resultJson, createdAt: now, expiresAt: new Date(Date.now() + 14 * 86400_000).toISOString() }).onConflictDoUpdate({ target: aiFileCache.key, set: { resultJson, createdAt: now, expiresAt: new Date(Date.now() + 14 * 86400_000).toISOString() } });
  });
  const [generated] = await getDb().select({ count: count() }).from(studyJobAttempts).where(and(eq(studyJobAttempts.jobId, input.job.id), eq(studyJobAttempts.billable, true)));
  return publish(complete, Number(generated.count) === 0, parts.length);
}
/** Only safe public messages cross the worker boundary; parser internals stay private. */
export function studyProcessingError(error: unknown) {
  if (error instanceof StudyPlanError) return new AiPlatformError(error.code, error.message, 422);
  if (error instanceof DocumentFormatError) return new AiPlatformError("AI_DOCUMENT_INVALID", error.message, 422);
  return error;
}
