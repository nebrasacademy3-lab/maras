import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, learningTrackInterests, learningTracks, users } from "@/db/schema";
import { cleanText, isUniqueConstraintError, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { AdminMfaError, requireAdminStepUp } from "@/lib/admin-mfa";
import {
  isInternalDestination,
  LEARNING_TRACK_ACCENTS,
  LEARNING_TRACK_CATEGORIES,
  LEARNING_TRACK_ICONS,
  LEARNING_TRACK_STATUSES,
  type LearningTrackAccent,
  type LearningTrackCategory,
  type LearningTrackIcon,
  type LearningTrackStatus,
} from "@/lib/learning-tracks";
import { isMobileRequest } from "@/lib/mobile-api";
import { observeRequest } from "@/lib/observability";
import { ADMIN_PERMISSIONS, hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type TrackInput = {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  category: LearningTrackCategory;
  iconKey: LearningTrackIcon;
  accent: LearningTrackAccent;
  status: LearningTrackStatus;
  ctaLabel: string;
  destination: string | null;
  position: number;
  featured: boolean;
  showInterestCount: boolean;
  launchAt: string | null;
};

class TrackInputError extends Error {}

async function adminGuard(request: Request, mutation: boolean) {
  const user = await getSessionUser(request);
  if (!user || !await hasPermission(user, ADMIN_PERMISSIONS.ROADMAP_MANAGE)) {
    return { user: null, response: jsonError("غير مصرح بإدارة المسارات القادمة", 403) };
  }
  if (mutation && !isMobileRequest(request) && !sameOriginRequest(request)) {
    return { user: null, response: jsonError("تعذر التحقق من مصدر الطلب", 403) };
  }
  if (!await checkRateLimit(mutation ? "admin-learning-tracks-write" : "admin-learning-tracks-read", "user:" + user.id, mutation ? 50 : 120, 60)) {
    return { user: null, response: jsonError("طلبات إدارية كثيرة. حاول بعد دقيقة.", 429) };
  }
  if (mutation) {
    try {
      await requireAdminStepUp(request, user);
    } catch (error) {
      return {
        user: null,
        response: error instanceof AdminMfaError
          ? Response.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } })
          : jsonError("مطلوب تحقق إداري إضافي", 403),
      };
    }
  }
  return { user, response: null };
}

function includes<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}

function optionalDate(value: unknown) {
  const text = cleanText(value, 80);
  if (!text) return null;
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) throw new TrackInputError("موعد الإطلاق غير صالح");
  return new Date(timestamp).toISOString();
}

function readInput(payload: Record<string, unknown>): TrackInput {
  const slug = cleanText(payload.slug, 120).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,119}$/.test(slug)) throw new TrackInputError("المعرّف الإنجليزي غير صالح");
  const title = cleanText(payload.title, 120);
  if (title.length < 2) throw new TrackInputError("اسم المسار مطلوب");
  const subtitle = cleanText(payload.subtitle, 180);
  const description = cleanText(payload.description, 1_000);
  const categoryValue = cleanText(payload.category, 30);
  const iconValue = cleanText(payload.iconKey, 30);
  const accentValue = cleanText(payload.accent, 20);
  const statusValue = cleanText(payload.status, 30);
  if (!includes(LEARNING_TRACK_CATEGORIES, categoryValue)) throw new TrackInputError("تصنيف المسار غير صالح");
  if (!includes(LEARNING_TRACK_ICONS, iconValue)) throw new TrackInputError("أيقونة المسار غير صالحة");
  if (!includes(LEARNING_TRACK_ACCENTS, accentValue)) throw new TrackInputError("لون المسار غير صالح");
  if (!includes(LEARNING_TRACK_STATUSES, statusValue)) throw new TrackInputError("حالة المسار غير صالحة");
  const ctaLabel = cleanText(payload.ctaLabel, 60);
  if (ctaLabel.length < 2) throw new TrackInputError("نص الإجراء مطلوب");
  const destinationValue = cleanText(payload.destination, 300);
  const destination = destinationValue || null;
  if (!isInternalDestination(destination)) throw new TrackInputError("رابط المسار يجب أن يكون رابطًا داخليًا يبدأ بشرطة مائلة");
  if ((statusValue === "enrollment_open" || statusValue === "available") && !destination) {
    throw new TrackInputError("أضف رابط الوجهة قبل فتح التسجيل أو إتاحة المسار");
  }
  const position = Number(payload.position);
  if (!Number.isInteger(position) || position < 0 || position > 100_000) throw new TrackInputError("ترتيب المسار غير صالح");
  if (typeof payload.featured !== "boolean" || typeof payload.showInterestCount !== "boolean") {
    throw new TrackInputError("إعدادات ظهور المسار غير صالحة");
  }
  return {
    slug,
    title,
    subtitle,
    description,
    category: categoryValue,
    iconKey: iconValue,
    accent: accentValue,
    status: statusValue,
    ctaLabel,
    destination,
    position,
    featured: payload.featured,
    showInterestCount: payload.showInterestCount,
    launchAt: optionalDate(payload.launchAt),
  };
}

async function requestPayload(request: Request) {
  try {
    const payload = await request.json() as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error();
    return payload as Record<string, unknown>;
  } catch {
    throw new TrackInputError("بيانات المسار غير صالحة");
  }
}

function values(input: TrackInput, actor: string, updatedAt: string) {
  return {
    slug: input.slug,
    title: input.title,
    subtitle: input.subtitle,
    description: input.description,
    category: input.category,
    iconKey: input.iconKey,
    accent: input.accent,
    status: input.status,
    ctaLabel: input.ctaLabel,
    destination: input.destination,
    position: input.position,
    featured: input.featured,
    showInterestCount: input.showInterestCount,
    launchAt: input.launchAt,
    updatedBy: actor,
    updatedAt,
  };
}

