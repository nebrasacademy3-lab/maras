import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { videoRenditions } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { getObject, type StorageProvider } from "@/lib/storage";
import { authorizeVideoRequest } from "@/lib/video-access";

type RouteContext = { params: Promise<{ lessonId: string; path: string[] }> };

function manifestWithGrant(value: string, courseSlug: string, token: string) {
  const query = new URLSearchParams({ course: courseSlug, token }).toString();
  return value.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("/") || trimmed.includes("..")) return "";
    return `${trimmed}${trimmed.includes("?") ? "&" : "?"}${query}`;
  }).filter(Boolean).join("\n").concat("\n");
}

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
  const provider = (asset.storageProvider === "s3" ? "s3" : "local") as StorageProvider;

  let objectKey = "";
  let contentType = "application/octet-stream";
  let manifest = false;
  if (path.length === 1 && path[0] === "master.m3u8") {
    if (asset.processingStatus !== "ready" || !asset.hlsMasterObjectKey) return jsonError("الجودة المتكيفة ما زالت قيد التجهيز؛ الفيديو الأصلي متاح للمشاهدة", 409);
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
  const object = await getObject(objectKey, undefined, provider);
  if (!object) return jsonError("جزء الفيديو غير موجود في التخزين الخاص", 404);
  const headers = new Headers({
    "content-type": contentType,
    "cache-control": "private, no-store, no-transform, max-age=0",
    "content-disposition": "inline",
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "cross-origin",
    "referrer-policy": "no-referrer",
    etag: object.etag,
  });
  if (manifest) {
    const text = await new Response(object.body as BodyInit).text();
    return new Response(manifestWithGrant(text, courseSlug, token), { headers });
  }
  if (object.size > 0) headers.set("content-length", String(object.size));
  return new Response(object.body as BodyInit, { headers });
}

export async function HEAD(request: Request, context: RouteContext) {
  const response = await GET(request, context);
  return new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });
}
