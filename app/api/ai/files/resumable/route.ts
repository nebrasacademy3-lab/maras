import { studentWorkspaceRequirementResponse } from "@/lib/student-workspace-policy";
import { getDb } from "@/db";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { aiError, aiJson } from "@/lib/ai-api";
import { readBoundedJsonObject, RequestBodyTooLargeError } from "@/lib/request-body";
import { startStudyUpload, studyUploadStatus, writeStudyUploadPart, completeStudyUpload, expireStudyUploads } from "@/lib/study-resumable-upload";
import { StudyUploadError } from "@/lib/study-upload-policy";
import { studyUploadLimits } from "@/lib/study-upload-quota";
export const runtime = "nodejs";
async function handle(request: Request) {
  try {
    if (!sameOriginRequest(request)) return aiJson({ error: "مصدر الطلب غير مصرح." }, { status: 403 });
    const user = await getSessionUser(request);
    if (user?.role === "instructor") return studentWorkspaceRequirementResponse(user)!;
    if (!user) return aiJson({ error: "سجّل الدخول لرفع الملف." }, { status: 401 });
    if (request.headers.get("x-meras-acting-user") !== String(user.id)) return aiJson({ error: "تغيّر الحساب أثناء الرفع." }, { status: 409 });
    const reauthorize = async () => { const current = await getSessionUser(request); return current?.role === "instructor" ? 0 : current?.id || 0; };
    const url = new URL(request.url), id = url.searchParams.get("id") || "";
    if (!await checkRateLimit("study-upload-parts", `user:${user.id}`, 180, 60)) return aiJson({ error: "أبطئ الطلبات وأعد المحاولة بعد قليل." }, { status: 429, headers: { "retry-after": "30" } });
    if (request.method === "GET") return aiJson(id ? await studyUploadStatus(getDb(), user, id, reauthorize) : { ownerId: user.id, ...await studyUploadLimits(user) });
    if (request.method === "PUT") return aiJson(await writeStudyUploadPart(getDb(), user, id, Number(url.searchParams.get("part") ?? "invalid"), request, reauthorize));
    if (request.method === "DELETE") return aiJson({ ok: true, expired: await expireStudyUploads(getDb(), user, id, reauthorize) });
    const body = await readBoundedJsonObject(request, 8192);
    if (body.action === "start") return aiJson(await startStudyUpload(getDb(), user, body, reauthorize));
    if (body.action === "complete" && typeof body.id === "string") return aiJson(await completeStudyUpload(getDb(), user, body.id, reauthorize, request.signal));
    return aiJson({ error: "عملية رفع غير صالحة." }, { status: 400 });
  } catch (error) {
    if (error instanceof StudyUploadError) return aiJson({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof RequestBodyTooLargeError) return aiJson({ error: error.message }, { status: 413 });
    if (error instanceof SyntaxError || error instanceof TypeError) return aiJson({ error: "بيانات الطلب غير صالحة." }, { status: 400 });
    return aiError(error);
  }
}
export const GET = handle, POST = handle, PUT = handle, DELETE = handle;