function safeJson(value: unknown) {
  try { return JSON.stringify(value); } catch { return "{}"; }
}

export async function GET(request: Request) {
  return observeRequest(request, "admin.learning_tracks.read", async () => {
    const guarded = await adminGuard(request, false);
    if (guarded.response) return guarded.response;
    const trackId = Number(new URL(request.url).searchParams.get("track"));
    if (Number.isInteger(trackId) && trackId > 0) {
      const [track] = await getDb().select({ id: learningTracks.id, title: learningTracks.title, releaseVersion: learningTracks.releaseVersion }).from(learningTracks).where(eq(learningTracks.id, trackId)).limit(1);
      if (!track) return jsonError("المسار غير موجود", 404);
      const interests = await getDb()
        .select({ id: learningTrackInterests.id, status: learningTrackInterests.status, source: learningTrackInterests.source, lastNotifiedVersion: learningTrackInterests.lastNotifiedVersion, createdAt: learningTrackInterests.createdAt, updatedAt: learningTrackInterests.updatedAt, email: users.email, fullName: users.fullName, universitySlug: users.universitySlug, specialty: users.specialty })
        .from(learningTrackInterests).innerJoin(users, eq(learningTrackInterests.userId, users.id))
        .where(eq(learningTrackInterests.trackId, trackId)).orderBy(desc(learningTrackInterests.createdAt)).limit(1_000);
      return Response.json({ ok: true, track, interests }, { headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
    }
    const [tracks, counts] = await Promise.all([
      getDb().select().from(learningTracks).orderBy(asc(learningTracks.position), asc(learningTracks.id)),
      getDb().select({
        trackId: learningTrackInterests.trackId,
        active: sql<number>`count(*) FILTER (WHERE ${learningTrackInterests.status} = 'active')::int`,
        total: sql<number>`count(*)::int`,
      }).from(learningTrackInterests).groupBy(learningTrackInterests.trackId),
    ]);
    const countByTrack = new Map(counts.map((row) => [row.trackId, { active: Number(row.active) || 0, total: Number(row.total) || 0 }]));
    return Response.json({
      ok: true,
      tracks: tracks.map((track) => ({ ...track, interests: countByTrack.get(track.id) || { active: 0, total: 0 } })),
    }, { headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  });
}

export async function POST(request: Request) {
  return observeRequest(request, "admin.learning_tracks.create", async () => {
    const guarded = await adminGuard(request, true);
    if (guarded.response || !guarded.user) return guarded.response;
    try {
      const input = readInput(await requestPayload(request));
      const now = new Date().toISOString();
      const created = await getDb().transaction(async (tx) => {
        const releaseVersion = input.status === "enrollment_open" || input.status === "available" ? 1 : 0;
        const [track] = await tx.insert(learningTracks).values({
          ...values(input, guarded.user.email, now),
          releaseVersion,
          createdBy: guarded.user.email,
          createdAt: now,
        }).returning();
        await tx.insert(auditLogs).values({
          actorEmail: guarded.user.email,
          action: "create",
          entityType: "learning_track",
          entityId: track.slug,
          beforeJson: null,
          afterJson: safeJson(track),
          ipAddress: clientIp(request),
          createdAt: now,
        });
        return track;
      });
      return Response.json({ ok: true, track: created }, { status: 201, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    } catch (error) {
      if (error instanceof TrackInputError) return jsonError(error.message, 400);
      if (isUniqueConstraintError(error)) return jsonError("المعرّف الإنجليزي مستخدم مسبقًا", 409);
      return jsonError("تعذر إنشاء المسار", 500);
    }
  });
}

export async function PATCH(request: Request) {
  return observeRequest(request, "admin.learning_tracks.update", async () => {
    const guarded = await adminGuard(request, true);
    if (guarded.response || !guarded.user) return guarded.response;
    try {
      const payload = await requestPayload(request);
      const id = Number(payload.id);
      if (!Number.isInteger(id) || id <= 0) throw new TrackInputError("معرّف المسار غير صالح");
      const input = readInput(payload);
      const now = new Date().toISOString();
      const updated = await getDb().transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM learning_tracks WHERE id = ${id} FOR UPDATE`);
        const [before] = await tx.select().from(learningTracks).where(eq(learningTracks.id, id)).limit(1);
        if (!before) throw new TrackInputError("المسار غير موجود");
        const launches = before.status !== input.status && (input.status === "enrollment_open" || input.status === "available");
        const [track] = await tx.update(learningTracks).set({
          ...values(input, guarded.user.email, now),
          releaseVersion: launches ? before.releaseVersion + 1 : before.releaseVersion,
        }).where(eq(learningTracks.id, id)).returning();
        await tx.insert(auditLogs).values({
          actorEmail: guarded.user.email,
          action: launches ? "launch" : input.status === "archived" && before.status !== "archived" ? "archive" : "update",
          entityType: "learning_track",
          entityId: track.slug,
          beforeJson: safeJson(before),
          afterJson: safeJson(track),
          ipAddress: clientIp(request),
          createdAt: now,
        });
        return track;
      });
      return Response.json({ ok: true, track: updated }, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    } catch (error) {
      if (error instanceof TrackInputError) return jsonError(error.message, error.message === "المسار غير موجود" ? 404 : 400);
      if (isUniqueConstraintError(error)) return jsonError("المعرّف الإنجليزي مستخدم مسبقًا", 409);
      return jsonError("تعذر تحديث المسار", 500);
    }
  });
}
