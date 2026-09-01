import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { courseAccess, lessonsDb, videoAssets } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { activeCourseAccessWhere } from "@/lib/course-access";
import { contentViewModeError, getContentViewMode } from "@/lib/platform-settings";
import { verifyVideoToken, type VideoGrant } from "@/lib/video-token";

type AuthorizedVideo = { ok: true; grant: VideoGrant; asset: typeof videoAssets.$inferSelect; freePreview: boolean };
type RejectedVideo = { ok: false; response: Response };

export async function authorizeVideoRequest(request: Request, lessonId: string, courseSlug: string, token: string): Promise<AuthorizedVideo | RejectedVideo> {
  const secret = process.env.VIDEO_SIGNING_SECRET?.trim();
  if (!secret) return { ok: false, response: jsonError("بث الفيديو غير مفعّل", 503) };
  const grant = await verifyVideoToken(token, secret);
  if (!grant || grant.lessonId !== lessonId || grant.courseSlug !== courseSlug) return { ok: false, response: jsonError("رابط المشاهدة منتهي أو غير صالح", 403) };

  const db = getDb();
  const [lesson] = await db.select({ freePreview: lessonsDb.freePreview, videoAssetId: lessonsDb.videoAssetId }).from(lessonsDb).where(and(eq(lessonsDb.id, lessonId), eq(lessonsDb.courseSlug, courseSlug), eq(lessonsDb.status, "published"))).limit(1);
  if (!lesson) return { ok: false, response: jsonError("الدرس غير موجود", 404) };
  if (!lesson.freePreview) {
    try {
      const policyError = contentViewModeError(await getContentViewMode(), grant.client === "app" ? "app" : "web");
      if (policyError) return { ok: false, response: jsonError(policyError, 403) };
    } catch { return { ok: false, response: jsonError("تعذر التحقق من سياسة المشاهدة حاليًا. حاول مجددًا بعد قليل.", 503) }; }
    if (grant.email === "preview") return { ok: false, response: jsonError("انتهت صلاحية المعاينة المجانية لهذا الدرس", 403) };
    const user = await getSessionUser(request);
    if (!user) return { ok: false, response: jsonError("سجّل الدخول لمتابعة هذا الفيديو", 401) };
    if (user.email !== grant.email) return { ok: false, response: jsonError("جلسة المشاهدة لا تخص هذا الحساب", 403) };
    const [access] = await db.select({ id: courseAccess.id }).from(courseAccess).where(activeCourseAccessWhere(grant.email, courseSlug)).limit(1);
    if (!access) return { ok: false, response: jsonError("انتهت صلاحية الوصول إلى هذه المادة", 403) };
  }

  const [asset] = lesson.videoAssetId
    ? await db.select().from(videoAssets).where(and(eq(videoAssets.id, lesson.videoAssetId), eq(videoAssets.courseSlug, courseSlug), eq(videoAssets.lessonId, lessonId), eq(videoAssets.status, "ready"))).limit(1)
    : await db.select().from(videoAssets).where(and(eq(videoAssets.courseSlug, courseSlug), eq(videoAssets.lessonId, lessonId), eq(videoAssets.status, "ready"))).orderBy(desc(videoAssets.createdAt)).limit(1);
  if (!asset) return { ok: false, response: jsonError("ملف الفيديو غير جاهز", 404) };
  return { ok: true, grant, asset, freePreview: lesson.freePreview };
}
