import { checkRateLimit } from "@/lib/auth";
import { instructorActor } from "@/lib/instructor-security";
import { listInstructorContracts } from "@/lib/instructor-contracts";
import { instructorApiError, INSTRUCTOR_PRIVATE_HEADERS } from "@/lib/instructor-onboarding";
import { jsonError } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
 try { const user = await instructorActor(request);
  if (!await checkRateLimit("instructor-contract-read", String(user.id), 60, 60)) return jsonError("طلبات كثيرة؛ حاول لاحقاً",429);
  return Response.json({ok:true,contracts:await listInstructorContracts(user.id,false)}, {headers:INSTRUCTOR_PRIVATE_HEADERS});
 } catch(error) { return instructorApiError(error); }
}
