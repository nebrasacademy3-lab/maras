import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { courseRequestFiles } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser } from "@/lib/auth";
import { getObject } from "@/lib/storage";
import { fileStorageProvider } from "@/lib/file-security";
import { fileScanService, fileScanBlockedResponse } from "@/lib/file-scan-queue";

export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول أولًا", 401);
  const id = Number((await params).fileId);
  if (!Number.isSafeInteger(id) || id <= 0) return jsonError("المرفق غير صالح", 400);
  const [file] = await getDb().select().from(courseRequestFiles).where(eq(courseRequestFiles.id, id)).limit(1);
  if (!file || (file.userId !== user.id && user.role !== "admin")) return jsonError("المرفق غير موجود", 404);
  if (!await checkRateLimit("protected-file-download", `user:${user.id}`, 40, 60)) return jsonError("طلبات تنزيل كثيرة؛ حاول بعد دقيقة.", 429);
  const scan = await fileScanService.scanFile("request", file.id);
  const blocked = fileScanBlockedResponse(scan);
  if (blocked) return blocked;
  const object = await getObject(file.objectKey, undefined, fileStorageProvider(file.storageProvider));
  if (!object) return jsonError("الملف غير موجود في التخزين", 404);
  return new Response(object.body, {
    headers: {
      "content-type": file.contentType,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
