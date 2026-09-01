import { getDb } from "@/db";
import { and, desc, eq } from "drizzle-orm";
import { courseAccess, lessonsDb, videoAssets, videoRenditions } from "@/db/schema";
import { checkRateLimit, clientIp, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";
import { getCourseCatalog } from "@/lib/catalog-store";
import { isMobileRequest, isNativeAppRequest } from "@/lib/mobile-api";
import { contentViewModeError, getContentViewMode } from "@/lib/platform-settings";
import { createVideoToken } from "@/lib/video-token";
import { activeCourseAccessWhere } from "@/lib/course-access";

export async function POST(request: Request) {
  const nativeApp = isNativeAppRequest(request);
  if (!isMobileRequest(request) && !sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const secret = process.env.VIDEO_SIGNING_SECRET?.trim();
  if (!secret || secret.length < 24) return jsonError("بث الفيديو الخاص غير مفعّل بعد", 503);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات الجلسة غير صالحة"); }
  const courseSlug = cleanText(payload.courseSlug, 120);
  const lessonId = cleanText(payload.lessonId, 120);
  const viewer = await getSessionUser(request);
  const rateIdentity = viewer?.email || clientIp(request);
  if (!await checkRateLimit("video-session", rateIdentity, 60, 60)) return jsonError("طلبات مشاهدة كثيرة. حاول بعد قليل.", 429);
  const course = await getCourseCatalog(courseSlug);
  const lesson = course?.units.flatMap((unit) => unit.lessons).find((item) => item.id === lessonId);
  if (!course || !lesson) return jsonError("الدرس غير موجود", 404);

  if (!lesson.free) {
    let mode;
    try { mode = await getContentViewMode(); }
    catch { return jsonError("تعذر التحقق من سياسة المشاهدة حاليًا. حاول مجددًا بعد قليل.", 503); }
    const policyError = contentViewModeError(mode, nativeApp ? "app" : "web");
    if (policyError) return jsonError(policyError, 403);
  }

  const email = viewer?.email || "";
  if (!lesson.free) {
    if (!email) return jsonError("سجّل الدخول لمشاهدة هذا الدرس", 401);
    const [access] = await getDb().select({ id: courseAccess.id }).from(courseAccess).where(activeCourseAccessWhere(email, courseSlug)).limit(1);
    if (!access) return jsonError("لا توجد صلاحية نشطة لهذه المادة", 403);
  }

  const [lessonRow] = await getDb().select({ videoAssetId: lessonsDb.videoAssetId, durationSeconds: lessonsDb.durationSeconds }).from(lessonsDb).where(and(eq(lessonsDb.id, lessonId), eq(lessonsDb.courseSlug, courseSlug), eq(lessonsDb.status, "published"))).limit(1);
  const [asset] = lessonRow?.videoAssetId
    ? await getDb().select().from(videoAssets).where(and(eq(videoAssets.id, lessonRow.videoAssetId), eq(videoAssets.status, "ready"))).limit(1)
    : await getDb().select().from(videoAssets).where(and(eq(videoAssets.courseSlug, courseSlug), eq(videoAssets.lessonId, lessonId), eq(videoAssets.status, "ready"))).orderBy(desc(videoAssets.createdAt)).limit(1);
  if (!asset) return jsonError("ملف الفيديو غير جاهز بعد", 404);
  const hlsReady = asset.processingStatus === "ready" && Boolean(asset.hlsMasterObjectKey);
  const renditions = hlsReady ? await getDb().select({ label: videoRenditions.qualityLabel, width: videoRenditions.width, height: videoRenditions.height, bitrateKbps: videoRenditions.bitrateKbps }).from(videoRenditions).where(and(eq(videoRenditions.assetId, asset.id), eq(videoRenditions.status, "ready"))) : [];
  const configuredTtl = Number(process.env.VIDEO_TOKEN_TTL_SECONDS);
  const baseTtlSeconds = Number.isFinite(configuredTtl) ? Math.max(1_800, Math.min(28_800, Math.floor(configuredTtl))) : 14_400;
  const playbackTtlSeconds = hlsReady ? Math.min(28_800, Math.max(baseTtlSeconds, (lessonRow?.durationSeconds || asset.durationSeconds || 0) + 1_800)) : 1_800;
  const expiresAt = Date.now() + playbackTtlSeconds * 1000;
  const tokenEmail = lesson.free ? "preview" : email;
  const token = await createVideoToken({ courseSlug, lessonId, email: tokenEmail, client: nativeApp ? "app" : "web", expiresAt }, secret);
  const query = `course=${encodeURIComponent(courseSlug)}&token=${encodeURIComponent(token)}`;
  const sourceUrl = `/api/video/${encodeURIComponent(lessonId)}?${query}`;
  const hlsUrl = hlsReady ? `/api/video/${encodeURIComponent(lessonId)}/hls/master.m3u8?${query}` : undefined;
  const thumbnailUrl = asset.thumbnailObjectKey ? `/api/video/${encodeURIComponent(lessonId)}/hls/thumbnail.jpg?${query}` : undefined;
  const processingMessage = ({
    queued: "تم رفع الفيديو، وسيبدأ تجهيز الجودات المتعددة تلقائيًا.",
    processing: "يجري الآن تجهيز الجودات المتعددة للفيديو.",
    retrying: "ستُعاد محاولة تجهيز الجودات تلقائيًا؛ الفيديو الأصلي متاح.",
    unavailable: "الفيديو الأصلي متاح، والمعالجة متعددة الجودات غير متاحة على هذا الخادم حاليًا.",
    failed: "تعذر تجهيز الجودات المتعددة، لكن الفيديو الأصلي ما زال متاحًا.",
    source_only: "الفيديو الأصلي متاح للمشاهدة.",
    ready: "الجودة المتكيفة جاهزة.",
  } as Record<string, string>)[asset.processingStatus] || "الفيديو جاهز للمشاهدة.";
  return Response.json({
    ok: true,
    expiresAt: new Date(expiresAt).toISOString(),
    streamUrl: nativeApp && hlsUrl ? hlsUrl : sourceUrl,
    sourceUrl,
    hlsUrl,
    thumbnailUrl,
    qualities: renditions.sort((left, right) => left.height - right.height),
    adaptive: hlsReady,
    processing: { status: asset.processingStatus, progress: asset.processingProgress, message: processingMessage },
  }, { headers: { "cache-control": "no-store" } });
}
