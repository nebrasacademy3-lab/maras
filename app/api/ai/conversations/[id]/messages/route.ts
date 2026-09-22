import { studentWorkspaceRequirementResponse } from "@/lib/student-workspace-policy";
import { readBoundedJsonObject, RequestBodyTooLargeError } from "@/lib/request-body";
import { studyReadAccess } from "@/lib/study-output-access";
import { isNativeAppRequest } from "@/lib/mobile-api";
import { GeminiProviderError } from "@/lib/gemini-errors";
import { AiBusyError } from "@/lib/ai-work-control";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiConversations, aiMessages, users } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { aiDeepLinks, aiError, aiJson, clientAiRequestId, conversationPayload, messagePayload } from "@/lib/ai-api";
import { generateAiChat } from "@/lib/ai-generation";
import { AiPlatformError, beginAiUsage, finishAiUsage, usagePayload } from "@/lib/ai-platform";
import { observeRequest } from "@/lib/observability";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return observeRequest(request, "ai.chat.generate", async (requestId) => {
    if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
    const user = await getSessionUser(request);
    if (user?.role === "instructor") return studentWorkspaceRequirementResponse(user)!;
    if (!user) return jsonError("سجّل الدخول لاستخدام أدوات مراس", 401);
    if (!await checkRateLimit("ai-chat", `user:${user.id}`, 30, 60)) return jsonError("أرسلت رسائل كثيرة بسرعة. انتظر قليلًا.", 429);
    const { id: rawId } = await params;
    const conversationId = Number(rawId);
    if (!Number.isSafeInteger(conversationId) || conversationId <= 0) return jsonError("المحادثة غير صالحة");
    let payload: Record<string, unknown>;
    try { payload = await readBoundedJsonObject(request, 32 * 1024); } catch (error) { return jsonError("صيغة الرسالة غير صالحة", error instanceof RequestBodyTooLargeError ? 413 : 400); }
    const text = cleanText(payload.text, 8_000).replace(/\u0000/g, "");
    if (text.length < 2) return jsonError("اكتب سؤالًا واضحًا من كلمتين على الأقل");
    const access = await studyReadAccess(user.id, isNativeAppRequest(request) ? "app" : "web");
    const [conversation] = await getDb().select().from(aiConversations).where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, user.id), eq(aiConversations.status, "active"), access.conversation)).limit(1);
    if (!conversation) return jsonError("المحادثة غير موجودة", 404);
    const historyRows = await getDb().select().from(aiMessages).where(and(eq(aiMessages.conversationId, conversationId), eq(aiMessages.userId, user.id))).orderBy(desc(aiMessages.createdAt)).limit(18);
    let reservation: Awaited<ReturnType<typeof beginAiUsage>> | null = null;
    let providerStarted = false;
    let settled = false;
    try {
      reservation = await beginAiUsage({ requestId: clientAiRequestId(user.id, requestId, payload.requestId), user, service: "chat", conversationId });
      const now = new Date().toISOString();
      const [userMessage] = await getDb().insert(aiMessages).values({ conversationId, userId: user.id, role: "user", service: "chat", content: text, createdAt: now }).returning();
      providerStarted = true;
      const generated = await generateAiChat({ config: reservation.config, history: historyRows.reverse().map((row) => ({ role: row.role === "assistant" ? "assistant" : "user", content: row.content })), question: text });
      await finishAiUsage({ eventId: reservation.eventId, status: "succeeded", keyId: generated.keyId, model: generated.model, inputTokens: generated.inputTokens, outputTokens: generated.outputTokens, providerTier: generated.providerTier });
      settled = true;
      const finalAccess = await studyReadAccess(user.id, isNativeAppRequest(request) ? "app" : "web");
      const result = await getDb().transaction(async (tx) => {
        const [currentUser] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, user.id), eq(users.status, "active"))).limit(1).for("share");
        const [currentConversation] = await tx.select({ id: aiConversations.id }).from(aiConversations).where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, user.id), eq(aiConversations.status, "active"), finalAccess.conversation)).limit(1).for("update");
        if (!currentUser || !currentConversation) throw new AiPlatformError("AI_SOURCE_ACCESS", "لم يعد الحساب أو مصدر المحادثة متاحًا. لم تُنشر الإجابة.", 403);
        const [assistantMessage] = await tx.insert(aiMessages).values({ conversationId, userId: user.id, role: "assistant", service: "chat", content: generated.text, model: generated.model, usageJson: JSON.stringify({ inputTokens: generated.inputTokens, outputTokens: generated.outputTokens }), createdAt: new Date().toISOString() }).returning();
        const title = conversation.title === "محادثة جديدة" ? text.replace(/\s+/g, " ").slice(0, 64) : conversation.title;
        const [updated] = await tx.update(aiConversations).set({ title, updatedAt: new Date().toISOString() }).where(eq(aiConversations.id, conversationId)).returning();
        return { assistantMessage, updated };
      });
      return aiJson({
        ok: true,
        userMessage: messagePayload(userMessage),
        message: messagePayload(result.assistantMessage),
        usage: usagePayload({ service: "chat", ...reservation }),
        conversation: conversationPayload(result.updated, generated.text),
        deepLink: aiDeepLinks({ conversationId }).conversation,
      });
    } catch (error) {
      if (reservation && !settled) await finishAiUsage({ eventId: reservation.eventId, status: "failed", billable: providerStarted && !(error instanceof AiBusyError) && !(error instanceof GeminiProviderError && [400, 401, 403, 404, 429].includes(error.providerStatus)), errorCode: error instanceof Error ? error.name : "UNKNOWN" }).catch(() => undefined);
      return aiError(error);
    }
  });
}
