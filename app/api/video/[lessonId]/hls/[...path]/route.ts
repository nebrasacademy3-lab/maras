import { sessionMediaKey, mediaSegmentIv, encryptedMediaSize, encryptMediaBody, boundedManifest, manifestWithGrant } from "@/lib/video-hls-security";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { videoRenditions } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { getObject, type StorageProvider } from "@/lib/storage";
import { authorizeVideoRequest } from "@/lib/video-access";

type RouteContext = { params: Promise<{ lessonId: string; path: string[] }> };

export async function GET(request: Request, context: RouteContext) {
  const params = await context.params;
  const lessonId = cleanText(params.lessonId, 120);
  const path = params.path.map((part) => cleanText(part, 120)).filter(Boolean);
  if (!lessonId || !path.length || path.length > 2 || path.some((part) => part === "." || part === ".." || part.includes("/") || part.includes("\\"))) return jsonError("مسار الفيديو غير صالح", 400);
  const url = new URL(request.url);
  const courseSlug = cleanText(url.searchParams.get("course"), 120);
  const token = cleanText(url.searchParams.get("token"), 4096);
  const authorization = await authorizeVideoRequest(request, lessonId, courseSlug, token);
  if (!authorization.ok) return authorization.response;
  const { asset } = authorization;
  const key = sessionMediaKey(process.env.VIDEO_SIGNING_SECRET!.trim(), asset.id, token);
  if(path.length===1&&path[0]==="key.bin") return new Response(new Uint8Array(key),{headers:{"content-type":"application/octet-stream","content-length":"16","cache-control":"private, no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"}});
  const provider = (asset.storageProvider === "s3" ? "s3" : "local") as StorageProvider;

  let objectKey = "";
  let contentType = "application/octet-stream";
  let manifest = false;
  if (path.length === 1 && path[0] === "master.m3u8") {
    if (asset.processingStatus !== "ready" || !asset.hlsMasterObjectKey) return jsonError("البث المشفر والجودات ما زالت قيد التجهيز؛ أعد المحاولة بعد قليل", 409);
    objectKey = asset.hlsMasterObjectKey;
    contentType = "application/vnd.apple.mpegurl";
    manifest = true;
  } else if (path.length === 1 && path[0] === "thumbnail.jpg") {
    if (!asset.thumbnailObjectKey) return jsonError("الصورة المصغرة لم تجهز بعد", 404);
    objectKey = asset.thumbnailObjectKey;
    contentType = "image/jpeg";
  } else if (path.length === 2 && /^[0-9]{3,4}p$/.test(path[0])) {
    const [rendition] = await getDb().select().from(videoRenditions).where(and(eq(videoRenditions.assetId, asset.id), eq(videoRenditions.qualityLabel, path[0]), eq(videoRenditions.status, "ready"))).limit(1);
    if (!rendition) return jsonError("الجودة المطلوبة غير متاحة", 404);
    if (path[1] === "index.m3u8") {
      objectKey = rendition.manifestObjectKey;
      contentType = "application/vnd.apple.mpegurl";
      manifest = true;
    } else if (/^segment-[0-9]{5,7}\.ts$/.test(path[1])) {
      objectKey = `${rendition.segmentPrefix}/${path[1]}`;
      contentType = "video/mp2t";
    }
  }
  if (!objectKey) return jsonError("جزء الفيديو غير موجود", 404);
  const object = await getObject(objectKey, undefined, provider, request.signal);
  if (!object) return jsonError("جزء الفيديو غير موجود في التخزين الخاص", 404);
  const headers = new Headers({
    "content-type": contentType,
    "cache-control": "private, no-store, no-transform, max-age=0",
    "content-disposition": "inline",
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "cross-origin",
    "referrer-policy": "no-referrer",

  });
  if (manifest) {
    try {
      const text = await boundedManifest(object.body as ReadableStream<Uint8Array>);
      return new Response(manifestWithGrant(text, courseSlug, token, key, path.length===2?path[0]:undefined), { headers });
    } catch { return jsonError("تعذر التحقق من قائمة البث",502); }
  }
  if(path.length===2&&/^segment-[0-9]{5,7}\.ts$/.test(path[1])) {
    if(object.size>0)headers.set("content-length",String(encryptedMediaSize(object.size)));
    return new Response(encryptMediaBody(object.body as ReadableStream<Uint8Array>,key,mediaSegmentIv(key,path[0],path[1])),{headers});
  }
  if (object.size > 0) headers.set("content-length", String(object.size));
  return new Response(object.body as BodyInit, { headers });
}

export async function HEAD(request: Request, context: RouteContext) {
  const response = await GET(request, context);
  await response.body?.cancel();
  return new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });
}
