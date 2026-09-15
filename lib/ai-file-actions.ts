import "server-only";
import { createHash } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiArtifacts, aiConversations, aiFileCache, aiFileJobs, aiFiles, aiMessages, aiQuizzes } from "@/db/schema";
import { aiDeepLinks, artifactPayload, messagePayload, quizPayload } from "@/lib/ai-api";
import { readAiFileBytes } from "@/lib/ai-files";
import { resolveAiSource } from "@/lib/ai-course-source";
import { generateFileArtifact, generateFileQuiz, type StoredQuizQuestion } from "@/lib/ai-generation";
import { AiPlatformError, beginAiUsage, finishAiUsage, getAiUsageStatuses, usagePayload } from "@/lib/ai-platform";
import { acquireAiWorkLease, AiBusyError } from "@/lib/ai-work-control";
import { studyDocumentText } from "@/lib/study-document";
import { GeminiProviderError } from "@/lib/gemini-errors";
import { DocumentFormatError } from "@/lib/document-archive";

export type FileAction = "summary" | "translation" | "quiz";
export type FileActionOptions = { language: string; targetLanguage: string; questionCount: number };
export function fileActionOptions(input: Record<string, unknown>): FileActionOptions {
  const language = (value: unknown) => typeof value === "string" ? value.replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 60) || "العربية" : "العربية";
  const count = Number(input.questionCount);
  return { language: language(input.language), targetLanguage: language(input.targetLanguage), questionCount: Number.isFinite(count) ? Math.max(5, Math.min(20, Math.floor(count))) : 10 };
}

type Generation = { kind: "quiz"; title: string; questions: StoredQuizQuestion[]; language: string; model: string } | { kind: "summary" | "translation"; title: string; text: string; model: string };

export function fileActionCacheKey(input: { scope: string; version: string; name: string; action: FileAction; options: FileActionOptions; config: { model: string; instructions: string; maxOutputTokens: number; temperature: number } }) {
  // User uploads NEVER share a cache namespace with another user. Official sources may share after authorization.
  const language = (value: string) => /^(?:ar|arabic|العربية)$/i.test(value.trim()) ? "ar" : /^(?:en|english|الإنجليزية|الانجليزية)$/i.test(value.trim()) ? "en" : value.trim().toLowerCase();
  const options = input.action === "summary" ? {} : input.action === "translation" ? { targetLanguage: language(input.options.targetLanguage) } : { language: language(input.options.language), questionCount: input.options.questionCount };
  return createHash("sha256").update(JSON.stringify({ v: 3, ...input, options })).digest("hex");
}

