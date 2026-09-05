import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiArtifacts, aiConversations, aiFiles, aiMessages } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { aiJson, artifactPayload, conversationPayload, filePayload, messagePayload } from "@/lib/ai-api";
import { observeRequest } from "@/lib/observability";

function idFrom(params: Promise<{ id: string }>) {
  return params.then(({ id }) => Math.floor(Number(id)));
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return observeRequest(request, "ai.conversations.read", async () => {
    const user = await getSessionUser(request);
    if (!user) return jsonError("سجّل الدخول لاستخدام أدوات مراس", 401);
    if (!await checkRateLimit("ai-conversations-read", `user:${user.id}`, 120, 60)) return jsonError("طلبات كثيرة. حاول بعد قليل.", 429);
    const id = await idFrom(params);
    if (!Number.isInteger(id) || id <= 0) return jsonError("المحادثة غير صالحة", 400);
    const [conversation] = await getDb().select().from(aiConversations).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, user.id))).limit(1);
    if (!conversation) return jsonError("المحادثة غير موجودة", 404);
    const [messages, files, artifacts] = await Promise.all([
      getDb().select().from(aiMessages).where(and(eq(aiMessages.conversationId, id), eq(aiMessages.userId, user.id))).orderBy(asc(aiMessages.createdAt)).limit(500),
      getDb().select().from(aiFiles).where(and(eq(aiFiles.conversationId, id), eq(aiFiles.userId, user.id))).orderBy(asc(aiFiles.createdAt)).limit(100),
      getDb().select().from(aiArtifacts).where(and(eq(aiArtifacts.conversationId, id), eq(aiArtifacts.userId, user.id))).orderBy(asc(aiArtifacts.createdAt)).limit(100),
    ]);
    return aiJson({ ok: true, conversation: conversationPayload(conversation, messages.at(-1)?.content || ""), messages: messages.map(messagePayload), files: files.map(filePayload), artifacts: artifacts.map(artifactPayload) });
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return observeRequest(request, "ai.conversations.update", async () => {
    if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
    const user = await getSessionUser(request);
    if (!user) return jsonError("سجّل الدخول لاستخدام أدوات مراس", 401);
    if (!await checkRateLimit("ai-conversations-update", `user:${user.id}`, 40, 60)) return jsonError("تعديلات كثيرة. حاول بعد دقيقة.", 429);
    const id = await idFrom(params);
    let payload: Record<string, unknown>;
    try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("البيانات غير صالحة"); }
    const title = cleanText(payload.title, 120);
    if (!title) return jsonError("اكتب اسمًا للمحادثة");
    const [row] = await getDb().update(aiConversations).set({ title, updatedAt: new Date().toISOString() }).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, user.id))).returning();
    if (!row) return jsonError("المحادثة غير موجودة", 404);
    return aiJson({ ok: true, conversation: conversationPayload(row) });
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return observeRequest(request, "ai.conversations.archive", async () => {
    if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
    const user = await getSessionUser(request);
    if (!user) return jsonError("سجّل الدخول لاستخدام أدوات مراس", 401);
    if (!await checkRateLimit("ai-conversations-archive", `user:${user.id}`, 30, 60)) return jsonError("طلبات أرشفة كثيرة. حاول بعد دقيقة.", 429);
    const id = await idFrom(params);
    const [row] = await getDb().update(aiConversations).set({ status: "archived", updatedAt: new Date().toISOString() }).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, user.id))).returning({ id: aiConversations.id });
    if (!row) return jsonError("المحادثة غير موجودة", 404);
    return aiJson({ ok: true });
  });
}
