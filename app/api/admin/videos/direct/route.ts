import { timingSafeEqual } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { lessonsDb, videoAssets } from "@/db/schema";
import {
  checkRateLimit,
  clientIp,
  getSessionUser,
  roleAllowed,
  sameOriginRequest,
} from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";
import { getCourseCatalog, invalidateCatalogCache } from "@/lib/catalog-store";
import { isNativeAppRequest } from "@/lib/mobile-api";
import {
  activeStorageProvider,
  deleteObject,
  deletePrefix,
  getObject,
  type StorageProvider,
} from "@/lib/storage";
import {
  createDirectUploadUrl,
  headDirectUpload,
} from "@/lib/railway-direct-upload";
import { probeStoredVideoDuration } from "@/lib/video-metadata";
import {
  enqueueVideoProcessing,
  videoProcessingSummary,
} from "@/lib/video-processing";

const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
  "video/x-msvideo",
]);

function secretEquals(expected: string, actual: string) {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");

  return (
    left.length > 0 &&
    left.length === right.length &&
    timingSafeEqual(left, right)
  );
}

function detectVideoType(bytes: Uint8Array) {
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return "video/mp4";
  }

  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "video/webm";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x41 &&
    bytes[9] === 0x56 &&
    bytes[10] === 0x49
  ) {
    return "video/x-msvideo";
  }

  return "";
}

function compatibleVideoType(declared: string, detected: string) {
  if (!detected) return false;
  if (declared === detected) return true;
  if (declared === "video/quicktime" && detected === "video/mp4") {
    return true;
  }

  return (
    (declared === "video/webm" || declared === "video/x-matroska") &&
    detected === "video/webm"
  );
}

function extensionFor(type: string) {
  return (
    {
      "video/mp4": "mp4",
      "video/webm": "webm",
      "video/quicktime": "mov",
      "video/x-matroska": "mkv",
      "video/x-msvideo": "avi",
    } as Record<string, string>
  )[type] || "bin";
}

function safeDuration(value: unknown) {
  const seconds = Math.round(Number(value));

  return Number.isFinite(seconds) &&
    seconds > 0 &&
    seconds <= 7 * 24 * 60 * 60
    ? seconds
    : 0;
}

async function authorize(request: Request) {
  const suppliedToken =
    request.headers.get("x-admin-upload-token")?.trim() || "";

  const uploadSecret = process.env.ADMIN_UPLOAD_TOKEN?.trim() || "";
  const tokenAuthorized = Boolean(
    uploadSecret && secretEquals(uploadSecret, suppliedToken),
  );

  if (
    !tokenAuthorized &&
    !sameOriginRequest(request) &&
    !isNativeAppRequest(request)
  ) {
    return jsonError("تعذر التحقق من مصدر الطلب", 403);
  }

  const user = tokenAuthorized ? null : await getSessionUser(request);

  if (!tokenAuthorized && !roleAllowed(user, ["admin", "supervisor"])) {
    return jsonError("غير مصرح برفع الفيديو", 401);
  }

  const identity = tokenAuthorized
    ? `upload-token:${clientIp(request)}`
    : `user:${user!.id}`;

  if (!await checkRateLimit("admin-video-direct-upload", identity, 10, 60)) {
    return jsonError("طلبات الرفع كثيرة. حاول بعد دقيقة.", 429);
  }

  return { user, tokenAuthorized };
}

