import { and, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { courseAccess } from "@/db/schema";
import { checkRateLimit, clientIp, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";
import { getCourseCatalog } from "@/lib/catalog-store";
import { createVideoToken } from "@/lib/video-token";

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
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

  const email = viewer?.email || "";
  if (!lesson.free) {
    if (!email) return jsonError("سجّل الدخول لمشاهدة هذا الدرس", 401);
    const now = new Date().toISOString();
    const [access] = await getDb().select({ id: courseAccess.id }).from(courseAccess).where(and(
      eq(courseAccess.userEmail, email),
      eq(courseAccess.courseSlug, courseSlug),
      isNull(courseAccess.revokedAt),
      or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, now)),
    )).limit(1);
    if (!access) return jsonError("لا توجد صلاحية نشطة لهذه المادة", 403);
  }

  const expiresAt = Date.now() + 30 * 60 * 1000;
  const token = await createVideoToken({ courseSlug, lessonId, email: email || "preview", expiresAt }, secret);
  return Response.json({
    ok: true,
    expiresAt: new Date(expiresAt).toISOString(),
    streamUrl: `/api/video/${encodeURIComponent(lessonId)}?course=${encodeURIComponent(courseSlug)}&token=${encodeURIComponent(token)}`,
  }, { headers: { "cache-control": "no-store" } });
}
