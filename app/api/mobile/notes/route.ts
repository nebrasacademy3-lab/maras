import { and, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { courseAccess, lessonNotes, lessonsDb } from "@/db/schema";
import { checkRateLimit, getSessionUser } from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";
import { isMobileRequest, mobileNoStoreHeaders } from "@/lib/mobile-api";

async function authorizedLesson(userEmail: string, lessonId: string) {
  const db = getDb();
  const [lesson] = await db.select({ id: lessonsDb.id, courseSlug: lessonsDb.courseSlug, freePreview: lessonsDb.freePreview }).from(lessonsDb).where(and(eq(lessonsDb.id, lessonId), eq(lessonsDb.status, "published"))).limit(1);
  if (!lesson) return null;
  if (lesson.freePreview) return lesson;
  const [access] = await db.select({ id: courseAccess.id }).from(courseAccess).where(and(
    eq(courseAccess.userEmail, userEmail), eq(courseAccess.courseSlug, lesson.courseSlug), isNull(courseAccess.revokedAt),
    or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, new Date().toISOString())),
  )).limit(1);
  return access ? lesson : null;
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  const lessonId = cleanText(new URL(request.url).searchParams.get("lesson"), 120);
  if (!lessonId) return jsonError("الدرس مطلوب");
  if (!await authorizedLesson(user.email, lessonId)) return jsonError("لا توجد صلاحية نشطة لهذا الدرس", 403);
  const [note] = await getDb().select().from(lessonNotes).where(and(eq(lessonNotes.userEmail, user.email), eq(lessonNotes.lessonId, lessonId))).limit(1);
  return Response.json({ ok: true, note: note || null }, { headers: mobileNoStoreHeaders });
}

export async function PUT(request: Request) {
  if (!isMobileRequest(request)) return jsonError("طلب تطبيق غير صالح", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  if (!await checkRateLimit("lesson-note", `user:${user.id}`, 60, 60)) return jsonError("محاولات حفظ كثيرة. حاول بعد قليل.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات غير صالحة"); }
  const lessonId = cleanText(payload.lessonId, 120);
  const body = cleanText(payload.body, 8000);
  if (!lessonId) return jsonError("الدرس مطلوب");
  if (!await authorizedLesson(user.email, lessonId)) return jsonError("لا توجد صلاحية نشطة لهذا الدرس", 403);
  const now = new Date().toISOString();
  await getDb().insert(lessonNotes).values({ userEmail: user.email, lessonId, body, updatedAt: now }).onConflictDoUpdate({ target: [lessonNotes.userEmail, lessonNotes.lessonId], set: { body, updatedAt: now } });
  return Response.json({ ok: true, updatedAt: now }, { headers: mobileNoStoreHeaders });
}
