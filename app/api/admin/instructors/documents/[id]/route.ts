import { GET as downloadDocument } from "@/app/api/instructor/documents/[id]/route";
import { instructorAdmin } from "@/lib/instructor-security";
import { instructorApiError } from "@/lib/instructor-onboarding";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
 try {
  // Keep this URL under the existing admin step-up cookie path.
  await instructorAdmin(request, true);
  return await downloadDocument(request, context);
 } catch (error) { return instructorApiError(error); }
}