export async function GET(request: Request) {
  const access = await authorize(request);

  if (access instanceof Response) return access;

  const params = new URL(request.url).searchParams;
  const courseSlug = cleanText(params.get("courseSlug"), 120);
  const lessonId = cleanText(params.get("lessonId"), 120);
  const contentType = (params.get("contentType") || "").toLowerCase();
  const sizeBytes = Number(params.get("sizeBytes"));

  if (!courseSlug || !lessonId || !ALLOWED_TYPES.has(contentType)) {
    return jsonError("بيانات الفيديو غير صالحة", 400);
  }

  if (
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > MAX_VIDEO_BYTES
  ) {
    return jsonError("حجم الفيديو غير صالح", 413);
  }

  if (activeStorageProvider() !== "s3") {
    return jsonError("التخزين المباشر غير مفعّل", 503);
  }

  const course = await getCourseCatalog(courseSlug, true);

  if (!course?.units.some((unit) =>
    unit.lessons.some((lesson) => lesson.id === lessonId)
  )) {
    return jsonError("تعذر مطابقة المادة أو الدرس", 404);
  }

  // catalog.manage was checked by getSessionUser before signing or accepting this upload.

  const [existingLesson] = await getDb()
    .select({ id: lessonsDb.id })
    .from(lessonsDb)
    .where(and(
      eq(lessonsDb.id, lessonId),
      eq(lessonsDb.courseSlug, courseSlug),
    ))
    .limit(1);

  if (!existingLesson) {
    return jsonError("أنشئ سجل الدرس قبل رفع الفيديو", 409);
  }

  const objectKey =
    `private/video-source/${courseSlug}/${lessonId}/` +
    `${crypto.randomUUID()}.${extensionFor(contentType)}`;

  try {
    const uploadUrl = await createDirectUploadUrl(objectKey, contentType);

    return Response.json({
      ok: true,
      uploadUrl,
      objectKey,
      courseSlug,
      lessonId,
      contentType,
      sizeBytes,
    });
  } catch {
    return jsonError("تعذر تجهيز الرفع المباشر", 503);
  }
}

