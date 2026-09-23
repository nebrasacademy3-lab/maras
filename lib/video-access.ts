import { readPreviewProof } from "@/lib/video-preview-proof";
import { studentWorkspaceRequirementResponse } from "@/lib/student-workspace-policy";
import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { courseAccess, lessonsDb, videoAssets } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { getSessionUser, requestSessionToken, hashOpaqueToken } from "@/lib/auth";
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

  let user: Awaited<ReturnType<typeof getSessionUser>> = null;
  // A copied URL is insufficient: grants stay bound to the authenticated session or preview proof.
  if (grant.sessionHash || grant.viewerId) {
    const session = requestSessionToken(request), current = await getSessionUser(request);
    user = current;
    if (!session || !current) return {ok:false,response:jsonError("انتهت جلسة المشاهدة",401)};
    if (current.id !== grant.viewerId || !grant.sessionHash || await hashOpaqueToken(session) !== grant.sessionHash) return {ok:false,response:jsonError("الرابط لا يخص جلسة المشاهدة الحالية",403)};
  } else if (grant.previewProofHash) {
    const proof = readPreviewProof(request);
    if (!proof || await hashOpaqueToken(proof) !== grant.previewProofHash) return {ok:false,response:jsonError("أعد فتح المعاينة من مشغل مراس",403)};
  } else return {ok:false,response:jsonError("جدّد جلسة المشاهدة من مشغل مراس",403)};

  const db = getDb();
  const [lesson] = await db.select({ freePreview: lessonsDb.freePreview, videoAssetId: lessonsDb.videoAssetId }).from(lessonsDb).where(and(eq(lessonsDb.id, lessonId), eq(lessonsDb.courseSlug, courseSlug), eq(lessonsDb.status, "published"))).limit(1);
  if (!lesson) return { ok: false, response: jsonError("الدرس غير موجود", 404) };
  if (!lesson.freePreview) {
    try {
      const policyError = contentViewModeError(await getContentViewMode(), grant.client === "app" ? "app" : "web");
      if (policyError) return { ok: false, response: jsonError(policyError, 403) };
    } catch { return { ok: false, response: jsonError("تعذر التحقق من سياسة المشاهدة حاليًا. حاول مجددًا بعد قليل.", 503) }; }
    if (grant.email === "preview") return { ok: false, response: jsonError("انتهت صلاحية المعاينة المجانية لهذا الدرس", 403) };
    // The session was validated above for this request; keep revocation checks on every segment.

    if (!user) return { ok: false, response: jsonError("سجّل الدخول لمتابعة هذا الفيديو", 401) };
    if (user.role === "instructor") return { ok: false, response: studentWorkspaceRequirementResponse(user)! };
    if (user.email !== grant.email) return { ok: false, response: jsonError("جلسة المشاهدة لا تخص هذا الحساب", 403) };
    const [access] = await db.select({ id: courseAccess.id }).from(courseAccess).where(activeCourseAccessWhere(user.id, courseSlug)).limit(1);
    if (!access) return { ok: false, response: jsonError("انتهت صلاحية الوصول إلى هذه المادة", 403) };
  }

  const [asset] = lesson.videoAssetId
    ? await db.select().from(videoAssets).where(and(eq(videoAssets.id, lesson.videoAssetId), eq(videoAssets.courseSlug, courseSlug), eq(videoAssets.lessonId, lessonId), eq(videoAssets.status, "ready"))).limit(1)
    : await db.select().from(videoAssets).where(and(eq(videoAssets.courseSlug, courseSlug), eq(videoAssets.lessonId, lessonId), eq(videoAssets.status, "ready"))).orderBy(desc(videoAssets.createdAt)).limit(1);
  if (!asset) return { ok: false, response: jsonError("ملف الفيديو غير جاهز", 404) };
  return { ok: true, grant, asset, freePreview: lesson.freePreview };
}
