import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { courseRequestFiles, courseRequests } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, roleAllowed } from "@/lib/auth";
import { getObject } from "@/lib/storage";
import { fileStorageProvider } from "@/lib/file-security";
import { fileScanService, fileScanBlockedResponse } from "@/lib/file-scan-queue";
import { readLimitedStream } from "@/lib/malware-scanner";
import { createStoredZip } from "@/lib/zip";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request);
  if (!roleAllowed(user, ["admin"])) return jsonError("غير مصرح", 403);
  if (!await checkRateLimit("request-zip-download", `user:${user!.id}`, 6, 60)) return jsonError("طلبات تنزيل مجمع كثيرة؛ حاول بعد دقيقة.", 429);
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return jsonError("الطلب غير صالح");
  const db = getDb();
  const [courseRequest] = await db.select({ id: courseRequests.id, courseName: courseRequests.courseName }).from(courseRequests).where(eq(courseRequests.id, id)).limit(1);
  if (!courseRequest) return jsonError("الطلب غير موجود", 404);
  const files = await db.select().from(courseRequestFiles).where(eq(courseRequestFiles.requestId, id));
  if (!files.length) return jsonError("لا توجد مرفقات لهذا الطلب", 404);
  const archiveLimit = 100 * 1024 * 1024;
  if (files.length > 100 || files.reduce((sum, file) => sum + file.sizeBytes, 0) > archiveLimit) return jsonError("حجم المرفقات أكبر من حد التنزيل المجمع. نزّل الملفات منفردة.", 413);
  // Check up to two pending files on demand; the scheduler drains the rest without
  // tying up a web request for 100 * scanner timeout seconds.
  const pending = files.filter(file => file.scanStatus === "pending");
  await Promise.all(pending.slice(0, 2).map(file => fileScanService.scanFile("request", file.id)));
  const current = await db.select().from(courseRequestFiles).where(eq(courseRequestFiles.requestId, id));
  if (current.length !== files.length || current.some(file => !files.some(original => original.id === file.id && original.objectKey === file.objectKey))) return jsonError("تغيرت المرفقات أثناء التنزيل؛ حدّث الطلب وحاول مجددًا.", 409);
  const blockedFile = current.find(file => file.scanStatus === "quarantined") || current.find(file => file.scanStatus !== "clean");
  if (blockedFile) return fileScanBlockedResponse({ status: blockedFile.scanStatus, error: blockedFile.scanError, attempts: blockedFile.scanAttempts, retryAfterSeconds: 30 })!;
  const entries: Array<{ name: string; data: Uint8Array }> = [];
  let totalBytes = 0;
  for (const file of current) {
    const readSignal = AbortSignal.timeout(30_000);
    const object = await getObject(file.objectKey, undefined, fileStorageProvider(file.storageProvider), readSignal);
    if (!object) return jsonError("أحد المرفقات مفقود في التخزين. لم يتم إنشاء ملف ZIP ناقص.", 404);
    let data: Uint8Array;
    try { data = await readLimitedStream(object.body, archiveLimit - totalBytes, readSignal); }
    catch { return jsonError("تعذر قراءة المرفقات ضمن حد الحجم والوقت المسموح. نزّل الملفات منفردة.", 413); }
    totalBytes += data.byteLength;
    entries.push({ name: file.originalName, data });
  }
  if (!entries.length) return jsonError("ملفات الطلب غير متاحة في التخزين", 404);
  const zip = createStoredZip(entries);
  const safeCourse = courseRequest.courseName.replace(/[^\p{L}\p{N}._ -]+/gu, "_").slice(0, 80) || `request-${id}`;
  return new Response(zip, { headers: {
    "content-type": "application/zip",
    "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${safeCourse}-files.zip`)}`,
    "content-length": String(zip.length),
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  } });
}
