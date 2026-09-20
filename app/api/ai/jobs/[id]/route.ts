import { controlStudyJob, type StudyJobControl } from "@/lib/study-job-control";
import { readBoundedJsonObject } from "@/lib/request-body";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiFileJobs, aiFiles } from "@/db/schema";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول لإدارة الطلب", 401);
  if (!await checkRateLimit("ai-job-control", `user:${user.id}`, 30, 60)) return jsonError("طلبات تحكم كثيرة. حاول بعد قليل.", 429);
  let body: Record<string, unknown>;
  try { body = await readBoundedJsonObject(request, 1024); } catch { return jsonError("بيانات التحكم غير صالحة أو كبيرة جدًا"); }
  if (!["pause", "resume", "cancel"].includes(String(body.action)) || Object.keys(body).some(key=>key!=="action")) return jsonError("اختر إيقافًا مؤقتًا أو استئنافًا أو إلغاءً");
  try {
    const job = await controlStudyJob({ id: (await params).id, user, client: isNativeAppRequest(request) ? "app" : "web", action: body.action as StudyJobControl });
    return aiJson({ ok: true, job: fileJobPayload(job) });
  } catch (error) { return aiError(error); }
}
