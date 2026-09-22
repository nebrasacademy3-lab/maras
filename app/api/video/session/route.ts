import { randomBytes } from "node:crypto";
import { PREVIEW_PROOF_COOKIE, readPreviewProof } from "@/lib/video-preview-proof";
import { normalizeWhatsappNumber } from "@/lib/social-links";
import { studentWorkspaceRequirementResponse } from "@/lib/student-workspace-policy";
import { readBoundedJsonObject } from "@/lib/request-body";
import { getDb } from "@/db";
import { and, desc, eq } from "drizzle-orm";
import { courseAccess, lessonsDb, videoAssets, videoRenditions } from "@/db/schema";
import { checkRateLimit, clientIp, getSessionUser, sameOriginRequest, requestSessionToken, hashOpaqueToken } from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";
import { getCourseCatalog } from "@/lib/catalog-store";
import { isMobileRequest, isNativeAppRequest } from "@/lib/mobile-api";
import { contentViewModeError, getContentViewMode, getPublicSettings } from "@/lib/platform-settings";
import { createVideoToken } from "@/lib/video-token";
import { activeCourseAccessWhere } from "@/lib/course-access";

export async function POST(request: Request) {
  const nativeApp = isNativeAppRequest(request);
  if (!isMobileRequest(request) && !sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const secret = process.env.VIDEO_SIGNING_SECRET?.trim();
  if (!secret || secret.length < 24) return jsonError("بث الفيديو الخاص غير مفعّل بعد", 503);
  let payload: Record<string, unknown>;
  try { payload = await readBoundedJsonObject(request, 32 * 1024); } catch { return jsonError("بيانات الجلسة غير صالحة"); }
  const courseSlug = cleanText(payload.courseSlug, 120);
  const lessonId = cleanText(payload.lessonId, 120);
  const viewer = await getSessionUser(request);
  const rateIdentity = viewer?.email || clientIp(request);
  if (!await checkRateLimit("video-session", rateIdentity, 60, 60)) return jsonError("طلبات مشاهدة كثيرة. حاول بعد قليل.", 429);
  const course = await getCourseCatalog(courseSlug);
  const lesson = course?.units.flatMap((unit) => unit.lessons).find((item) => item.id === lessonId);
  if (!course || !lesson) return jsonError("الدرس غير موجود", 404);

  if (!lesson.free) {
    if (viewer?.role === "instructor") return studentWorkspaceRequirementResponse(viewer)!;
    let mode;
    try { mode = await getContentViewMode(); }
    catch { return jsonError("تعذر التحقق من سياسة المشاهدة حاليًا. حاول مجددًا بعد قليل.", 503); }
    const policyError = contentViewModeError(mode, nativeApp ? "app" : "web");
    if (policyError) return jsonError(policyError, 403);
  }

  const email = viewer?.email || "";
  const viewerId = viewer?.id || 0;
  if (!lesson.free) {
    if (!viewerId) return jsonError("سجّل الدخول لمشاهدة هذا الدرس", 401);
    const [access] = await getDb().select({ id: courseAccess.id }).from(courseAccess).where(activeCourseAccessWhere(viewerId, courseSlug)).limit(1);
    if (!access) return jsonError("لا توجد صلاحية نشطة لهذه المادة", 403);
  }

  const [lessonRow] = await getDb().select({ videoAssetId: lessonsDb.videoAssetId, durationSeconds: lessonsDb.durationSeconds }).from(lessonsDb).where(and(eq(lessonsDb.id, lessonId), eq(lessonsDb.courseSlug, courseSlug), eq(lessonsDb.status, "published"))).limit(1);
  const [asset] = lessonRow?.videoAssetId
    ? await getDb().select().from(videoAssets).where(and(eq(videoAssets.id, lessonRow.videoAssetId), eq(videoAssets.courseSlug, courseSlug), eq(videoAssets.lessonId, lessonId), eq(videoAssets.status, "ready"))).limit(1)
    : await getDb().select().from(videoAssets).where(and(eq(videoAssets.courseSlug, courseSlug), eq(videoAssets.lessonId, lessonId), eq(videoAssets.status, "ready"))).orderBy(desc(videoAssets.createdAt)).limit(1);
  if (!asset) return jsonError("ملف الفيديو غير جاهز بعد", 404);
  const hlsReady = asset.processingStatus === "ready" && Boolean(asset.hlsMasterObjectKey);
  const renditions = hlsReady ? await getDb().select({ label: videoRenditions.qualityLabel, width: videoRenditions.width, height: videoRenditions.height, bitrateKbps: videoRenditions.bitrateKbps }).from(videoRenditions).where(and(eq(videoRenditions.assetId, asset.id), eq(videoRenditions.status, "ready"))) : [];
  // Never hand the original MP4 to a learner, including a public preview. Encoding must complete first.
  if (!hlsReady || !renditions.length) return Response.json({ ok:false, error:"يجري تجهيز البث المشفّر والجودات؛ أعد المحاولة بعد قليل.", processing:{status:asset.processingStatus,progress:asset.processingProgress,message:"بانتظار اكتمال تجهيز البث المشفر"} }, {status:409,headers:{"cache-control":"no-store","retry-after":"20"}});
  const configuredTtl = Number(process.env.VIDEO_TOKEN_TTL_SECONDS);
  const playbackTtlSeconds = Number.isFinite(configuredTtl) ? Math.max(300, Math.min(1800, Math.floor(configuredTtl))) : 900;
  const expiresAt = Date.now() + playbackTtlSeconds * 1000;
  const tokenEmail = lesson.free ? "preview" : email;
  const sessionToken = viewer ? requestSessionToken(request) : null;
  if (viewer && !sessionToken) return jsonError("تعذر ربط جلسة المشاهدة",403);
  const guestNative = !viewer && lesson.free && request.headers.get("x-meras-client") === "mobile-v1" && ["ios","android"].includes(request.headers.get("x-meras-platform") || "") && !request.headers.get("origin") && !request.headers.get("sec-fetch-site") && !request.headers.get("sec-fetch-mode");
  const proofInBody = nativeApp || guestNative;
  const proof = !viewer ? readPreviewProof(request) || randomBytes(24).toString("hex") : "";
  const binding = viewer ? {viewerId:viewer.id,sessionHash:await hashOpaqueToken(sessionToken!)} : {previewProofHash:await hashOpaqueToken(proof)};
  const token = await createVideoToken({ courseSlug, lessonId, email: tokenEmail, client: nativeApp ? "app" : "web", expiresAt, secureHls:true, ...binding }, secret);
  const query = `course=${encodeURIComponent(courseSlug)}&token=${encodeURIComponent(token)}`;

  const hlsUrl = hlsReady ? `/api/video/${encodeURIComponent(lessonId)}/hls/master.m3u8?${query}` : undefined;
  const sourceUrl = hlsUrl!; // Compatibility field; points to encrypted HLS, never the original.
  const thumbnailUrl = asset.thumbnailObjectKey ? `/api/video/${encodeURIComponent(lessonId)}/hls/thumbnail.jpg?${query}` : undefined;
  const processingMessage = "البث المشفر والجودات المتكيفة جاهزة.";
  const settings = await getPublicSettings();
  const responseHeaders = new Headers({"cache-control":"private, no-store", "referrer-policy":"no-referrer"});
  if (proof && !proofInBody) responseHeaders.append("set-cookie", `${PREVIEW_PROOF_COOKIE}=${proof}; Path=/api/video; HttpOnly; SameSite=Lax; Max-Age=1800${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`);
  return Response.json({
    ok: true,
    encrypted: true,
    branding: { whatsapp: normalizeWhatsappNumber(settings.whatsapp_number) },
    ...(proof && proofInBody ? {playbackProof:proof} : {}),
    expiresAt: new Date(expiresAt).toISOString(),
    streamUrl: nativeApp && hlsUrl ? hlsUrl : sourceUrl,
    sourceUrl,
    hlsUrl,
    thumbnailUrl,
    qualities: renditions.sort((left, right) => left.height - right.height),
    adaptive: hlsReady,
    processing: { status: asset.processingStatus, progress: asset.processingProgress, message: processingMessage },
  }, { headers: responseHeaders });
}
