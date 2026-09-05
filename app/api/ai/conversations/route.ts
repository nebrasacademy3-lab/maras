import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { aiConversations, aiMessages } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { aiDeepLinks, aiJson, conversationPayload } from "@/lib/ai-api";
import { observeRequest } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return observeRequest(request, "ai.conversations.list", async () => {
    const user = await getSessionUser(request);
    if (!user) return jsonError("سجّل الدخول لاستخدام أدوات مراس", 401);
    if (!await checkRateLimit("ai-conversations-read", `user:${user.id}`, 120, 60)) return jsonError("طلبات كثيرة. حاول بعد قليل.", 429);
    const rows = await getDb().select().from(aiConversations).where(and(eq(aiConversations.userId, user.id), eq(aiConversations.status, "active"))).orderBy(desc(aiConversations.updatedAt)).limit(100);
    const ids = rows.map((row) => row.id);
    const messages = ids.length ? await getDb().select({ conversationId: aiMessages.conversationId, content: aiMessages.content, createdAt: aiMessages.createdAt }).from(aiMessages).where(inArray(aiMessages.conversationId, ids)).orderBy(desc(aiMessages.createdAt)).limit(500) : [];
    const preview = new Map<number, string>();
    for (const message of messages) if (!preview.has(message.conversationId)) preview.set(message.conversationId, message.content);
    return aiJson({ ok: true, conversations: rows.map((row) => conversationPayload(row, preview.get(row.id) || "")), nextCursor: null, deepLinks: aiDeepLinks() });
  });
}

export async function POST(request: Request) {
  return observeRequest(request, "ai.conversations.create", async () => {
    if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
    const user = await getSessionUser(request);
    if (!user) return jsonError("سجّل الدخول لاستخدام أدوات مراس", 401);
    if (!await checkRateLimit("ai-conversations-write", `user:${user.id}`, 30, 60)) return jsonError("طلبات كثيرة. حاول بعد قليل.", 429);
    let payload: Record<string, unknown> = {};
    try { payload = await request.json() as Record<string, unknown>; } catch { /* An empty body creates a default conversation. */ }
    const title = cleanText(payload.title, 120) || "محادثة جديدة";
    const requestedKind = cleanText(payload.kind, 24);
    const kind = ["chat", "summary", "translation", "quiz"].includes(requestedKind) ? requestedKind : "chat";
    const now = new Date().toISOString();
    const [row] = await getDb().insert(aiConversations).values({ userId: user.id, title, kind, status: "active", createdAt: now, updatedAt: now }).returning();
    return aiJson({ ok: true, conversation: conversationPayload(row), deepLink: aiDeepLinks({ conversationId: row.id }).conversation }, { status: 201 });
  });
}