export async function POST(request: Request) {
  const access = await authorize(request);

  if (access instanceof Response) return access;

  let payload: {
    courseSlug?: unknown;
    lessonId?: unknown;
    objectKey?: unknown;
    contentType?: unknown;
    sizeBytes?: unknown;
    durationSeconds?: unknown;
  };

  try {
    payload = await request.json();
  } catch {
    return jsonError("بيانات إكمال الرفع غير صالحة", 400);
  }

  const courseSlug = cleanText(payload.courseSlug, 120);
  const lessonId = cleanText(payload.lessonId, 120);
  const objectKey = cleanText(payload.objectKey, 320);
  const contentType = String(payload.contentType || "").toLowerCase();
  const sizeBytes = Number(payload.sizeBytes);
  const suppliedDuration = safeDuration(payload.durationSeconds);

  const expectedPrefix =
    `private/video-source/${courseSlug}/${lessonId}/`;

  if (
    !courseSlug ||
    !lessonId ||
    !objectKey ||
    !objectKey.startsWith(expectedPrefix) ||
    objectKey.includes("..")
  ) {
    return jsonError("بيانات الفيديو غير صالحة", 400);
  }

  if (!ALLOWED_TYPES.has(contentType)) {
    return jsonError("صيغة الفيديو غير مسموحة", 400);
  }

  if (
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > MAX_VIDEO_BYTES
  ) {
    return jsonError("حجم الفيديو غير صالح", 413);
  }

  const course = await getCourseCatalog(courseSlug, true);

  if (!course?.units.some((unit) =>
    unit.lessons.some((lesson) => lesson.id === lessonId)
  )) {
    return jsonError("تعذر مطابقة المادة أو الدرس", 404);
  }

  // catalog.manage was checked by getSessionUser before signing or accepting this upload.

  const db = getDb();

  const [existingLesson] = await db
    .select({ id: lessonsDb.id })
    .from(lessonsDb)
    .where(and(
      eq(lessonsDb.id, lessonId),
      eq(lessonsDb.courseSlug, courseSlug),
    ))
    .limit(1);

  if (!existingLesson) {
    return jsonError("أنشئ سجل الدرس قبل رفع الفيديو", 409);
  }

  const stored = await headDirectUpload(objectKey);

  if (!stored) {
    return jsonError("لم يكتمل رفع الفيديو إلى التخزين", 409);
  }

  if (stored.size !== sizeBytes) {
    return jsonError("لم يكتمل رفع الفيديو بالكامل", 409);
  }

  const headerObject = await getObject(
    objectKey,
    { offset: 0, length: 64 },
    "s3",
  );

  if (!headerObject) {
    return jsonError("تعذر التحقق من ملف الفيديو", 400);
  }

  const header = new Uint8Array(
    await new Response(headerObject.body).arrayBuffer(),
  );

  if (!compatibleVideoType(contentType, detectVideoType(header))) {
    return jsonError("محتوى الفيديو لا يطابق نوع الملف", 400);
  }


  try {
    const durationSeconds =
      suppliedDuration ||
      await probeStoredVideoDuration(
        objectKey,
        sizeBytes,
        contentType,
        "s3",
      ).catch(() => 0);

    const now = new Date().toISOString();

    const { asset, replacedAssets, reused } = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`video-upload:${courseSlug}:${lessonId}`}))`,
      );

      const previous = await tx
        .select({
          id: videoAssets.id,
          objectKey: videoAssets.objectKey,
          storageProvider: videoAssets.storageProvider,
          derivativesPrefix: videoAssets.derivativesPrefix,
          status: videoAssets.status,
          durationSeconds: videoAssets.durationSeconds,
          processingStatus: videoAssets.processingStatus,
          processingProgress: videoAssets.processingProgress,
        })
        .from(videoAssets)
        .where(and(
          eq(videoAssets.courseSlug, courseSlug),
          eq(videoAssets.lessonId, lessonId),
        ));

      const sameUpload = previous.find(item => item.objectKey === objectKey && item.storageProvider === "s3");
      if (sameUpload) return { asset: sameUpload, replacedAssets: [], reused: true };

      const [created] = await tx
        .insert(videoAssets)
        .values({
          courseSlug,
          lessonId,
          objectKey,
          storageProvider: "s3",
          contentType,
          sizeBytes,
          status: "ready",
          durationSeconds: durationSeconds || null,
          processingStatus: "queued",
          processingProgress: 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning({
          id: videoAssets.id,
          objectKey: videoAssets.objectKey,
          status: videoAssets.status,
          durationSeconds: videoAssets.durationSeconds,
          processingStatus: videoAssets.processingStatus,
          processingProgress: videoAssets.processingProgress,
        });

      const [linked] = await tx
        .update(lessonsDb)
        .set({
          videoAssetId: created.id,
          durationSeconds,
          updatedAt: now,
        })
        .where(and(
          eq(lessonsDb.id, lessonId),
          eq(lessonsDb.courseSlug, courseSlug),
        ))
        .returning({ id: lessonsDb.id });

      if (!linked) throw new Error("lesson-link-failed");

      if (previous.length) {
        await tx
          .delete(videoAssets)
          .where(inArray(
            videoAssets.id,
            previous.map((item) => item.id),
          ));
      }

      return { asset: created, replacedAssets: previous, reused: false };
    });

    if (reused) {
      const summary = await videoProcessingSummary(asset.id).catch(() => null);
      return Response.json({ ok: true, reused: true, asset: summary || asset }, { headers: { "cache-control": "no-store" } });
    }

    const processing = await enqueueVideoProcessing(asset.id).catch(
      async () => {
        await db
          .update(videoAssets)
          .set({
            processingStatus: "failed",
            processingProgress: 100,
            processingError:
              "تعذر إضافة مهمة المعالجة؛ الفيديو الأصلي ما زال جاهزًا.",
            updatedAt: new Date().toISOString(),
          })
          .where(eq(videoAssets.id, asset.id))
          .catch(() => undefined);

        return {
          status: "failed",
          capability: {
            available: false,
            message: "تعذر إضافة مهمة المعالجة",
          },
        };
      },
    );

    await Promise.all(
      replacedAssets.map(async (item) => {
        const previousProvider =
          (item.storageProvider === "s3" ? "s3" : "local") as StorageProvider;

        try {
          await deleteObject(item.objectKey, previousProvider);
        } catch {
          console.warn(
            "[video-direct-upload] previous object cleanup failed",
            item.objectKey,
          );
        }

        if (item.derivativesPrefix) {
          try {
            await deletePrefix(item.derivativesPrefix, previousProvider);
          } catch {
            console.warn(
              "[video-direct-upload] previous derivatives cleanup failed",
              item.derivativesPrefix,
            );
          }
        }
      }),
    );

    invalidateCatalogCache();

    const summary = await videoProcessingSummary(asset.id).catch(() => null);

    return Response.json(
      {
        ok: true,
        asset: summary || {
          ...asset,
          processingStatus: processing.status,
        },
        processing: {
          status: processing.status,
          available: processing.capability.available,
          message: processing.capability.message,
        },
      },
      { status: 201 },
    );
  } catch {
    // Keep the already-uploaded object for an idempotent finalize retry. Deleting here
    // could remove the live source committed by another concurrent retry.
    return jsonError("تعذر تثبيت الفيديو. أعد محاولة الربط دون إعادة رفع الملف.", 500);
  }
}