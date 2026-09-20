import { studyReadAccess } from "@/lib/study-output-access";
import { isNativeAppRequest } from "@/lib/mobile-api";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiQuizAttempts, aiQuizzes } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser } from "@/lib/auth";
import { aiDeepLinks, aiJson, quizPayload } from "@/lib/ai-api";
import { observeRequest } from "@/lib/observability";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return observeRequest(request, "ai.quiz.read", async () => {
    const user = await getSessionUser(request);
    if (!user) return jsonError("سجّل الدخول لاستخدام أدوات مراس", 401);
    if (!await checkRateLimit("ai-quiz-read", `user:${user.id}`, 120, 60)) return jsonError("طلبات كثيرة. حاول بعد قليل.", 429);
    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0) return jsonError("معرّف الاختبار غير صالح", 400);
    const access = await studyReadAccess(user.id, isNativeAppRequest(request) ? "app" : "web");
    const [quiz] = await getDb().select().from(aiQuizzes).where(and(eq(aiQuizzes.id, id), eq(aiQuizzes.userId, user.id), access.quiz)).limit(1);
    if (!quiz) return jsonError("الاختبار غير موجود", 404);
    const attempts = await getDb().select().from(aiQuizAttempts).where(and(eq(aiQuizAttempts.quizId, id), eq(aiQuizAttempts.userId, user.id))).orderBy(desc(aiQuizAttempts.createdAt)).limit(30);
    return aiJson({ ok: true, quiz: quizPayload(quiz, attempts), deepLink: aiDeepLinks({ conversationId: quiz.conversationId, quizId: quiz.id }).quiz });
  });
}
