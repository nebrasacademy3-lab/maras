import { getDb } from "@/db";
import { courseAccess } from "@/db/schema";
import { checkRateLimit, clientIp, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";
import { getCourseCatalog } from "@/lib/catalog-store";
import { isMobileRequest, isNativeAppRequest } from "@/lib/mobile-api";
import { contentViewModeError, getContentViewMode } from "@/lib/platform-settings";
import { createVideoToken } from "@/lib/video-token";
import { activeCourseAccessWhere } from "@/lib/course-access";

export async function POST(request: Request) {
  const nativeApp = isNativeAppRequest(request);
  if (!isMobileRequest(request) && !sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const secret = process.env.VIDEO_SIGNING_SECRET?.trim();
  if (!secret || secret.length < 24) return jsonError("بث الفيديو الخاص غير مفعّل بعد", 503);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات الجلسة غير صالحة"); }
  const courseSlug = cleanText(payload.courseSlug, 120);
  const lessonId = cleanText(payload.lessonId, 120);
  const viewer = await getSessionUser(request);
  const rateIdentity = viewer?.email || clientIp(request);
  if (!await checkRateLimit("video-session", rateIdentity, 60, 60)) return jsonError("طلبات مشاهدة كثيرة. حاول بعد قليل.", 429);
  const course = await getCourseCatalog(courseSlug);
  const lesson = course?.units.flatMap((unit) => unit.lessons).find((item) => item.id === lessonId);
  if (!course || !lesson) return jsonError("الدرس غير موجود", 404);

  if (!lesson.free) {
    let mode;
    try { mode = await getContentViewMode(); }
    catch { return jsonError("تعذر التحقق من سياسة المشاهدة حاليًا. حاول مجددًا بعد قليل.", 503); }
    const policyError = contentViewModeError(mode, nativeApp ? "app" : "web");
    if (policyError) return jsonError(policyError, 403);
  }

  const email = viewer?.email || "";
  if (!lesson.free) {
    if (!email) return jsonError("سجّل الدخول لمشاهدة هذا الدرس", 401);
    const [access] = await getDb().select({ id: courseAccess.id }).from(courseAccess).where(activeCourseAccessWhere(email, courseSlug)).limit(1);
    if (!access) return jsonError("لا توجد صلاحية نشطة لهذه المادة", 403);
  }

  const expiresAt = Date.now() + 30 * 60 * 1000;
  const tokenEmail = lesson.free ? "preview" : email;
  const token = await createVideoToken({ courseSlug, lessonId, email: tokenEmail, client: nativeApp ? "app" : "web", expiresAt }, secret);
  return Response.json({
    ok: true,
    expiresAt: new Date(expiresAt).toISOString(),
    streamUrl: `/api/video/${encodeURIComponent(lessonId)}?course=${encodeURIComponent(courseSlug)}&token=${encodeURIComponent(token)}`,
  }, { headers: { "cache-control": "no-store" } });
}
