import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import { courseAccess } from "@/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeAccessDurationDays(value: unknown, label?: string | null) {
  const supplied = Number(value);
  if (Number.isInteger(supplied) && supplied >= 1 && supplied <= 3650) return supplied;
  const matched = (label || "").match(/\d{1,4}/)?.[0];
  const parsed = Number(matched);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 3650) return parsed;
  if (/نهاية\s+الترم|end\s+of\s+term/i.test(label || "")) return 120;
  return 90;
}

export function accessExpiryIso(durationDays: number, startsAt = new Date()) {
  const days = normalizeAccessDurationDays(durationDays);
  return new Date(startsAt.getTime() + days * DAY_MS).toISOString();
}

export function activeCourseAccessWhere(userEmail: string, courseSlug: string, now = new Date().toISOString()) {
  return and(
    eq(courseAccess.userEmail, userEmail),
    eq(courseAccess.courseSlug, courseSlug),
    isNull(courseAccess.revokedAt),
    isNull(courseAccess.suspendedAt),
    lte(courseAccess.startsAt, now),
    or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, now)),
  );
}

export function activeUserAccessWhere(userEmail: string, now = new Date().toISOString()) {
  return and(
    eq(courseAccess.userEmail, userEmail),
    isNull(courseAccess.revokedAt),
    isNull(courseAccess.suspendedAt),
    lte(courseAccess.startsAt, now),
    or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, now)),
  );
}
