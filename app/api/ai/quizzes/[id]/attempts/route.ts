import { studentWorkspaceRequirementResponse } from "@/lib/student-workspace-policy";
import { readBoundedJsonObject, RequestBodyTooLargeError } from "@/lib/request-body";
import { gradeStudyQuiz } from "@/lib/study-quiz-grading";
import { studyReadAccess } from "@/lib/study-output-access";
import { isNativeAppRequest } from "@/lib/mobile-api";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiQuizzes } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { aiDeepLinks, aiJson, storedQuizQuestions } from "@/lib/ai-api";
import { observeRequest } from "@/lib/observability";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return observeRequest(request, "ai.quiz.attempt", async () => {
    if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
    const user = await getSessionUser(request);
    if (user?.role === "instructor") return studentWorkspaceRequirementResponse(user)!;
    if (!user) return jsonError("سجّل الدخول لاستخدام أدوات مراس", 401);
    if (!await checkRateLimit("ai-quiz-attempt", `user:${user.id}`, 60, 60)) return jsonError("محاولات كثيرة. انتظر قليلًا.", 429);
    const { id: rawId } = await params;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0) return jsonError("معرّف الاختبار غير صالح", 400);
    const access = await studyReadAccess(user.id, isNativeAppRequest(request) ? "app" : "web");
    const [quiz] = await getDb().select().from(aiQuizzes).where(and(eq(aiQuizzes.id, id), eq(aiQuizzes.userId, user.id), access.quiz)).limit(1);
    if (!quiz) return jsonError("الاختبار غير موجود", 404);
    let payload: Record<string, unknown>;
    try { payload = await readBoundedJsonObject(request, 16 * 1024); }
    catch (error) { return jsonError("إجابات الاختبار غير صالحة", error instanceof RequestBodyTooLargeError ? 413 : 400); }
    let graded: ReturnType<typeof gradeStudyQuiz>;
    try { graded = gradeStudyQuiz(storedQuizQuestions(quiz), payload.answers); }
    catch (error) { return jsonError(error instanceof TypeError ? "أرسل إجابات صالحة دون تكرار للأسئلة" : "تعذر قراءة أسئلة الاختبار", error instanceof TypeError ? 400 : 500); }
    const { results, score, total } = graded;
    const now = new Date().toISOString();
    // Authorization and the immutable question snapshot are checked in the
    // INSERT statement itself, not only before parsing/grading the request.
    const inserted = await getDb().execute(sql`INSERT INTO ai_quiz_attempts (quiz_id, user_id, answers_json, score, total, created_at)
      SELECT ${aiQuizzes.id}, ${user.id}, ${JSON.stringify(graded.answers)}, ${score}, ${total}, ${now}
      FROM ${aiQuizzes} WHERE ${and(eq(aiQuizzes.id, id), eq(aiQuizzes.userId, user.id), eq(aiQuizzes.questionsJson, quiz.questionsJson), access.quiz)}
      RETURNING id, created_at AS "createdAt"`);
    const attempt = inserted.rows[0];
    if (!attempt) return jsonError("لم يعد مصدر الاختبار متاحًا أو تغيّر الاختبار. حدّث الصفحة.", 409);
    return aiJson({ ok: true, attempt: { id: Number(attempt.id), score, total, percent: Math.round(score / total * 100), createdAt: String(attempt.createdAt) }, results, deepLink: aiDeepLinks({ conversationId: quiz.conversationId, quizId: quiz.id }).quiz }, { status: 201 });
  });
}
