import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { courseAccess, videoAssets } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { verifyVideoToken } from "@/lib/video-token";
import { getObject } from "@/lib/storage";

export async function GET(request: Request, context: { params: Promise<{ lessonId: string }> }) {
  const secret = process.env.VIDEO_SIGNING_SECRET?.trim();
  if (!secret) return jsonError("بث الفيديو غير مفعّل", 503);
  const lessonId = cleanText((await context.params).lessonId, 120);
  const url = new URL(request.url);
  const courseSlug = cleanText(url.searchParams.get("course"), 120);
  const grant = await verifyVideoToken(cleanText(url.searchParams.get("token"), 4096), secret);
  if (!grant || grant.lessonId !== lessonId || grant.courseSlug !== courseSlug) return jsonError("رابط المشاهدة منتهي أو غير صالح", 403);

  if (grant.email !== "preview") {
    // The short-lived signed URL is the playback credential. Native players can also
    // send the session Bearer token; when present we bind it to the same account.
    // Browser/video elements cannot reliably attach custom headers to range requests,
    // so absence of a cookie/header must not break a valid signed stream URL.
    const user = await getSessionUser(request);
    if (user && user.email !== grant.email) return jsonError("جلسة المشاهدة لا تخص هذا الحساب", 403);
    const [access] = await getDb().select({ id: courseAccess.id }).from(courseAccess).where(and(
      eq(courseAccess.userEmail, grant.email), eq(courseAccess.courseSlug, courseSlug), isNull(courseAccess.revokedAt),
      or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, new Date().toISOString())),
    )).limit(1);
    if (!access) return jsonError("انتهت صلاحية الوصول إلى هذه المادة", 403);
  }

  const [asset] = await getDb().select().from(videoAssets).where(and(eq(videoAssets.courseSlug, courseSlug), eq(videoAssets.lessonId, lessonId), eq(videoAssets.status, "ready"))).orderBy(desc(videoAssets.createdAt)).limit(1);
  if (!asset) return jsonError("ملف الفيديو غير جاهز", 404);
  const rangeHeader = request.headers.get("range");
  let range: { offset: number; length: number } | undefined;
  if (rangeHeader) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
    if (!match) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${asset.sizeBytes}` } });
    const start = Number(match[1]);
    const end = match[2] ? Math.min(Number(match[2]), asset.sizeBytes - 1) : asset.sizeBytes - 1;
    if (start >= asset.sizeBytes || end < start) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${asset.sizeBytes}` } });
    range = { offset: start, length: end - start + 1 };
  }

  const object = await getObject(asset.objectKey, range);
  if (!object) return jsonError("ملف الفيديو غير موجود", 404);
  const headers = new Headers();
  headers.set("Content-Type", asset.contentType);
  headers.set("Content-Disposition", "inline");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("ETag", object.etag);
  if (range) {
    headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${asset.sizeBytes}`);
    headers.set("Content-Length", String(range.length));
  } else {
    headers.set("Content-Length", String(asset.sizeBytes));
  }
  return new Response(object.body as BodyInit, { status: range ? 206 : 200, headers });
}
