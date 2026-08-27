import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { courseAccess, lessonProgress, lessonsDb } from "@/db/schema";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";
import { getCourseCatalog } from "@/lib/catalog-store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userEmail = (await getSessionUser(request))?.email || "";
  const courseSlug = cleanText(url.searchParams.get("course"), 120);
  if (!userEmail) return jsonError("سجّل الدخول لحفظ التقدم", 401);
  if (!courseSlug) return jsonError("المادة مطلوبة");
  const rows = await getDb().select().from(lessonProgress).where(and(eq(lessonProgress.userEmail, userEmail), eq(lessonProgress.courseSlug, courseSlug)));
  return Response.json({ ok: true, progress: rows });
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول لحفظ التقدم", 401);
  if (!await checkRateLimit("lesson-progress", `user:${user.id}`, 180, 60)) return jsonError("تحديثات كثيرة. حاول بعد قليل.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات التقدم غير صالحة"); }
  const courseSlug = cleanText(payload.courseSlug, 120);
  const lessonId = cleanText(payload.lessonId, 120);
  const watchedSeconds = Math.max(0, Math.min(86_400, Math.floor(Number(payload.watchedSeconds) || 0)));
  const course = await getCourseCatalog(courseSlug);
  const lesson = course?.units.flatMap((unit) => unit.lessons).find((item) => item.id === lessonId);
  if (!course || !lesson) return jsonError("تعذر مطابقة المادة أو الدرس");
  const db = getDb();
  const [lessonRow] = await db.select({ durationSeconds: lessonsDb.durationSeconds }).from(lessonsDb).where(and(eq(lessonsDb.id, lessonId), eq(lessonsDb.courseSlug, courseSlug), eq(lessonsDb.status, "published"))).limit(1);
  if (!lessonRow) return jsonError("الدرس غير منشور", 404);
  if (!lesson.free) {
    const [access] = await db.select({ id: courseAccess.id }).from(courseAccess).where(and(
      eq(courseAccess.userEmail, user.email), eq(courseAccess.courseSlug, courseSlug), isNull(courseAccess.revokedAt),
      or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, new Date().toISOString())),
    )).limit(1);
    if (!access) return jsonError("لا توجد صلاحية نشطة لهذه المادة", 403);
  }
  const completionThreshold = lessonRow.durationSeconds > 0 ? Math.max(5, Math.floor(lessonRow.durationSeconds * .85)) : 30;
  const completed = payload.completed === true && watchedSeconds >= completionThreshold;
  const now = new Date().toISOString();
  await db.insert(lessonProgress).values({ userEmail: user.email, courseSlug, lessonId, watchedSeconds, completed, updatedAt: now }).onConflictDoUpdate({
    target: [lessonProgress.userEmail, lessonProgress.lessonId],
    set: {
      watchedSeconds: sql`GREATEST(${lessonProgress.watchedSeconds}, ${watchedSeconds})`,
      completed: sql`${lessonProgress.completed} OR ${completed}`,
      updatedAt: now,
    },
  });
  return Response.json({ ok: true, savedAt: now });
}
