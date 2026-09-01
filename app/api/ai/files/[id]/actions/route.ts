import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiArtifacts, aiConversations, aiFiles, aiMessages, aiQuizzes } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { aiDeepLinks, aiError, aiJson, artifactPayload, clientAiRequestId, messagePayload, quizPayload } from "@/lib/ai-api";
import { readAiFileBytes, tryAcquireAiFileAction } from "@/lib/ai-files";
import { generateFileArtifact, generateFileQuiz } from "@/lib/ai-generation";
import { scanColumns, scanStoredFile } from "@/lib/file-security";
import { beginAiUsage, finishAiUsage, usagePayload, type AiServiceConfig } from "@/lib/ai-platform";
import { observeRequest } from "@/lib/observability";

type Action = "summary" | "translation" | "quiz";

function actionValue(value: unknown): Action | null {
  return value === "summary" || value === "translation" || value === "quiz" ? value : null;
}

async function ownedConversation(userId: number, id: number) {
  if (!id) return null;
  const [row] = await getDb().select().from(aiConversations).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId), eq(aiConversations.status, "active"))).limit(1);
  return row || null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return observeRequest(request, "ai.files.action", async (requestId) => {
    if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
    const user = await getSessionUser(request);
    if (!user) return jsonError("سجّل الدخول لاستخدام مراس AI", 401);
    if (!await checkRateLimit("ai-file-action", `user:${user.id}`, 20, 60 * 60)) return jsonError("طلبات معالجة كثيرة. حاول لاحقًا.", 429);
    const { id: rawId } = await params;
    const fileId = Math.floor(Number(rawId));
    if (!Number.isInteger(fileId) || fileId <= 0) return jsonError("الملف غير صالح");
    let payload: Record<string, unknown>;
    try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات العملية غير صالحة"); }
    const action = actionValue(payload.action);
    if (!action) return jsonError("اختر تلخيصًا أو ترجمة أو اختبارًا");
    const [file] = await getDb().select().from(aiFiles).where(and(eq(aiFiles.id, fileId), eq(aiFiles.userId, user.id))).limit(1);
    if (!file) return jsonError("الملف غير موجود", 404);
    if (file.scanStatus !== "clean") {
      const scan = await scanStoredFile(file);
      await getDb().update(aiFiles).set({ ...scanColumns(scan), status: scan.status === "clean" ? "ready" : scan.status === "quarantined" ? "quarantined" : "pending_scan", updatedAt: new Date().toISOString() }).where(eq(aiFiles.id, file.id));
      if (scan.status === "quarantined") return jsonError("الملف محجور لأسباب أمنية", 422);
      if (scan.status !== "clean") return jsonError("الملف ما زال قيد الفحص الأمني. حاول بعد قليل.", 423);
    }
    const requestedConversationId = Math.floor(Number(payload.conversationId));
    let conversation = await ownedConversation(user.id, requestedConversationId || file.conversationId || 0);
    if ((requestedConversationId || file.conversationId) && !conversation) return jsonError("المحادثة غير موجودة", 404);
    if (!conversation) {
      const now = new Date().toISOString();
      [conversation] = await getDb().insert(aiConversations).values({ userId: user.id, title: file.originalName.slice(0, 100), kind: action, status: "active", createdAt: now, updatedAt: now }).returning();
      await getDb().update(aiFiles).set({ conversationId: conversation.id, updatedAt: now }).where(eq(aiFiles.id, file.id));
    }
    const releaseAction = tryAcquireAiFileAction(user.id);
    if (!releaseAction) return jsonError("توجد معالجة ملف أخرى قيد التنفيذ. انتظر اكتمالها ثم أعد المحاولة.", 429);
    let reservation: Awaited<ReturnType<typeof beginAiUsage>> | null = null;
    let providerStarted = false;
    try {
      reservation = await beginAiUsage({ requestId: clientAiRequestId(user.id, requestId, payload.requestId), user, service: action, conversationId: conversation.id, fileId: file.id });
      const bytes = await readAiFileBytes(file, reservation.config.maxFileBytes);
      if (action === "quiz") {
        const questionCount = Math.max(5, Math.min(20, Math.floor(Number(payload.questionCount)) || 10));
        const language = cleanText(payload.language, 60) || "العربية";
        providerStarted = true;
        const generated = await generateFileQuiz({ config: reservation.config as AiServiceConfig, bytes, contentType: file.contentType, originalName: file.originalName, questionCount, language });
        const saved = await getDb().transaction(async (tx) => {
          const now = new Date().toISOString();
          const [quiz] = await tx.insert(aiQuizzes).values({ userId: user.id, conversationId: conversation!.id, fileId: file.id, title: generated.quiz.title, language, questionsJson: JSON.stringify(generated.quiz.questions), model: generated.result.model, createdAt: now, updatedAt: now }).returning();
          const [message] = await tx.insert(aiMessages).values({ conversationId: conversation!.id, userId: user.id, role: "assistant", service: "quiz", content: `أنشأت لك اختبار «${generated.quiz.title}» من ${generated.quiz.questions.length} أسئلة.`, fileId: file.id, model: generated.result.model, usageJson: JSON.stringify({ inputTokens: generated.result.inputTokens, outputTokens: generated.result.outputTokens, quizId: quiz.id }), createdAt: now }).returning();
          await tx.update(aiConversations).set({ title: generated.quiz.title, kind: "quiz", updatedAt: now }).where(eq(aiConversations.id, conversation!.id));
          return { quiz, message };
        });
        await finishAiUsage({ eventId: reservation.eventId, status: "succeeded", keyId: generated.result.keyId, model: generated.result.model, inputTokens: generated.result.inputTokens, outputTokens: generated.result.outputTokens });
        return aiJson({ ok: true, action, quiz: quizPayload(saved.quiz), message: messagePayload(saved.message), usage: usagePayload({ service: action, ...reservation }), deepLink: aiDeepLinks({ conversationId: conversation.id, quizId: saved.quiz.id }).quiz });
      }
      const targetLanguage = cleanText(payload.targetLanguage, 60) || "العربية";
      providerStarted = true;
      const generated = await generateFileArtifact({ action, config: reservation.config, bytes, contentType: file.contentType, originalName: file.originalName, targetLanguage });
      const title = action === "summary" ? `ملخص ${file.originalName}` : `ترجمة ${file.originalName} إلى ${targetLanguage}`;
      const saved = await getDb().transaction(async (tx) => {
        const now = new Date().toISOString();
        const [artifact] = await tx.insert(aiArtifacts).values({ userId: user.id, conversationId: conversation!.id, fileId: file.id, kind: action, title: title.slice(0, 180), content: generated.text, metadataJson: action === "translation" ? JSON.stringify({ targetLanguage }) : null, model: generated.model, createdAt: now }).returning();
        const [message] = await tx.insert(aiMessages).values({ conversationId: conversation!.id, userId: user.id, role: "assistant", service: action, content: generated.text, fileId: file.id, model: generated.model, usageJson: JSON.stringify({ inputTokens: generated.inputTokens, outputTokens: generated.outputTokens, artifactId: artifact.id }), createdAt: now }).returning();
        await tx.update(aiConversations).set({ title: title.slice(0, 120), kind: action, updatedAt: now }).where(eq(aiConversations.id, conversation!.id));
        return { artifact, message };
      });
      await finishAiUsage({ eventId: reservation.eventId, status: "succeeded", keyId: generated.keyId, model: generated.model, inputTokens: generated.inputTokens, outputTokens: generated.outputTokens });
      return aiJson({ ok: true, action, artifact: artifactPayload(saved.artifact), message: messagePayload(saved.message), usage: usagePayload({ service: action, ...reservation }), deepLink: aiDeepLinks({ conversationId: conversation.id }).conversation });
    } catch (error) {
      if (reservation) await finishAiUsage({ eventId: reservation.eventId, status: "failed", billable: providerStarted, errorCode: error instanceof Error ? error.name : "UNKNOWN" }).catch(() => undefined);
      return aiError(error);
    } finally {
      releaseAction();
    }
  });
}
