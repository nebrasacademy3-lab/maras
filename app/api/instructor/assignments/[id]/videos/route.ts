import { getDb } from "@/db";
import { checkRateLimit } from "@/lib/auth";
import { readBoundedJsonObject } from "@/lib/request-body";
import { InstructorError, instructorActor } from "@/lib/instructor-security";
import { instructorApiError, instructorRevision, instructorWriteRequest, INSTRUCTOR_PRIVATE_HEADERS } from "@/lib/instructor-onboarding";
import { instructorAssignmentId, instructorVideoNamespace } from "@/lib/instructor-assignments";
import { completeResumableVideo, expireResumableVideos, resumableVideoStatus, startResumableVideo, writeResumableVideoPart } from "@/lib/resumable-video-upload";
import { instructorAssignmentUploadAuthorization, instructorAssignmentUploadTarget } from "@/lib/instructor-assignment-upload";
import { ResumableUploadError } from "@/lib/resumable-upload-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
async function handle(request: Request, context: Context) {
 try {
  instructorWriteRequest(request); const user = await instructorActor(request), assignmentId = instructorAssignmentId((await context.params).id), db = getDb();
  if (!await checkRateLimit("instructor-video", String(user.id), 240, 60)) throw new InstructorError("طلبات رفع كثيرة", 429);
  const reauthorize = instructorAssignmentUploadAuthorization(db, user.id, assignmentId);
  const params = new URL(request.url).searchParams, uploadId = params.get("id") || "";
  let result;
  if (request.method === "GET") result = await resumableVideoStatus(db, user.id, uploadId, reauthorize);
  else if (request.method === "PUT") {
   const part = params.get("part"); if (part === null || !/^\d{1,2}$/.test(part)) throw new InstructorError("رقم الجزء غير صالح");
   result = await writeResumableVideoPart(db, user.id, uploadId, Number(part), request, reauthorize);
  } else if (request.method === "DELETE") {
   await resumableVideoStatus(db, user.id, uploadId, reauthorize); result = { cancelled: await expireResumableVideos(db, user.id, uploadId) };
  } else {
   const body = await readBoundedJsonObject(request, 16 * 1024), expectedRevision = instructorRevision(body.expectedRevision);
   const target = instructorAssignmentUploadTarget(assignmentId, expectedRevision);
   if (body.action === "start") {
    const lessonId = instructorAssignmentId(body.lessonId);
    result = await startResumableVideo(db, user.id, { ...instructorVideoNamespace(assignmentId, lessonId), contentType: body.contentType, sizeBytes: body.sizeBytes, hashes: body.hashes, requestKey: body.requestKey }, reauthorize, target);
   } else if (body.action === "complete" && typeof body.id === "string") {
    // Duration is determined by the worker, never by client-supplied claims.
    result = await completeResumableVideo(db, user.id, body.id, reauthorize, request.signal, 0, target);
   } else throw new InstructorError("إجراء الرفع غير صالح");
  }
  return Response.json({ ok: true, ...result }, { headers: INSTRUCTOR_PRIVATE_HEADERS });
 } catch (error) { if (error instanceof ResumableUploadError) return instructorApiError(new InstructorError(error.message, error.status)); return instructorApiError(error); }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
