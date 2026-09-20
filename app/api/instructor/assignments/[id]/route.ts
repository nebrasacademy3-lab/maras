import { getDb } from "@/db";
import { checkRateLimit, getSessionUser } from "@/lib/auth";
import { instructorActor, instructorOwner, InstructorError } from "@/lib/instructor-security";
import { instructorApiError, instructorWriteRequest, INSTRUCTOR_PRIVATE_HEADERS } from "@/lib/instructor-onboarding";
import { authorizedInstructorAssignment, editInstructorAssignment, instructorAssignmentDetail, instructorAssignmentId } from "@/lib/instructor-assignments";
import { readBoundedJsonObject } from "@/lib/request-body";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
 try {
  const session = await getSessionUser(request), admin = session?.role === "admin" && session.isPlatformOwner;
  const user = admin ? await instructorOwner(request) : await instructorActor(request);
  if (!await checkRateLimit("instructor-assignment-read", String(user.id), 90, 60)) throw new InstructorError("طلبات كثيرة", 429);
  const db = getDb(), assignment = await authorizedInstructorAssignment(db, instructorAssignmentId((await context.params).id), admin ? null : user.id, { requireActive: !admin });
  return Response.json({ ok: true, ...await instructorAssignmentDetail(db, assignment) }, { headers: INSTRUCTOR_PRIVATE_HEADERS });
 } catch (error) { return instructorApiError(error); }
}
export async function POST(request: Request, context: Context) {
 try {
  instructorWriteRequest(request); const user = await instructorActor(request);
  if (!await checkRateLimit("instructor-assignment-edit", String(user.id), 60, 60)) throw new InstructorError("محاولات كثيرة", 429);
  const body = await readBoundedJsonObject(request, 16 * 1024), id = instructorAssignmentId((await context.params).id);
  const result = await getDb().transaction(tx => editInstructorAssignment(tx, user.id, id, body));
  return Response.json({ ok: true, ...result }, { headers: INSTRUCTOR_PRIVATE_HEADERS });
 } catch (error) { return instructorApiError(error); }
}