export async function runAiFileAction(input: {
  user: { id: number; email: string }; fileId: number; conversationId: number;
  action: FileAction; options: FileActionOptions; requestId: string; client: "app" | "web";
  job?: { id: string; owner: string };
}) {
  const { user, action, options } = input;
  const [file] = await getDb().select().from(aiFiles).where(and(eq(aiFiles.id, input.fileId), eq(aiFiles.userId, user.id))).limit(1);
  if (!file) throw new AiPlatformError("AI_FILE_MISSING", "الملف غير موجود.", 404);
  const [conversation] = await getDb().select({ id: aiConversations.id }).from(aiConversations).where(and(eq(aiConversations.id, input.conversationId), eq(aiConversations.userId, user.id), eq(aiConversations.status, "active"))).limit(1);
  if (!conversation) throw new AiPlatformError("AI_CONVERSATION_MISSING", "المحادثة غير متاحة.", 404);
  const source = await resolveAiSource(file, user, input.client);
  const status = await getAiUsageStatuses(user);
  const config = status.settings[action];
  if (!config.enabled) throw new AiPlatformError("AI_SERVICE_DISABLED", "هذه الخدمة متوقفة مؤقتًا من إدارة المنصة.", 423);
  const key = fileActionCacheKey({ scope: source.cacheScope, version: source.cacheVersion, name: source.originalName, action, options, config: { model: config.model, instructions: config.instructions, maxOutputTokens: config.maxOutputTokens, temperature: config.temperature } });
  const cached = async () => {
    const [row] = await getDb().select({ resultJson: aiFileCache.resultJson }).from(aiFileCache).where(and(eq(aiFileCache.key, key), eq(aiFileCache.scope, source.cacheScope), gt(aiFileCache.expiresAt, new Date().toISOString()))).limit(1);
    if (!row) return null;
    try {
      const value = JSON.parse(row.resultJson) as Generation;
      if (value.kind !== action || !value.title || !value.model) return null;
      if (value.kind === "quiz" ? !Array.isArray(value.questions) || value.questions.length !== options.questionCount : typeof value.text !== "string") return null;
      return value;
    } catch { return null; }
  };
  let generation = await cached();
  let reused = Boolean(generation);
  let usage = status.statuses[action];
  let reservation: Awaited<ReturnType<typeof beginAiUsage>> | null = null;
  let providerStarted = false;
  if (!generation) {
    const releaseCache = await acquireAiWorkLease(`cache:${key}`);
    if (!releaseCache) throw new AiBusyError(5, "AI_SOURCE_PROCESSING");
    try {
      generation = await cached();
      reused = Boolean(generation);
      if (!generation) {
        const bytes = await readAiFileBytes(source, config.maxFileBytes);
        try { studyDocumentText(bytes, source.contentType); }
        catch (error) { if (error instanceof DocumentFormatError) throw new AiPlatformError("AI_DOCUMENT_INVALID", error.message, 422); throw error; }
        reservation = await beginAiUsage({ requestId: input.requestId, user, service: action, conversationId: conversation.id, fileId: file.id });
        providerStarted = true;
        if (action === "quiz") {
          const generated = await generateFileQuiz({ config, bytes, contentType: source.contentType, originalName: source.originalName, ...options });
          generation = { kind: "quiz", title: generated.quiz.title, questions: generated.quiz.questions, language: options.language, model: generated.result.model };
          await finishAiUsage({ eventId: reservation.eventId, status: "succeeded", ...generated.result });
        } else {
          const generated = await generateFileArtifact({ action, config, bytes, contentType: source.contentType, originalName: source.originalName, targetLanguage: options.targetLanguage });
          generation = { kind: action, title: (action === "summary" ? `ملخص ${source.originalName}` : `ترجمة ${source.originalName} إلى ${options.targetLanguage}`).slice(0, 180), text: generated.text, model: generated.model };
          await finishAiUsage({ eventId: reservation.eventId, status: "succeeded", ...generated });
        }
        usage = usagePayload({ service: action, ...reservation });
        // Mark reservation settled before subsequent persistence errors: completed provider work stays billable.
        reservation = null;
        const now = new Date().toISOString();
        await getDb().insert(aiFileCache).values({ key, scope: source.cacheScope, resultJson: JSON.stringify(generation), createdAt: now, expiresAt: new Date(Date.now() + 14 * 86400_000).toISOString() }).onConflictDoUpdate({ target: aiFileCache.key, set: { resultJson: JSON.stringify(generation), createdAt: now, expiresAt: new Date(Date.now() + 14 * 86400_000).toISOString() } });
      }
    } catch (error) {
      if (reservation) await finishAiUsage({ eventId: reservation.eventId, status: "failed", billable: providerStarted && !(error instanceof AiBusyError) && !(error instanceof GeminiProviderError && [400, 401, 403, 404, 429].includes(error.providerStatus)), errorCode: error instanceof AiPlatformError ? error.code : "AI_PROCESSING_FAILED" }).catch(() => undefined);
      throw error;
    } finally { await releaseCache().catch(() => undefined); }
  }
  if (!generation) throw new AiPlatformError("AI_RESULT_MISSING", "تعذر حفظ نتيجة المعالجة.", 503);
  // Recheck subscription/visibility after a long provider call and before returning source-derived content.
  if (file.sourceResourceId !== null) await resolveAiSource(file, user, input.client);
  const value = generation;
  return getDb().transaction(async tx => {
    if (input.job) {
      const rows = await tx.execute(sql`SELECT id FROM ai_file_jobs WHERE id = ${input.job.id} AND status = 'processing' AND lease_owner = ${input.job.owner} FOR UPDATE`);
      if (!rows.rows.length) throw new AiBusyError(5, "AI_JOB_LEASE_LOST");
    }
    const now = new Date().toISOString();
    let result: Record<string, unknown>;
    if (value.kind === "quiz") {
      const [quiz] = await tx.insert(aiQuizzes).values({ userId: user.id, conversationId: conversation.id, fileId: file.id, title: value.title, language: value.language, questionsJson: JSON.stringify(value.questions), model: value.model, createdAt: now, updatedAt: now }).returning();
      const [message] = await tx.insert(aiMessages).values({ conversationId: conversation.id, userId: user.id, role: "assistant", service: "quiz", content: `اختبار «${value.title}» من ${value.questions.length} أسئلة جاهز. يمكنك إعادته دون توليد جديد.`, fileId: file.id, model: value.model, usageJson: JSON.stringify({ quizId: quiz.id, cached: reused }), createdAt: now }).returning();
      result = { ok: true, action, quiz: quizPayload(quiz), message: messagePayload(message), usage, cached: reused, deepLink: aiDeepLinks({ conversationId: conversation.id, quizId: quiz.id }).quiz };
    } else {
      const [artifact] = await tx.insert(aiArtifacts).values({ userId: user.id, conversationId: conversation.id, fileId: file.id, kind: value.kind, title: value.title, content: value.text, metadataJson: JSON.stringify({ targetLanguage: options.targetLanguage, cached: reused }), model: value.model, createdAt: now }).returning();
      const [message] = await tx.insert(aiMessages).values({ conversationId: conversation.id, userId: user.id, role: "assistant", service: action, content: value.text, fileId: file.id, model: value.model, usageJson: JSON.stringify({ artifactId: artifact.id, cached: reused }), createdAt: now }).returning();
      result = { ok: true, action, artifact: artifactPayload(artifact), message: messagePayload(message), usage, cached: reused, deepLink: aiDeepLinks({ conversationId: conversation.id }).conversation };
    }
    await tx.update(aiConversations).set({ title: value.title.slice(0, 120), kind: action, updatedAt: now }).where(eq(aiConversations.id, conversation.id));
    if (input.job) await tx.update(aiFileJobs).set({ status: "succeeded", resultJson: JSON.stringify(result), leaseUntil: null, leaseOwner: null, updatedAt: now }).where(and(eq(aiFileJobs.id, input.job.id), eq(aiFileJobs.leaseOwner, input.job.owner)));
    return result;
  });
}
