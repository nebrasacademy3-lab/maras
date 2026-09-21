import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { courseResources } from "@/db/schema";
import { checkRateLimit, getSessionUser } from "@/lib/auth";
import { instructorActor, instructorOwner, InstructorError } from "@/lib/instructor-security";
import { instructorApiError, INSTRUCTOR_PRIVATE_HEADERS } from "@/lib/instructor-onboarding";
import { authorizedInstructorAssignment, instructorAssignmentId } from "@/lib/instructor-assignments";
import { safeAttachmentDisposition } from "@/lib/course-resource-access";
import { getObject } from "@/lib/storage";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string; resourceId: string }> }) {
 try {
  const session = await getSessionUser(request), admin = session?.role === "admin" && session.isPlatformOwner;
  const user = admin ? await instructorOwner(request) : await instructorActor(request);
  if (!await checkRateLimit("instructor-resource-download", String(user.id), 40, 60)) throw new InstructorError("طلبات تنزيل كثيرة", 429);
  const params = await context.params, db = getDb(), assignment = await authorizedInstructorAssignment(db, instructorAssignmentId(params.id), admin ? null : user.id, { requireActive: !admin });
  const [resource] = await db.select().from(courseResources).where(and(eq(courseResources.id, instructorAssignmentId(params.resourceId)), eq(courseResources.courseSlug, assignment.courseSlug), eq(courseResources.status, "active"), eq(courseResources.scanStatus, "clean"))).limit(1);
  if (!resource) throw new InstructorError("الملف غير متاح في هذه المهمة", 404);
  const object = await getObject(resource.objectKey, undefined, undefined, request.signal);
  if (!object) throw new InstructorError("الملف غير متاح حاليًا", 404);
  return new Response(object.body, { headers: { ...INSTRUCTOR_PRIVATE_HEADERS, "content-type": resource.contentType, "content-disposition": safeAttachmentDisposition(resource.originalName), "content-length": String(object.size || resource.sizeBytes), "content-security-policy": "sandbox", "x-robots-tag": "noindex, noarchive", "vary": "Authorization, Cookie" } });
 } catch (error) { return instructorApiError(error); }
}
