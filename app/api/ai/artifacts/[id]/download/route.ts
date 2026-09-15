import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiArtifacts, aiFiles } from "@/db/schema";
import { checkRateLimit, getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { safeAttachmentDisposition } from "@/lib/course-resource-access";
import { createStudyDocx } from "@/lib/study-export";
import { DOCX_MIME } from "@/lib/study-document";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول لتنزيل الملف", 401);
  if (!await checkRateLimit("ai-artifact-download", `user:${user.id}`, 30, 60)) return jsonError("طلبات تنزيل كثيرة. حاول بعد دقيقة.", 429);
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return jsonError("معرّف غير صالح", 400);
  const [row] = await getDb().select({ artifact: aiArtifacts, sourceName: aiFiles.originalName }).from(aiArtifacts).innerJoin(aiFiles, eq(aiArtifacts.fileId, aiFiles.id)).where(and(eq(aiArtifacts.id, id), eq(aiArtifacts.userId, user.id), eq(aiFiles.userId, user.id))).limit(1);
  if (!row) return jsonError("الملف غير موجود", 404);
  const bytes = createStudyDocx({ ...row.artifact, sourceName: row.sourceName });
  return new Response(new Uint8Array(bytes), { headers: {
    "content-type": DOCX_MIME,
    "content-length": String(bytes.byteLength),
    "content-disposition": safeAttachmentDisposition(`مراس-${row.artifact.kind}-${id}.docx`),
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox; default-src 'none'",
    vary: "Cookie, Authorization",
  } });
}
