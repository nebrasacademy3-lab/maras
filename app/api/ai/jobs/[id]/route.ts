import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiFileJobs, aiFiles } from "@/db/schema";
import { checkRateLimit, getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { aiError, aiJson } from "@/lib/ai-api";
import { studyReadAccess } from "@/lib/study-output-access";
import { fileJobPayload } from "@/lib/ai-file-jobs";
import { isNativeAppRequest } from "@/lib/mobile-api";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول لمتابعة الطلب", 401);
  if (!await checkRateLimit("ai-job-read", `user:${user.id}`, 40, 60)) return jsonError("طلبات متابعة كثيرة. حاول بعد قليل.", 429);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return jsonError("معرّف الطلب غير صالح");
  const access = await studyReadAccess(user.id, isNativeAppRequest(request) ? "app" : "web");
  const [row] = await getDb().select({ job: aiFileJobs, file: aiFiles }).from(aiFileJobs).innerJoin(aiFiles, eq(aiFileJobs.fileId, aiFiles.id)).where(and(eq(aiFileJobs.id, id), eq(aiFileJobs.userId, user.id), eq(aiFiles.userId, user.id), access.file)).limit(1);
  if (!row) return jsonError("الطلب غير موجود", 404);
  try {
    return aiJson({ ok: true, job: fileJobPayload(row.job) }, { headers: { "retry-after": "5" } });
  } catch (error) { return aiError(error); }
}
