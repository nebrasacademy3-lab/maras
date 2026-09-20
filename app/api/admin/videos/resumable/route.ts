import { getDb } from "@/db";
import { checkRateLimit, getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { isNativeAppRequest } from "@/lib/mobile-api";
import { supervisorCourseAllowed } from "@/lib/supervisor-data-scope";
import { readBoundedJsonObject, RequestBodyTooLargeError } from "@/lib/request-body";
import { invalidateCatalogCache } from "@/lib/catalog-store";
import { completeResumableVideo, expireResumableVideos, resumableVideoStatus, startResumableVideo, writeResumableVideoPart } from "@/lib/resumable-video-upload";
import { ResumableUploadError } from "@/lib/resumable-upload-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
  try {
    if (!sameOriginRequest(request) && !isNativeAppRequest(request)) throw new ResumableUploadError("مصدر الطلب غير صالح", 403);
    const user = await getSessionUser(request);
    if (!roleAllowed(user, ["admin", "supervisor"]) || !user) throw new ResumableUploadError("غير مصرح برفع الفيديو", 403);
    if (!await checkRateLimit("resumable-video", `user:${user.id}`, 240, 60)) throw new ResumableUploadError("طلبات رفع كثيرة؛ حاول بعد قليل", 429);
    const reauthorize = async (courseSlug: string) => {
      const current = await getSessionUser(request);
      if (!current || current.id !== user.id || !roleAllowed(current, ["admin", "supervisor"]) || !await supervisorCourseAllowed(current, courseSlug)) throw new ResumableUploadError("المادة خارج نطاق التفويض الحالي", 403);
      return current.id;
    };
    const db = getDb(), params = new URL(request.url).searchParams, id = params.get("id") || "";
    let result;
    if (request.method === "GET") result = await resumableVideoStatus(db, user.id, id, reauthorize);
    else if (request.method === "PUT") {
      const part = params.get("part");
      if (part === null || !/^\d{1,2}$/.test(part)) throw new ResumableUploadError("رقم الجزء غير صالح");
      result = await writeResumableVideoPart(db, user.id, id, Number(part), request, reauthorize);
    } else if (request.method === "DELETE") {
      await resumableVideoStatus(db, user.id, id, reauthorize);
      result = { cancelled: await expireResumableVideos(db, user.id, id) };
    } else {
      const body = await readBoundedJsonObject(request, 16 * 1024);
      if (body.ownerId !== undefined && body.ownerId !== user.id) throw new ResumableUploadError("تغيّر الحساب؛ أعد فتح صفحة الإدارة", 403);
      if (body.action === "start") result = await startResumableVideo(db, user.id, body, reauthorize);
      else if (body.action === "complete" && typeof body.id === "string") {
        result = await completeResumableVideo(db, user.id, body.id, reauthorize, request.signal, typeof body.durationSeconds === "number" ? body.durationSeconds : 0);
        invalidateCatalogCache();
      } else throw new ResumableUploadError("إجراء الرفع غير صالح");
    }
    return Response.json({ ok: true, ...result }, { headers });
  } catch (error) {
    const status = error instanceof ResumableUploadError ? error.status : error instanceof RequestBodyTooLargeError ? 413 : request.signal.aborted ? 408 : 503;
    const message = error instanceof ResumableUploadError ? error.message : status === 413 ? "حجم الجزء أكبر من المسموح" : "لم تكتمل العملية؛ يمكنك استئناف الرفع دون إعادة الأجزاء المكتملة";
    return Response.json({ ok: false, error: message }, { status, headers });
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
