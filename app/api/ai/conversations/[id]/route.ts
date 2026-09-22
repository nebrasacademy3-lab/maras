import { studentWorkspaceRequirementResponse } from "@/lib/student-workspace-policy";
import { readBoundedJsonObject, RequestBodyTooLargeError } from "@/lib/request-body";
import { studyReadAccess } from "@/lib/study-output-access";
import { isNativeAppRequest } from "@/lib/mobile-api";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiArtifacts, aiConversations, aiFiles, aiMessages } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { aiJson, artifactPayload, conversationPayload, filePayload, messagePayload } from "@/lib/ai-api";
import { observeRequest } from "@/lib/observability";

function idFrom(params: Promise<{ id: string }>) {
  return params.then(({ id }) => Number(id));
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return observeRequest(request, "ai.conversations.read", async () => {
    const user = await getSessionUser(request);
    if (user?.role === "instructor") return studentWorkspaceRequirementResponse(user)!;
    if (!user) return jsonError("سجّل الدخول لاستخدام أدوات مراس", 401);
    if (!await checkRateLimit("ai-conversations-read", `user:${user.id}`, 120, 60)) return jsonError("طلبات كثيرة. حاول بعد قليل.", 429);
    const id = await idFrom(params);
    if (!Number.isSafeInteger(id) || id <= 0) return jsonError("المحادثة غير صالحة", 400);
    const access = await studyReadAccess(user.id, isNativeAppRequest(request) ? "app" : "web");
    const [conversation] = await getDb().select().from(aiConversations).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, user.id), eq(aiConversations.status, "active"), access.conversation)).limit(1);
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
    if (user?.role === "instructor") return studentWorkspaceRequirementResponse(user)!;
    if (!user) return jsonError("سجّل الدخول لاستخدام أدوات مراس", 401);
    if (!await checkRateLimit("ai-conversations-update", `user:${user.id}`, 40, 60)) return jsonError("تعديلات كثيرة. حاول بعد دقيقة.", 429);
    const id = await idFrom(params);
    if (!Number.isSafeInteger(id) || id <= 0) return jsonError("المحادثة غير صالحة", 400);
    let payload: Record<string, unknown>;
    try { payload = await readBoundedJsonObject(request, 32 * 1024); } catch (error) { return jsonError("البيانات غير صالحة", error instanceof RequestBodyTooLargeError ? 413 : 400); }
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
    if (user?.role === "instructor") return studentWorkspaceRequirementResponse(user)!;
    if (!user) return jsonError("سجّل الدخول لاستخدام أدوات مراس", 401);
    if (!await checkRateLimit("ai-conversations-archive", `user:${user.id}`, 30, 60)) return jsonError("طلبات أرشفة كثيرة. حاول بعد دقيقة.", 429);
    const id = await idFrom(params);
    if (!Number.isSafeInteger(id) || id <= 0) return jsonError("المحادثة غير صالحة", 400);
    const [row] = await getDb().update(aiConversations).set({ status: "archived", updatedAt: new Date().toISOString() }).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, user.id))).returning({ id: aiConversations.id });
    if (!row) return jsonError("المحادثة غير موجودة", 404);
    return aiJson({ ok: true });
  });
}
