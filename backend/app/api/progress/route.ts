import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { lessonProgress } from "@/db/schema";
import { getSessionUser, sameOriginRequest } from "@/lib/auth";
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
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات التقدم غير صالحة"); }
  const userEmail = (await getSessionUser(request))?.email || "";
  const courseSlug = cleanText(payload.courseSlug, 120);
  const lessonId = cleanText(payload.lessonId, 120);
  const watchedSeconds = Math.max(0, Math.min(86_400, Math.floor(Number(payload.watchedSeconds) || 0)));
  const completed = payload.completed === true;
  const course = await getCourseCatalog(courseSlug);
  if (!userEmail) return jsonError("سجّل الدخول لحفظ التقدم", 401);
  if (!course || !course.units.some((unit) => unit.lessons.some((lesson) => lesson.id === lessonId))) return jsonError("تعذر مطابقة المادة أو الدرس");
  const now = new Date().toISOString();
  await getDb().insert(lessonProgress).values({ userEmail, courseSlug, lessonId, watchedSeconds, completed, updatedAt: now }).onConflictDoUpdate({
    target: [lessonProgress.userEmail, lessonProgress.lessonId],
    set: { watchedSeconds, completed, updatedAt: now },
  });
  return Response.json({ ok: true, savedAt: now });
}
