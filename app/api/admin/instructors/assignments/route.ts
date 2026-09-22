import { getDb } from "@/db";
import { instructorAdmin, InstructorError } from "@/lib/instructor-security";
import { checkRateLimit } from "@/lib/auth";
import { readBoundedJsonObject } from "@/lib/request-body";
import { instructorApiError, instructorWriteRequest, INSTRUCTOR_PRIVATE_HEADERS } from "@/lib/instructor-onboarding";
import { createInstructorAssignment, instructorAssignmentId, instructorAssignmentSummaries } from "@/lib/instructor-assignments";
export async function GET(request: Request) {
 try {
  const user = await instructorAdmin(request);
  if (!await checkRateLimit("instructor-admin-assignments", String(user.id), 60, 60)) throw new InstructorError("طلبات كثيرة", 429);
  const userId = instructorAssignmentId(new URL(request.url).searchParams.get("userId"));
  return Response.json({ ok: true, assignments: await instructorAssignmentSummaries(getDb(), userId) }, { headers: INSTRUCTOR_PRIVATE_HEADERS });
 } catch (error) { return instructorApiError(error); }
}
export async function POST(request: Request) {
 try {
  instructorWriteRequest(request); const user = await instructorAdmin(request, true);
  if (!await checkRateLimit("instructor-admin-assignments-write", String(user.id), 30, 60)) throw new InstructorError("طلبات كثيرة", 429);
  const body = await readBoundedJsonObject(request, 16 * 1024);
  if (body.action !== "create") throw new InstructorError("الإجراء غير صالح");
  const assignment = await getDb().transaction(tx => createInstructorAssignment(tx, user.id, body));
  return Response.json({ ok: true, assignment }, { status: 201, headers: INSTRUCTOR_PRIVATE_HEADERS });
 } catch (error) { return instructorApiError(error); }
}
