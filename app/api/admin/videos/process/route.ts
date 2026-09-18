import { supervisorCourseAllowed } from "@/lib/supervisor-data-scope";
import { readBoundedJsonObject } from "@/lib/request-body";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { videoAssets } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { isNativeAppRequest } from "@/lib/mobile-api";
import { enqueueVideoProcessing, videoProcessingCapability, videoProcessingSummary } from "@/lib/video-processing";

async function authorizedAsset(request: Request, assetId: number) {
  if (!sameOriginRequest(request) && !isNativeAppRequest(request)) return { response: jsonError("تعذر التحقق من مصدر الطلب", 403) };
  const user = await getSessionUser(request);
  if (!roleAllowed(user, ["admin", "supervisor"])) return { response: jsonError("غير مصرح بإدارة معالجة الفيديو", 401) };
  const [asset] = await getDb().select().from(videoAssets).where(eq(videoAssets.id, assetId)).limit(1);
  if (!asset) return { response: jsonError("الفيديو غير موجود", 404) };
  if (!await supervisorCourseAllowed(user, asset.courseSlug)) return { response: jsonError("الفيديو خارج نطاق إشرافك", 403) };
  return { user: user!, asset };
}

export async function GET(request: Request) {
  const assetId = Number(new URL(request.url).searchParams.get("assetId"));
  if (!Number.isSafeInteger(assetId) || assetId <= 0) return jsonError("معرّف الفيديو غير صالح");
  const authorization = await authorizedAsset(request, assetId);
  if (authorization.response) return authorization.response;
  const [summary, capability] = await Promise.all([videoProcessingSummary(assetId), videoProcessingCapability()]);
  return Response.json({ ok: true, asset: summary, capability }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try { payload = await readBoundedJsonObject(request, 16 * 1024); } catch { return jsonError("بيانات الطلب غير صالحة"); }
  const assetId = Number(payload.assetId);
  if (!Number.isSafeInteger(assetId) || assetId <= 0) return jsonError("معرّف الفيديو غير صالح");
  const authorization = await authorizedAsset(request, assetId);
  if (authorization.response) return authorization.response;
  if (!await checkRateLimit("video-processing-retry", `user:${authorization.user!.id}`, 10, 60)) return jsonError("محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.", 429);
  const queued = await enqueueVideoProcessing(assetId, true);
  const summary = await videoProcessingSummary(assetId);
  return Response.json({ ok: true, asset: summary, processing: { status: queued.status, available: queued.capability.available, message: queued.capability.message } }, { headers: { "cache-control": "no-store" } });
}
