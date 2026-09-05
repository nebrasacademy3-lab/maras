import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiQuizAttempts, aiQuizzes } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { aiDeepLinks, aiJson, storedQuizQuestions } from "@/lib/ai-api";
import { observeRequest } from "@/lib/observability";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return observeRequest(request, "ai.quiz.attempt", async () => {
    if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
    const user = await getSessionUser(request);
    if (!user) return jsonError("سجّل الدخول لاستخدام أدوات مراس", 401);
    if (!await checkRateLimit("ai-quiz-attempt", `user:${user.id}`, 60, 60)) return jsonError("محاولات كثيرة. انتظر قليلًا.", 429);
    const { id: rawId } = await params;
    const id = Math.floor(Number(rawId));
    const [quiz] = await getDb().select().from(aiQuizzes).where(and(eq(aiQuizzes.id, id), eq(aiQuizzes.userId, user.id))).limit(1);
    if (!quiz) return jsonError("الاختبار غير موجود", 404);
    let payload: Record<string, unknown>;
    try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("إجابات الاختبار غير صالحة"); }
    if (!Array.isArray(payload.answers)) return jsonError("أرسل إجابات الاختبار");
    const answerMap = new Map<string, number>();
    for (const item of payload.answers.slice(0, 100)) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      const questionId = typeof row.questionId === "string" ? row.questionId.slice(0, 40) : "";
      const choiceIndex = Number(row.choiceIndex);
      if (questionId && Number.isInteger(choiceIndex) && choiceIndex >= 0 && choiceIndex <= 3) answerMap.set(questionId, choiceIndex);
    }
    const questions = storedQuizQuestions(quiz);
    if (!questions.length) return jsonError("تعذر قراءة أسئلة الاختبار", 500);
    const results = questions.map((question) => {
      const selectedIndex = answerMap.has(question.id) ? answerMap.get(question.id)! : null;
      return { questionId: question.id, selectedIndex, correctIndex: question.correctIndex, isCorrect: selectedIndex === question.correctIndex, explanation: question.explanation, translatedExplanation: question.translatedExplanation, scientificTerms: question.scientificTerms };
    });
    const score = results.filter((result) => result.isCorrect).length;
    const now = new Date().toISOString();
    const [attempt] = await getDb().insert(aiQuizAttempts).values({ quizId: quiz.id, userId: user.id, answersJson: JSON.stringify([...answerMap].map(([questionId, choiceIndex]) => ({ questionId, choiceIndex }))), score, total: questions.length, createdAt: now }).returning();
    return aiJson({ ok: true, attempt: { id: attempt.id, score, total: questions.length, percent: Math.round(score / questions.length * 100), createdAt: attempt.createdAt }, results, deepLink: aiDeepLinks({ conversationId: quiz.conversationId, quizId: quiz.id }).quiz }, { status: 201 });
  });
}
