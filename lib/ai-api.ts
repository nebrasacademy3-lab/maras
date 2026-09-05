import type { AiArtifactPayload, AiConversationSummary, AiFilePayload, AiMessagePayload, AiQuizPayload } from "@/lib/ai-contracts";
import { aiDeepLinks } from "@/lib/ai-contracts";
import type { aiArtifacts, aiConversations, aiFiles, aiMessages, aiQuizAttempts, aiQuizzes } from "@/db/schema";
import { AiPlatformError } from "@/lib/ai-platform";
import { publicQuizQuestion, type StoredQuizQuestion } from "@/lib/ai-generation";
import { jsonError } from "@/lib/api";

export function aiJson(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  return Response.json(value, { ...init, headers });
}

export function aiError(error: unknown) {
  if (error instanceof AiPlatformError) return jsonError(error.message, error.status);
  return jsonError("تعذر إكمال طلب أدوات مراس. حاول مرة أخرى.", 500);
}

export function clientAiRequestId(userId: number, requestId: string, supplied: unknown) {
  const raw = typeof supplied === "string" ? supplied.trim() : "";
  const safe = /^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,126}[A-Za-z0-9])?$/.test(raw) ? raw : requestId;
  return `u${userId}:${safe}`;
}

export function conversationPayload(row: typeof aiConversations.$inferSelect, preview = ""): AiConversationSummary {
  return { id: row.id, title: row.title, kind: row.kind, status: row.status, preview: preview.slice(0, 180), createdAt: row.createdAt, updatedAt: row.updatedAt };
}

export function messagePayload(row: typeof aiMessages.$inferSelect): AiMessagePayload {
  return { id: row.id, conversationId: row.conversationId, role: row.role === "assistant" ? "assistant" : "user", service: (row.service === "summary" || row.service === "translation" || row.service === "quiz" ? row.service : "chat"), content: row.content, fileId: row.fileId, model: row.model, createdAt: row.createdAt };
}

export function filePayload(row: typeof aiFiles.$inferSelect): AiFilePayload {
  return { id: row.id, conversationId: row.conversationId, originalName: row.originalName, contentType: row.contentType, sizeBytes: row.sizeBytes, status: row.status, scanStatus: row.scanStatus, createdAt: row.createdAt };
}

export function artifactPayload(row: typeof aiArtifacts.$inferSelect): AiArtifactPayload {
  return { id: row.id, conversationId: row.conversationId, fileId: row.fileId, kind: row.kind === "translation" ? "translation" : "summary", title: row.title, content: row.content, createdAt: row.createdAt };
}

function parseStoredQuestions(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as StoredQuizQuestion[] : [];
  } catch { return []; }
}

export function quizPayload(row: typeof aiQuizzes.$inferSelect, attempts: Array<typeof aiQuizAttempts.$inferSelect> = []): AiQuizPayload {
  return {
    id: row.id,
    conversationId: row.conversationId,
    fileId: row.fileId,
    title: row.title,
    language: row.language,
    questions: parseStoredQuestions(row.questionsJson).map(publicQuizQuestion),
    createdAt: row.createdAt,
    attempts: attempts.map((attempt) => ({ id: attempt.id, score: attempt.score, total: attempt.total, percent: attempt.total ? Math.round(attempt.score / attempt.total * 100) : 0, createdAt: attempt.createdAt })),
  };
}

export function storedQuizQuestions(row: typeof aiQuizzes.$inferSelect) {
  return parseStoredQuestions(row.questionsJson);
}

export { aiDeepLinks };
