import { getDb } from "@/db";
import { analyticsEvents } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, getSessionUser, sameOriginRequest } from "@/lib/auth";

const allowedEvents = new Set([
  "page_view",
  "course_view",
  "preview_start",
  "preview_complete",
  "add_to_cart",
  "remove_from_cart",
  "checkout_start",
  "checkout_redirect",
  "checkout_pending",
  "payment_paid",
  "payment_failed",
  "first_lesson_start",
  "lesson_complete",
  "notification_open",
  "campaign_click",
  "waitlist_join",
  "renewal_start",
  "bundle_view",
  "bundle_add",
  "support_open",
]);

const allowedMetadataKeys = new Set([
  "path",
  "source",
  "medium",
  "campaign",
  "placement",
  "method",
  "status",
  "orderNumber",
  "notificationId",
  "campaignId",
  "lessonId",
  "durationSeconds",
  "value",
  "currency",
]);

function safeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const clean: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!allowedMetadataKeys.has(key)) continue;
    if (typeof raw === "string") clean[key] = raw.trim().slice(0, 240);
    else if (typeof raw === "number" && Number.isFinite(raw)) clean[key] = raw;
    else if (typeof raw === "boolean") clean[key] = raw;
  }
  return clean;
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر حدث القياس", 403);
  const user = await getSessionUser(request);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; }
  catch { return jsonError("بيانات حدث القياس غير صالحة"); }

  const event = cleanText(payload.event, 80);
  if (!allowedEvents.has(event)) return jsonError("حدث القياس غير مدعوم");
  const anonymousId = cleanText(payload.anonymousId, 100).replace(/[^A-Za-z0-9._:-]/g, "");
  const identity = user ? `user:${user.id}` : anonymousId ? `anonymous:${anonymousId}` : `ip:${clientIp(request)}`;
  if (!await checkRateLimit("analytics-write", identity, 240, 60)) return jsonError("أحداث كثيرة خلال وقت قصير", 429);

  const courseSlug = cleanText(payload.courseSlug, 120).replace(/[^a-zA-Z0-9_-]/g, "") || null;
  await getDb().insert(analyticsEvents).values({
    event,
    anonymousId: anonymousId || null,
    userEmail: user?.email || null,
    courseSlug,
    metadataJson: JSON.stringify(safeMetadata(payload.metadata)),
    createdAt: new Date().toISOString(),
  });
  return Response.json({ ok: true }, { status: 202, headers: { "cache-control": "no-store" } });
}
