import { and, eq, sql } from "drizzle-orm";
import { courseAccess } from "@/db/schema";
const DAY_MS = 24 * 60 * 60 * 1000;
export function normalizeAccessDurationDays(value: unknown, label?: string | null) {
  const supplied = Number(value);
  if (Number.isInteger(supplied) && supplied >= 1 && supplied <= 3650) return supplied;
  const parsed = Number((label || "").match(/\d{1,4}/)?.[0]);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 3650) return parsed;
  if (/نهاية\s+الترم|end\s+of\s+term/i.test(label || "")) return 120;
  return 90;
}
export function accessExpiryIso(durationDays: number, startsAt = new Date()) {
  return new Date(startsAt.getTime() + normalizeAccessDurationDays(durationDays) * DAY_MS).toISOString();
}
export function activeAccessCondition(now = new Date().toISOString()) {
  return sql`${courseAccess.suspendedAt} IS NULL AND (
    (${courseAccess.source}<>'revenuecat' AND ${courseAccess.revokedAt} IS NULL
     AND ${courseAccess.startsAt}::timestamptz<=${now}::timestamptz
     AND (${courseAccess.expiresAt} IS NULL OR ${courseAccess.expiresAt}::timestamptz>${now}::timestamptz))
    OR (${courseAccess.storeAccessBlockedAt} IS NULL AND EXISTS(
      SELECT 1 FROM store_course_grants AS access_grant
      WHERE access_grant.user_email=${courseAccess.userEmail}
        AND access_grant.course_slug=${courseAccess.courseSlug}
        AND access_grant.status='active' AND access_grant.starts_at::timestamptz<=${now}::timestamptz
        AND (access_grant.expires_at IS NULL OR access_grant.expires_at::timestamptz>${now}::timestamptz)
    )))`;
}
export function activeCourseAccessWhere(userEmail:string,courseSlug:string,now=new Date().toISOString()) {
  return and(eq(courseAccess.userEmail,userEmail),eq(courseAccess.courseSlug,courseSlug),activeAccessCondition(now));
}
export function activeUserAccessWhere(userEmail:string,now=new Date().toISOString()) {
  return and(eq(courseAccess.userEmail,userEmail),activeAccessCondition(now));
}
/** Display-only projection. Mutation handlers must retain the original baseline row. */
export async function effectiveAccessRows<T extends typeof courseAccess.$inferSelect>(rows:T[],now=new Date().toISOString()):Promise<T[]> {
  if(!rows.length)return rows;
  const {getPool}=await import("@/db");
  const grants=await getPool().query<{user_email:string;course_slug:string;starts_at:string;expires_at:string|null}>(
    "SELECT user_email,course_slug,starts_at,expires_at FROM store_course_grants WHERE user_email=ANY($1::text[]) AND course_slug=ANY($2::text[]) AND status='active' AND starts_at::timestamptz<=$3::timestamptz AND (expires_at IS NULL OR expires_at::timestamptz>$3::timestamptz)",
    [[...new Set(rows.map(r=>r.userEmail))],[...new Set(rows.map(r=>r.courseSlug))],now]);
  return rows.map(row=>{
    if(row.storeAccessBlockedAt||row.suspendedAt)return row;
    const active=grants.rows.filter(g=>g.user_email===row.userEmail&&g.course_slug===row.courseSlug);
    if(!active.length)return row;
    const baselineActive=row.source!=="revenuecat"&&!row.revokedAt&&Date.parse(row.startsAt)<=Date.parse(now)&&(!row.expiresAt||Date.parse(row.expiresAt)>Date.parse(now));
    const dates=active.map(g=>g.expires_at);
    if(baselineActive)dates.push(row.expiresAt);
    return {...row,revokedAt:null,revocationReason:null,startsAt:active.reduce((s,g)=>g.starts_at<s?g.starts_at:s,now),
      expiresAt:dates.some(d=>d===null)?null:dates.filter((d):d is string=>!!d).sort().at(-1)!};
  });
}
