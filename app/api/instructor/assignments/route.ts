import { getDb } from "@/db";
import { checkRateLimit } from "@/lib/auth";
import { instructorActor, InstructorError } from "@/lib/instructor-security";
import { instructorApiError, INSTRUCTOR_PRIVATE_HEADERS } from "@/lib/instructor-onboarding";
import { instructorAssignmentSummaries } from "@/lib/instructor-assignments";
export async function GET(request: Request) {
 try { const user = await instructorActor(request); if (!await checkRateLimit("instructor-assignments-list", String(user.id), 60, 60)) throw new InstructorError("طلبات كثيرة", 429); return Response.json({ ok: true, assignments: await instructorAssignmentSummaries(getDb(), user.id) }, { headers: INSTRUCTOR_PRIVATE_HEADERS }); }
 catch (error) { return instructorApiError(error); }
}
