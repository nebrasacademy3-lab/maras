import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { analyticsEvents, learningTrackInterests, learningTracks } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { PUBLIC_LEARNING_TRACK_STATUSES } from "@/lib/learning-tracks";
import { isMobileRequest } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

function mutationAllowed(request: Request) {
  return isMobileRequest(request) || sameOriginRequest(request);
}

async function payload(request: Request) {
  try {
    const value = await request.json() as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function slugFrom(value: unknown) {
  return cleanText(value, 120).toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) {
    return Response.json({ ok: true, authenticated: false, activeSlugs: [] }, {
      headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff", vary: "cookie, authorization" },
    });
  }
  const rows = await getDb().select({ slug: learningTracks.slug })
    .from(learningTrackInterests)
    .innerJoin(learningTracks, eq(learningTrackInterests.trackId, learningTracks.id))
    .where(and(eq(learningTrackInterests.userId, user.id), eq(learningTrackInterests.status, "active")));
  return Response.json({ ok: true, authenticated: true, activeSlugs: rows.map((row) => row.slug) }, {
    headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff", vary: "cookie, authorization" },
  });
}

export async function POST(request: Request) {
  if (!mutationAllowed(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول ليصلك إشعار عند إطلاق المسار", 401);
  if (!await checkRateLimit("learning-track-interest-write", `user:${user.id}`, 20, 60)) {
    return jsonError("محاولات كثيرة. حاول بعد دقيقة.", 429);
  }
  const body = await payload(request);
  if (!body) return jsonError("الطلب غير صالح");
  const slug = slugFrom(body.slug);
  const source = cleanText(body.source, 40).replace(/[^a-z0-9_-]/gi, "") || "homepage";
  if (!slug) return jsonError("المسار مطلوب");
  const [track] = await getDb().select({ id: learningTracks.id, status: learningTracks.status })
    .from(learningTracks)
    .where(and(eq(learningTracks.slug, slug), inArray(learningTracks.status, [...PUBLIC_LEARNING_TRACK_STATUSES])))
    .limit(1);
  if (!track) return jsonError("المسار غير موجود أو غير معلن", 404);
  if (track.status === "available") return jsonError("المسار متاح الآن ويمكنك فتحه مباشرة", 409);

  const now = new Date().toISOString();
  const result = await getDb().transaction(async (tx) => {
    await tx.insert(learningTrackInterests).values({
      trackId: track.id,
      userId: user.id,
      status: "active",
      source,
      lastNotifiedVersion: 0,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [learningTrackInterests.trackId, learningTrackInterests.userId],
      set: { status: "active", source, updatedAt: now },
    });
    await tx.insert(analyticsEvents).values({
      event: "learning_track_interest_join",
      userEmail: user.email,
      metadataJson: JSON.stringify({ slug, source }),
      createdAt: now,
    });
    const [count] = await tx.select({ total: sql<number>`count(*)::int` })
      .from(learningTrackInterests)
      .where(and(eq(learningTrackInterests.trackId, track.id), eq(learningTrackInterests.status, "active")));
    return Number(count?.total) || 0;
  });
  return Response.json({ ok: true, active: true, interestCount: result, message: "سنعلمك عند توفر تحديث لهذا المسار" }, {
    headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
  });
}

export async function DELETE(request: Request) {
  if (!mutationAllowed(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول أولًا", 401);
  if (!await checkRateLimit("learning-track-interest-write", `user:${user.id}`, 20, 60)) {
    return jsonError("محاولات كثيرة. حاول بعد دقيقة.", 429);
  }
  const body = await payload(request);
  if (!body) return jsonError("الطلب غير صالح");
  const slug = slugFrom(body.slug);
  if (!slug) return jsonError("المسار مطلوب");
  const [track] = await getDb().select({ id: learningTracks.id }).from(learningTracks).where(eq(learningTracks.slug, slug)).limit(1);
  if (!track) return jsonError("المسار غير موجود", 404);
  const now = new Date().toISOString();
  await getDb().transaction(async (tx) => {
    await tx.update(learningTrackInterests).set({ status: "cancelled", updatedAt: now })
      .where(and(eq(learningTrackInterests.trackId, track.id), eq(learningTrackInterests.userId, user.id)));
    await tx.insert(analyticsEvents).values({
      event: "learning_track_interest_leave",
      userEmail: user.email,
      metadataJson: JSON.stringify({ slug }),
      createdAt: now,
    });
  });
  return Response.json({ ok: true, active: false, message: "تم إلغاء التنبيه لهذا المسار" }, {
    headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
  });
}
