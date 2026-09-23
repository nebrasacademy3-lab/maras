import { studentWorkspaceRequirementResponse } from "@/lib/student-workspace-policy";
import { isNativeAppRequest } from "@/lib/mobile-api";
import { checkRateLimit, getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { aiError } from "@/lib/ai-api";
import { safeAttachmentDisposition } from "@/lib/course-resource-access";
import { exportStudyPdf, loadStudyPdfSource, StudyPdfError } from "@/lib/study-pdf";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request);
  if (user?.role === "instructor") return studentWorkspaceRequirementResponse(user)!;
  if (!user) return jsonError("سجّل الدخول لتنزيل الملف", 401);
  if (!await checkRateLimit("ai-artifact-download", `user:${user.id}`, 30, 60)) return jsonError("طلبات تنزيل كثيرة. حاول بعد دقيقة.", 429);
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return jsonError("معرّف غير صالح", 400);
  const url = new URL(request.url), format = url.searchParams.get("format") || "pdf";
  if (format !== "pdf") return jsonError("تُصدّر أدوات مراس ملفات PDF فقط", 400);
  const client = isNativeAppRequest(request) ? "app" : "web";
  try {
    const result = await exportStudyPdf({ artifactId: id, user, client, signal: request.signal, exportId: url.searchParams.get("exportId") });
    // A session may be revoked or switched while Chromium is rendering.
    const current = await getSessionUser(request);
    if (current?.role === "instructor") return studentWorkspaceRequirementResponse(current)!;
    if (!current || current.id !== user.id) return jsonError("انتهت الجلسة. سجّل الدخول مجددًا لتنزيل الملف.", 401);
    const source = await loadStudyPdfSource(id, current, client);
    if (source.sourceDigest !== result.sourceDigest) throw new StudyPdfError("PDF_SOURCE_CHANGED");
    const bytes = result.bytes, kind = source.artifact.kind, type = "application/pdf";
    const extra = { "x-maras-export-id": result.id, "x-maras-export-version": result.version, "x-maras-export-expires": result.expiresAt };
    return new Response(new Uint8Array(bytes), { headers: { "content-type": type, "content-length": String(bytes.byteLength), "content-disposition": safeAttachmentDisposition(`مراس-${kind}-${id}.${format}`), "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "sandbox; default-src 'none'", "x-robots-tag": "noindex, nofollow, noarchive", vary: "Cookie, Authorization", ...extra } });
  } catch (error) {
    if (request.signal.aborted) return jsonError("أُلغي تنزيل PDF.", 499, "PDF_CANCELLED");
    if (error instanceof StudyPdfError) return jsonError(error.message, error.code === "PDF_CANCELLED" ? 499 : /INVALID|LIMIT|INCOMPLETE|OVERFLOW/.test(error.code) ? 422 : 503, error.code);
    return aiError(error);
  }
}
