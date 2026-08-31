import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { courseAccess, lessonsDb, videoAssets } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { contentViewModeError, getContentViewMode } from "@/lib/platform-settings";
import { verifyVideoToken } from "@/lib/video-token";
import { getObject } from "@/lib/storage";
import { activeCourseAccessWhere } from "@/lib/course-access";

type RouteContext = { params: Promise<{ lessonId: string }> };

function requestedRange(value: string | null, sizeBytes: number) {
  if (!value) return { range: undefined as { offset: number; length: number } | undefined };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return { invalid: true as const };
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { invalid: true as const };
    start = Math.max(0, sizeBytes - suffixLength);
    end = sizeBytes - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), sizeBytes - 1) : sizeBytes - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= sizeBytes || end < start) return { invalid: true as const };
  return { range: { offset: start, length: end - start + 1 } };
}

async function serveVideo(request: Request, context: RouteContext, headOnly: boolean) {
  const secret = process.env.VIDEO_SIGNING_SECRET?.trim();
  if (!secret) return jsonError("بث الفيديو غير مفعّل", 503);
  const lessonId = cleanText((await context.params).lessonId, 120);
  const url = new URL(request.url);
  const courseSlug = cleanText(url.searchParams.get("course"), 120);
  const grant = await verifyVideoToken(cleanText(url.searchParams.get("token"), 4096), secret);
  if (!grant || grant.lessonId !== lessonId || grant.courseSlug !== courseSlug) return jsonError("رابط المشاهدة منتهي أو غير صالح", 403);

  const db = getDb();
  const [lesson] = await db.select({ freePreview: lessonsDb.freePreview, videoAssetId: lessonsDb.videoAssetId }).from(lessonsDb).where(and(eq(lessonsDb.id, lessonId), eq(lessonsDb.courseSlug, courseSlug), eq(lessonsDb.status, "published"))).limit(1);
  if (!lesson) return jsonError("الدرس غير موجود", 404);
  if (!lesson.freePreview) {
    let mode;
    try { mode = await getContentViewMode(); }
    catch { return jsonError("تعذر التحقق من سياسة المشاهدة حاليًا. حاول مجددًا بعد قليل.", 503); }
    const policyError = contentViewModeError(mode, grant.client === "app" ? "app" : "web");
    if (policyError) return jsonError(policyError, 403);
    if (grant.email === "preview") return jsonError("انتهت صلاحية المعاينة المجانية لهذا الدرس", 403);
  }

  if (!lesson.freePreview && grant.email !== "preview") {
    const user = await getSessionUser(request);
    if (!user) return jsonError("سجّل الدخول لمتابعة هذا الفيديو", 401);
    if (user.email !== grant.email) return jsonError("جلسة المشاهدة لا تخص هذا الحساب", 403);
    const [access] = await db.select({ id: courseAccess.id }).from(courseAccess).where(activeCourseAccessWhere(grant.email, courseSlug)).limit(1);
    if (!access) return jsonError("انتهت صلاحية الوصول إلى هذه المادة", 403);
  }

  const [asset] = lesson.videoAssetId
    ? await db.select().from(videoAssets).where(and(eq(videoAssets.id, lesson.videoAssetId), eq(videoAssets.courseSlug, courseSlug), eq(videoAssets.lessonId, lessonId), eq(videoAssets.status, "ready"))).limit(1)
    : await db.select().from(videoAssets).where(and(eq(videoAssets.courseSlug, courseSlug), eq(videoAssets.lessonId, lessonId), eq(videoAssets.status, "ready"))).orderBy(desc(videoAssets.createdAt)).limit(1);
  if (!asset) return jsonError("ملف الفيديو غير جاهز", 404);
  const parsed = requestedRange(request.headers.get("range"), asset.sizeBytes);
  if ("invalid" in parsed) return new Response(null, { status: 416, headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes */${asset.sizeBytes}` } });
  const range = parsed.range;
  const object = await getObject(asset.objectKey, headOnly ? { offset: 0, length: 1 } : range);
  if (!object) return jsonError("ملف الفيديو غير موجود", 404);

  const headers = new Headers();
  headers.set("Content-Type", asset.contentType);
  headers.set("Content-Disposition", "inline");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, no-store, no-transform, max-age=0");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Vary", "Range");
  headers.set("ETag", object.etag);
  if (range) {
    headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${asset.sizeBytes}`);
    headers.set("Content-Length", String(range.length));
  } else {
    headers.set("Content-Length", String(asset.sizeBytes));
  }
  return new Response(headOnly ? null : object.body as BodyInit, { status: range ? 206 : 200, headers });
}

export function GET(request: Request, context: RouteContext) {
  return serveVideo(request, context, false);
}

export function HEAD(request: Request, context: RouteContext) {
  return serveVideo(request, context, true);
}
