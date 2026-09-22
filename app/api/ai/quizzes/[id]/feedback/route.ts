import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiQuizzes } from "@/db/schema";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { aiJson, aiError, storedQuizQuestions } from "@/lib/ai-api";
import { AiPlatformError } from "@/lib/ai-platform";
import { studyReadAccess } from "@/lib/study-output-access";
import { isNativeAppRequest } from "@/lib/mobile-api";
import { gradeStudyQuiz } from "@/lib/study-quiz-grading";
import { readBoundedJsonObject } from "@/lib/request-body";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!sameOriginRequest(request)) throw new AiPlatformError("AI_ORIGIN", "مصدر الطلب غير صالح", 403);
    const user = await getSessionUser(request);
    if (!user || user.role === "instructor") throw new AiPlatformError("AI_LOGIN", "سجّل الدخول بحساب الطالب", 403);
    if (!await checkRateLimit("quiz-feedback", String(user.id), 60, 60)) throw new AiPlatformError("AI_RATE", "انتظر قليلًا قبل مراجعة المزيد", 429);
    const id = Number((await params).id), body = await readBoundedJsonObject(request, 4096);
    if (!Number.isSafeInteger(id) || id < 1 || typeof body.questionId !== "string" || typeof body.choiceIndex !== "number" || !Number.isInteger(body.choiceIndex) || body.choiceIndex < 0 || body.choiceIndex > 3) throw new AiPlatformError("AI_ANSWER", "اختر إجابة صالحة أولًا", 400);
    const access = await studyReadAccess(user.id, isNativeAppRequest(request) ? "app" : "web");
    const [quiz] = await getDb().select().from(aiQuizzes).where(and(eq(aiQuizzes.id, id), eq(aiQuizzes.userId, user.id), access.quiz)).limit(1);
    if (!quiz) throw new AiPlatformError("AI_QUIZ", "الاختبار أو ملفه غير متاح", 404);
    const question = storedQuizQuestions(quiz).find(q => q.id === body.questionId);
    if (!question) throw new AiPlatformError("AI_QUESTION", "السؤال غير موجود", 404);
    const { results } = gradeStudyQuiz([question], [{ questionId: body.questionId, choiceIndex: body.choiceIndex }]);
    return aiJson({ result: results[0], practice: true });
  } catch (error) { return aiError(error); }
}
