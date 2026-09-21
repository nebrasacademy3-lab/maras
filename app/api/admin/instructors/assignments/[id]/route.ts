import { getDb } from "@/db";
import { instructorOwner, InstructorError } from "@/lib/instructor-security";
import { checkRateLimit } from "@/lib/auth";
import { readBoundedJsonObject } from "@/lib/request-body";
import { invalidateCatalogCache } from "@/lib/catalog-store";
import { instructorApiError, instructorWriteRequest, INSTRUCTOR_PRIVATE_HEADERS } from "@/lib/instructor-onboarding";
import { instructorAssignmentId, reviewInstructorAssignment } from "@/lib/instructor-assignments";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
 try {
  instructorWriteRequest(request); const user = await instructorOwner(request, true);
  if (!await checkRateLimit("instructor-admin-assignment-review", String(user.id), 30, 60)) throw new InstructorError("طلبات كثيرة", 429);
  const body = await readBoundedJsonObject(request, 8 * 1024), id = instructorAssignmentId((await context.params).id);
  const result = await getDb().transaction(tx => reviewInstructorAssignment(tx, user.id, id, body));
  if (result.status === "published") invalidateCatalogCache();
  return Response.json({ ok: true, ...result }, { headers: INSTRUCTOR_PRIVATE_HEADERS });
 } catch (error) { return instructorApiError(error); }
}
