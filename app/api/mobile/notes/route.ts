import { and, asc, count, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { courseAccess, lessonNotes, lessonsDb } from "@/db/schema";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";
import { activeCourseAccessWhere } from "@/lib/course-access";
import { isMobileRequest, mobileNoStoreHeaders } from "@/lib/mobile-api";

const MAX_NOTES_PER_LESSON = 500;

function trustedWrite(request: Request) {
  return isMobileRequest(request) || sameOriginRequest(request);
}

async function authorizedLesson(userEmail: string, lessonId: string) {
  const db = getDb();
  const [lesson] = await db.select({ id: lessonsDb.id, courseSlug: lessonsDb.courseSlug, freePreview: lessonsDb.freePreview, durationSeconds: lessonsDb.durationSeconds }).from(lessonsDb).where(and(eq(lessonsDb.id, lessonId), eq(lessonsDb.status, "published"))).limit(1);
  if (!lesson) return null;
  if (lesson.freePreview) return lesson;
  const [access] = await db.select({ id: courseAccess.id }).from(courseAccess).where(activeCourseAccessWhere(userEmail, lesson.courseSlug)).limit(1);
  return access ? lesson : null;
}

function noteTime(value: unknown, durationSeconds = 0) {
  const parsed = Math.floor(Number(value));
  const upper = durationSeconds > 0 ? durationSeconds : 24 * 60 * 60;
  return Number.isFinite(parsed) ? Math.max(0, Math.min(upper, parsed)) : 0;
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  const lessonId = cleanText(new URL(request.url).searchParams.get("lesson"), 120);
  if (!lessonId) return jsonError("الدرس مطلوب");
  if (!await authorizedLesson(user.email, lessonId)) return jsonError("لا توجد صلاحية نشطة لهذا الدرس", 403);
  const notes = await getDb().select().from(lessonNotes).where(and(eq(lessonNotes.userEmail, user.email), eq(lessonNotes.lessonId, lessonId))).orderBy(asc(lessonNotes.timestampSeconds), asc(lessonNotes.createdAt)).limit(MAX_NOTES_PER_LESSON);
  return Response.json({ ok: true, notes, note: notes[0] || null }, { headers: mobileNoStoreHeaders });
}

export async function POST(request: Request) {
  if (!trustedWrite(request)) return jsonError("مصدر الطلب غير صالح", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  if (!await checkRateLimit("lesson-note", `user:${user.id}`, 60, 60)) return jsonError("محاولات حفظ كثيرة. حاول بعد قليل.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات غير صالحة"); }
  const lessonId = cleanText(payload.lessonId, 120);
  const body = cleanText(payload.body, 4000);
  if (!lessonId) return jsonError("الدرس مطلوب");
  if (!body) return jsonError("اكتب الملاحظة قبل حفظها");
  const lesson = await authorizedLesson(user.email, lessonId);
  if (!lesson) return jsonError("لا توجد صلاحية نشطة لهذا الدرس", 403);
  const now = new Date().toISOString();
  const note = await getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`lesson-note:${user.email}:${lessonId}`}))`);
    const [total] = await tx.select({ value: count() }).from(lessonNotes).where(and(eq(lessonNotes.userEmail, user.email), eq(lessonNotes.lessonId, lessonId)));
    if (Number(total?.value || 0) >= MAX_NOTES_PER_LESSON) return null;
    const [created] = await tx.insert(lessonNotes).values({
      userEmail: user.email,
      lessonId,
      body,
      timestampSeconds: noteTime(payload.timestampSeconds, lesson.durationSeconds),
      createdAt: now,
      updatedAt: now,
    }).returning();
    return created;
  });
  if (!note) return jsonError("وصلت إلى الحد الأقصى لملاحظات هذا الدرس. احذف ملاحظة قديمة قبل إضافة أخرى.", 409);
  return Response.json({ ok: true, note }, { status: 201, headers: mobileNoStoreHeaders });
}

export async function PATCH(request: Request) {
  if (!trustedWrite(request)) return jsonError("مصدر الطلب غير صالح", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  if (!await checkRateLimit("lesson-note", `user:${user.id}`, 60, 60)) return jsonError("محاولات حفظ كثيرة. حاول بعد قليل.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات غير صالحة"); }
  const id = Math.floor(Number(payload.id));
  const body = cleanText(payload.body, 4000);
  if (!Number.isSafeInteger(id) || id <= 0 || !body) return jsonError("الملاحظة غير صالحة");
  const [existing] = await getDb().select().from(lessonNotes).where(and(eq(lessonNotes.id, id), eq(lessonNotes.userEmail, user.email))).limit(1);
  if (!existing) return jsonError("الملاحظة غير موجودة", 404);
  const lesson = await authorizedLesson(user.email, existing.lessonId);
  if (!lesson) return jsonError("لا توجد صلاحية نشطة لهذا الدرس", 403);
  const now = new Date().toISOString();
  const [note] = await getDb().update(lessonNotes).set({ body, timestampSeconds: noteTime(payload.timestampSeconds ?? existing.timestampSeconds, lesson.durationSeconds), updatedAt: now }).where(and(eq(lessonNotes.id, id), eq(lessonNotes.userEmail, user.email))).returning();
  return Response.json({ ok: true, note }, { headers: mobileNoStoreHeaders });
}

export async function DELETE(request: Request) {
  if (!trustedWrite(request)) return jsonError("مصدر الطلب غير صالح", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  if (!await checkRateLimit("lesson-note-delete", `user:${user.id}`, 60, 60)) return jsonError("محاولات حذف كثيرة. حاول بعد قليل.", 429);
  let payload: Record<string, unknown> = {};
  try { payload = await request.json() as Record<string, unknown>; } catch { /* Query string remains supported. */ }
  const id = Math.floor(Number(payload.id || new URL(request.url).searchParams.get("id")));
  if (!Number.isSafeInteger(id) || id <= 0) return jsonError("الملاحظة غير صالحة");
  const [removed] = await getDb().delete(lessonNotes).where(and(eq(lessonNotes.id, id), eq(lessonNotes.userEmail, user.email))).returning({ id: lessonNotes.id });
  if (!removed) return jsonError("الملاحظة غير موجودة", 404);
  return Response.json({ ok: true, id: removed.id }, { headers: mobileNoStoreHeaders });
}

// Compatibility for older app builds that stored one lesson-wide note.
export async function PUT(request: Request) {
  if (!trustedWrite(request)) return jsonError("مصدر الطلب غير صالح", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  if (!await checkRateLimit("lesson-note", `user:${user.id}`, 60, 60)) return jsonError("محاولات حفظ كثيرة. حاول بعد قليل.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات غير صالحة"); }
  const lessonId = cleanText(payload.lessonId, 120);
  const body = cleanText(payload.body, 4000);
  const lesson = lessonId ? await authorizedLesson(user.email, lessonId) : null;
  if (!lesson) return jsonError("لا توجد صلاحية نشطة لهذا الدرس", 403);
  const [existing] = await getDb().select().from(lessonNotes).where(and(eq(lessonNotes.userEmail, user.email), eq(lessonNotes.lessonId, lessonId))).orderBy(asc(lessonNotes.createdAt)).limit(1);
  const now = new Date().toISOString();
  if (existing) {
    const [note] = await getDb().update(lessonNotes).set({ body, updatedAt: now }).where(eq(lessonNotes.id, existing.id)).returning();
    return Response.json({ ok: true, note }, { headers: mobileNoStoreHeaders });
  }
  const [note] = await getDb().insert(lessonNotes).values({ userEmail: user.email, lessonId, body, timestampSeconds: 0, createdAt: now, updatedAt: now }).returning();
  return Response.json({ ok: true, note }, { status: 201, headers: mobileNoStoreHeaders });
}
