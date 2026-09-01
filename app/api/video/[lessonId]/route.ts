import { cleanText, jsonError } from "@/lib/api";
import { getObject, type StorageProvider } from "@/lib/storage";
import { authorizeVideoRequest } from "@/lib/video-access";

type RouteContext = { params: Promise<{ lessonId: string }> };

function requestedRange(value: string | null, sizeBytes: number) {
  if (!value) return { range: undefined as { offset: number; length: number } | undefined };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return { invalid: true as const };
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { invalid: true as const };
    start = Math.max(0, sizeBytes - suffixLength);
    end = sizeBytes - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), sizeBytes - 1) : sizeBytes - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= sizeBytes || end < start) return { invalid: true as const };
  return { range: { offset: start, length: end - start + 1 } };
}

async function serveVideo(request: Request, context: RouteContext, headOnly: boolean) {
  const lessonId = cleanText((await context.params).lessonId, 120);
  const url = new URL(request.url);
  const courseSlug = cleanText(url.searchParams.get("course"), 120);
  const authorization = await authorizeVideoRequest(request, lessonId, courseSlug, cleanText(url.searchParams.get("token"), 4096));
  if (!authorization.ok) return authorization.response;
  const { asset } = authorization;
  const parsed = requestedRange(request.headers.get("range"), asset.sizeBytes);
  if ("invalid" in parsed) return new Response(null, { status: 416, headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes */${asset.sizeBytes}` } });
  const range = parsed.range;
  const provider = (asset.storageProvider === "s3" ? "s3" : "local") as StorageProvider;
  const object = await getObject(asset.objectKey, headOnly ? { offset: 0, length: 1 } : range, provider);
  if (!object) return jsonError("ملف الفيديو غير موجود", 404);

  const headers = new Headers();
  headers.set("Content-Type", asset.contentType);
  headers.set("Content-Disposition", "inline");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, no-store, no-transform, max-age=0");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Vary", "Range");
  headers.set("ETag", object.etag);
  if (range) {
    headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${asset.sizeBytes}`);
    headers.set("Content-Length", String(range.length));
  } else {
    headers.set("Content-Length", String(asset.sizeBytes));
  }
  return new Response(headOnly ? null : object.body as BodyInit, { status: range ? 206 : 200, headers });
}

export function GET(request: Request, context: RouteContext) {
  return serveVideo(request, context, false);
}

export function HEAD(request: Request, context: RouteContext) {
  return serveVideo(request, context, true);
}
