import { timingSafeEqual } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { lessonsDb, supervisorAssignments, videoAssets } from "@/db/schema";
import { checkRateLimit, clientIp, getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";
import { getCourseCatalog, invalidateCatalogCache } from "@/lib/catalog-store";
import { isNativeAppRequest } from "@/lib/mobile-api";
import { activeStorageProvider, deleteObject, deletePrefix, putObject, type StorageProvider } from "@/lib/storage";
import { probeStoredVideoDuration } from "@/lib/video-metadata";
import { enqueueVideoProcessing, videoProcessingSummary } from "@/lib/video-processing";

const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-matroska", "video/x-msvideo"]);

function secretEquals(expected: string, actual: string) {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

function detectVideoType(bytes: Uint8Array) {
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "video/mp4";
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "video/webm";
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x41 && bytes[9] === 0x56 && bytes[10] === 0x49) return "video/x-msvideo";
  return "";
}

function extensionFor(type: string) {
  return ({ "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/x-matroska": "mkv", "video/x-msvideo": "avi" } as Record<string, string>)[type] || "bin";
}

function compatibleVideoType(declared: string, detected: string) {
  if (!detected) return false;
  if (!declared) return true;
  if (declared === detected) return true;
  if (declared === "video/quicktime" && detected === "video/mp4") return true;
  return (declared === "video/webm" || declared === "video/x-matroska") && detected === "video/webm";
}

function safeDuration(value: unknown) {
  const seconds = Math.round(Number(value));
  return Number.isFinite(seconds) && seconds > 0 && seconds <= 7 * 24 * 60 * 60 ? seconds : 0;
}

async function inspectUploadStream(input: ReadableStream<Uint8Array>) {
  const reader = input.getReader();
  const buffered: Uint8Array[] = [];
  let bufferedBytes = 0;
  let transferredBytes = 0;
  while (bufferedBytes < 64) {
    const item = await reader.read();
    if (item.done) break;
    buffered.push(item.value);
    bufferedBytes += item.value.byteLength;
    transferredBytes += item.value.byteLength;
  }
  const header = new Uint8Array(Math.min(bufferedBytes, 64));
  let offset = 0;
  for (const value of buffered) {
    if (offset >= header.byteLength) break;
    const available = Math.min(value.byteLength, header.byteLength - offset);
    header.set(value.subarray(0, available), offset);
    offset += available;
  }
  let bufferedIndex = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (bufferedIndex < buffered.length) {
        controller.enqueue(buffered[bufferedIndex]);
        bufferedIndex += 1;
        return;
      }
      const item = await reader.read();
      if (item.done) { controller.close(); return; }
      transferredBytes += item.value.byteLength;
      if (transferredBytes > MAX_VIDEO_BYTES) {
        await reader.cancel("video-too-large").catch(() => undefined);
        controller.error(new Error("video-too-large"));
        return;
      }
      controller.enqueue(item.value);
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return { header, stream, transferredBytes: () => transferredBytes };
}

export async function POST(request: Request) {
  const suppliedToken = request.headers.get("x-admin-upload-token")?.trim() || "";
  const uploadSecret = process.env.ADMIN_UPLOAD_TOKEN?.trim() || "";
  const tokenAuthorized = Boolean(uploadSecret && secretEquals(uploadSecret, suppliedToken));
  if (!tokenAuthorized && !sameOriginRequest(request) && !isNativeAppRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);

  const user = tokenAuthorized ? null : await getSessionUser(request);
  if (!tokenAuthorized && !roleAllowed(user, ["admin", "supervisor"])) return jsonError("غير مصرح برفع الفيديو", 401);
  const identity = tokenAuthorized ? `upload-token:${clientIp(request)}` : `user:${user!.id}`;
  if (!await checkRateLimit("admin-video-upload", identity, 10, 60)) return jsonError("طلبات الرفع كثيرة. حاول بعد دقيقة.", 429);

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_VIDEO_BYTES + 2 * 1024 * 1024) return jsonError("حجم الطلب أكبر من المسموح", 413);

  const requestType = (request.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  const rawCourseSlug = cleanText(request.headers.get("x-meras-course"), 120);
  const rawLessonId = cleanText(request.headers.get("x-meras-lesson"), 120);
  const rawUpload = ALLOWED_TYPES.has(requestType) && Boolean(rawCourseSlug && rawLessonId);
  let courseSlug = rawCourseSlug;
  let lessonId = rawLessonId;
  let declaredType = requestType;
  let sizeBytes = declaredLength;
  let uploadStream: ReadableStream<Uint8Array>;
  let detectedType = "";
  let measuredSize = () => sizeBytes;
  let suppliedDurationSeconds = safeDuration(request.headers.get("x-meras-duration-seconds"));

  if (rawUpload) {
    if (!Number.isSafeInteger(declaredLength) || declaredLength <= 0) return jsonError("يلزم تحديد حجم الفيديو", 411);
    if (declaredLength > MAX_VIDEO_BYTES) return jsonError("حجم الفيديو يجب ألا يتجاوز 200 ميجابايت", 413);
    if (!request.body) return jsonError("ملف الفيديو فارغ");
    try {
      const inspected = await inspectUploadStream(request.body);
      uploadStream = inspected.stream;
      measuredSize = inspected.transferredBytes;
      detectedType = detectVideoType(inspected.header);
    } catch {
      return jsonError("تعذر قراءة ملف الفيديو", 400);
    }
  } else {
    const form = await request.formData().catch(() => null);
    if (!form) return jsonError("تعذر قراءة ملف الفيديو", 400);
    const file = form.get("file");
    courseSlug = cleanText(form.get("courseSlug"), 120);
    lessonId = cleanText(form.get("lessonId"), 120);
    suppliedDurationSeconds = safeDuration(form.get("durationSeconds"));
    if (!(file instanceof File)) return jsonError("اختر ملف فيديو صالحًا");
    if (file.size <= 0 || file.size > MAX_VIDEO_BYTES) return jsonError("حجم الفيديو يجب ألا يتجاوز 200 ميجابايت", 413);
    declaredType = file.type.toLowerCase();
    sizeBytes = file.size;
    uploadStream = file.stream();
    detectedType = detectVideoType(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
  }
  const discardRawUpload = async () => { if (rawUpload) await uploadStream.cancel("upload-rejected").catch(() => undefined); };
  if (declaredType && !ALLOWED_TYPES.has(declaredType)) { await discardRawUpload(); return jsonError("صيغة الفيديو غير مسموحة"); }
  if (!compatibleVideoType(declaredType, detectedType)) { await discardRawUpload(); return jsonError("محتوى الفيديو لا يطابق نوع الملف"); }
  const contentType = declaredType === "video/quicktime" && detectedType === "video/mp4" ? "video/quicktime" : declaredType || detectedType;

  const course = await getCourseCatalog(courseSlug, true);
  if (!course?.units.some((unit) => unit.lessons.some((lesson) => lesson.id === lessonId))) { await discardRawUpload(); return jsonError("تعذر مطابقة المادة أو الدرس"); }
  if (!tokenAuthorized && user?.role === "supervisor") {
    const assignments = await getDb().select().from(supervisorAssignments).where(and(eq(supervisorAssignments.supervisorId, user.id), eq(supervisorAssignments.active, true)));
    const mayEdit = assignments.some((assignment) => (!assignment.institutionSlug || assignment.institutionSlug === course.universitySlug) && (!assignment.specialty || assignment.specialty === course.specialty));
    if (!mayEdit) { await discardRawUpload(); return jsonError("هذه المادة غير مسندة لهذا المشرف", 403); }
  }

  const db = getDb();
  const [existingLesson] = await db.select({ id: lessonsDb.id }).from(lessonsDb).where(and(eq(lessonsDb.id, lessonId), eq(lessonsDb.courseSlug, courseSlug))).limit(1);
  if (!existingLesson) { await discardRawUpload(); return jsonError("أنشئ سجل الدرس في الإدارة قبل رفع الفيديو", 409); }
  const objectKey = `private/video-source/${courseSlug}/${lessonId}/${crypto.randomUUID()}.${extensionFor(contentType)}`;
  const provider = activeStorageProvider();
  let committed = false;
  try {
    const stored = await putObject(objectKey, uploadStream, contentType, provider);
    const actualSize = measuredSize();
    if (actualSize <= 0 || actualSize > MAX_VIDEO_BYTES || (rawUpload && actualSize !== sizeBytes)) throw new Error("video-size-mismatch");
    sizeBytes = actualSize;
    const probedDurationSeconds = await probeStoredVideoDuration(objectKey, sizeBytes, contentType, stored.provider).catch(() => 0);
    const durationSeconds = probedDurationSeconds || suppliedDurationSeconds || 0;
    const now = new Date().toISOString();
    const { asset, replacedAssets } = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`video-upload:${courseSlug}:${lessonId}`}))`);
      const previous = await tx.select({ id: videoAssets.id, objectKey: videoAssets.objectKey, storageProvider: videoAssets.storageProvider, derivativesPrefix: videoAssets.derivativesPrefix }).from(videoAssets).where(and(eq(videoAssets.courseSlug, courseSlug), eq(videoAssets.lessonId, lessonId)));
      const [created] = await tx.insert(videoAssets).values({ courseSlug, lessonId, objectKey, storageProvider: stored.provider, contentType, sizeBytes, status: "ready", durationSeconds: durationSeconds || null, processingStatus: "queued", processingProgress: 0, createdAt: now, updatedAt: now }).returning({ id: videoAssets.id, objectKey: videoAssets.objectKey, status: videoAssets.status, durationSeconds: videoAssets.durationSeconds, processingStatus: videoAssets.processingStatus, processingProgress: videoAssets.processingProgress });
      const [linked] = await tx.update(lessonsDb).set({ videoAssetId: created.id, durationSeconds, updatedAt: now }).where(and(eq(lessonsDb.id, lessonId), eq(lessonsDb.courseSlug, courseSlug))).returning({ id: lessonsDb.id });
      if (!linked) throw new Error("lesson-link-failed");
      if (previous.length) await tx.delete(videoAssets).where(inArray(videoAssets.id, previous.map((item) => item.id)));
      return { asset: created, replacedAssets: previous };
    });
    committed = true;
    const processing = await enqueueVideoProcessing(asset.id).catch(async () => {
      await db.update(videoAssets).set({ processingStatus: "failed", processingProgress: 100, processingError: "تعذر إضافة مهمة الجودات المتعددة؛ الفيديو الأصلي ما زال جاهزًا.", updatedAt: new Date().toISOString() }).where(eq(videoAssets.id, asset.id)).catch(() => undefined);
      return { status: "failed", capability: { available: false, message: "تعذر إضافة مهمة المعالجة" } };
    });
    await Promise.all(replacedAssets.map(async (item) => {
      const previousProvider = (item.storageProvider === "s3" ? "s3" : "local") as StorageProvider;
      try { await deleteObject(item.objectKey, previousProvider); } catch { console.warn("[video-upload] previous object cleanup failed", item.objectKey); }
      if (item.derivativesPrefix) try { await deletePrefix(item.derivativesPrefix, previousProvider); } catch { console.warn("[video-upload] previous derivatives cleanup failed", item.derivativesPrefix); }
    }));
    invalidateCatalogCache();
    const summary = await videoProcessingSummary(asset.id).catch(() => null);
    return Response.json({ ok: true, asset: summary || { ...asset, processingStatus: processing.status }, processing: { status: processing.status, available: processing.capability.available, message: processing.capability.message } }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch {
    if (!committed) await deleteObject(objectKey, provider).catch(() => undefined);
    return jsonError("تعذر حفظ الفيديو", 500);
  }
}
