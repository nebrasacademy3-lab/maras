import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { lessonsDb, videoAssets } from "@/db/schema";
import { instructorLessons, instructorUnits } from "@/db/instructor-schema";
import { checkRateLimit, getSessionUser } from "@/lib/auth";
import { instructorActor, instructorAdmin, InstructorError } from "@/lib/instructor-security";
import { instructorApiError, INSTRUCTOR_PRIVATE_HEADERS } from "@/lib/instructor-onboarding";
import { assertDraftAsset, authorizedInstructorAssignment, instructorAssignmentId } from "@/lib/instructor-assignments";
import { getObject } from "@/lib/storage";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; lessonId: string }> };
function requestedRange(value: string | null, size: number) {
 if (!value) return undefined;
 const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
 if (!match || (!match[1] && !match[2])) throw new InstructorError("نطاق الفيديو غير صالح", 416);
 const suffix = Number(match[2]), start = match[1] ? Number(match[1]) : Math.max(0, size - suffix), end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
 if ((!match[1] && (!Number.isSafeInteger(suffix) || suffix <= 0)) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) throw new InstructorError("نطاق الفيديو غير صالح", 416);
 return { offset: start, length: end - start + 1 };
}
async function serve(request: Request, context: Context) {
 try {
  const session = await getSessionUser(request), admin = (session?.role === "admin" && session.isPlatformOwner === true) || session?.role === "supervisor";
  const user = admin ? await instructorAdmin(request) : await instructorActor(request);
  if (!await checkRateLimit("instructor-video-preview", String(user.id), 240, 60)) throw new InstructorError("طلبات كثيرة", 429);
  const params = await context.params, db = getDb(), assignment = await authorizedInstructorAssignment(db, instructorAssignmentId(params.id), admin ? null : user.id, { requireActive: !admin });
  const [lesson] = await db.select().from(instructorLessons).where(eq(instructorLessons.id, instructorAssignmentId(params.lessonId))).limit(1);
  const [unit] = lesson ? await db.select({ id: instructorUnits.id }).from(instructorUnits).where(and(eq(instructorUnits.id, lesson.unitId), eq(instructorUnits.assignmentId, assignment.id))).limit(1) : [];
  if (!lesson?.videoAssetId || !unit) throw new InstructorError("الفيديو غير موجود في المهمة", 404);
  let asset;
  if (assignment.status === "published") {
   const publishedId = "instructor-" + assignment.id + "-lesson-" + lesson.id;
   const [published] = await db.select({ videoAssetId: lessonsDb.videoAssetId }).from(lessonsDb).where(and(eq(lessonsDb.id, publishedId), eq(lessonsDb.courseSlug, assignment.courseSlug), eq(lessonsDb.videoAssetId, lesson.videoAssetId))).limit(1);
   [asset] = published ? await db.select().from(videoAssets).where(and(eq(videoAssets.id, lesson.videoAssetId), eq(videoAssets.courseSlug, assignment.courseSlug), eq(videoAssets.lessonId, publishedId))).limit(1) : [];
  } else asset = await assertDraftAsset(db, assignment, lesson.id, lesson.videoAssetId);
  if (!asset || asset.status !== "ready" || !["video/mp4", "video/webm", "video/quicktime"].includes(asset.contentType) || !["local", "s3"].includes(asset.storageProvider)) throw new InstructorError("الفيديو غير متاح للمعاينة", 409);
  const range = requestedRange(request.headers.get("range"), asset.sizeBytes), head = request.method === "HEAD";
  const object = await getObject(asset.objectKey, head ? { offset: 0, length: 1 } : range, asset.storageProvider as "local" | "s3", request.signal);
  if (!object) throw new InstructorError("ملف الفيديو غير متاح", 404);
  const headers = new Headers({ ...INSTRUCTOR_PRIVATE_HEADERS, "content-type": asset.contentType, "content-disposition": "inline", "accept-ranges": "bytes", "content-length": String(range?.length || asset.sizeBytes), "referrer-policy": "no-referrer", "vary": "Range, Authorization, Cookie", "x-robots-tag": "noindex, noarchive" });
  if (range) headers.set("content-range", "bytes " + range.offset + "-" + (range.offset + range.length - 1) + "/" + asset.sizeBytes);
  if (head) await object.body.cancel();
  return new Response(head ? null : object.body, { status: range ? 206 : 200, headers });
 } catch (error) { return instructorApiError(error); }
}
export const GET = serve;
export const HEAD = serve;
