import { and, count, desc, eq, gt, ilike, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { courseAccess, courseWaitlist, users } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, roleAllowed } from "@/lib/auth";
import { getCourseCatalog } from "@/lib/catalog-store";
import { activeAccessCondition, effectiveAccessRows } from "@/lib/course-access";
import { adminPage } from "@/lib/admin-operations";

type Props = { params: Promise<{ slug: string }> };
export async function GET(request: Request, { params }: Props) {
  const admin = await getSessionUser(request);
  if (!roleAllowed(admin, ["admin"])) return jsonError("غير مصرح بعرض بيانات المشتركين", 403);
  if (!await checkRateLimit("admin-course-roster", `user:${admin!.id}`, 60, 60)) return jsonError("طلبات كثيرة. حاول بعد دقيقة", 429);
  const { slug } = await params;
  const course = await getCourseCatalog(slug, true);
  if (!course) return jsonError("المادة غير موجودة", 404);
  const query = new URL(request.url).searchParams;
  const kind = query.get("kind") === "waitlist" ? "waitlist" : "subscriptions";
  const search = (query.get("q") || "").trim().slice(0, 160);
  const status = query.get("status") || "all";
  const { page, pageSize, offset } = adminPage(query.get("page"));
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const db = getDb(); const now = new Date().toISOString();
  const student = { id: users.id, email: users.email, fullName: users.fullName, phone: users.phone, status: users.status };
  const active = activeAccessCondition(now);
  const totals = await db.execute(sql`SELECT
    (SELECT count(*) FROM course_access WHERE course_slug = ${slug}) AS subscriptions,
    (SELECT count(*) FROM course_access WHERE course_slug = ${slug} AND ${active}) AS active,
    (SELECT count(*) FROM course_waitlist WHERE course_slug = ${slug} AND status = 'active') AS waiting,
    (SELECT count(*) FROM course_waitlist WHERE course_slug = ${slug} AND notified_at IS NOT NULL) AS notified`);
  let rows: unknown[]; let total: number;
  if (kind === "waitlist") {
    if (!["all", "active", "notified", "converted", "cancelled"].includes(status)) return jsonError("حالة الانتظار غير صالحة");
    const where = and(eq(courseWaitlist.courseSlug, slug), status === "all" ? undefined : eq(courseWaitlist.status, status), search ? or(ilike(courseWaitlist.userEmail, pattern), ilike(users.fullName, pattern), ilike(users.phone, pattern)) : undefined);
    const [selected, counters] = await Promise.all([
      db.select({ record: courseWaitlist, student }).from(courseWaitlist).leftJoin(users, eq(users.email, courseWaitlist.userEmail)).where(where).orderBy(desc(courseWaitlist.createdAt), desc(courseWaitlist.id)).limit(pageSize).offset(offset),
      db.select({ total: count() }).from(courseWaitlist).leftJoin(users, eq(users.email, courseWaitlist.userEmail)).where(where),
    ]);
    rows = selected.map(({ record, student }) => ({ ...record, student })); total = Number(counters[0]?.total || 0);
  } else {
    if (!["all", "active", "suspended", "revoked", "expired", "scheduled"].includes(status)) return jsonError("حالة الاشتراك غير صالحة");
    const state = status === "active" ? active : status === "revoked" ? isNotNull(courseAccess.revokedAt) : status === "suspended" ? and(isNull(courseAccess.revokedAt), isNotNull(courseAccess.suspendedAt)) : status === "scheduled" ? and(isNull(courseAccess.revokedAt), isNull(courseAccess.suspendedAt), gt(courseAccess.startsAt, now)) : status === "expired" ? and(isNull(courseAccess.revokedAt), isNull(courseAccess.suspendedAt), lte(courseAccess.startsAt, now), lte(courseAccess.expiresAt, now)) : undefined;
    const where = and(eq(courseAccess.courseSlug, slug), state, ["revoked", "scheduled", "expired"].includes(status) ? sql`NOT (${active})` : undefined, search ? or(ilike(courseAccess.userEmail, pattern), ilike(users.fullName, pattern), ilike(users.phone, pattern), ilike(courseAccess.orderNumber, pattern)) : undefined);
    const [selected, counters] = await Promise.all([
      db.select({ record: courseAccess, student }).from(courseAccess).leftJoin(users, eq(users.email, courseAccess.userEmail)).where(where).orderBy(desc(courseAccess.updatedAt), desc(courseAccess.id)).limit(pageSize).offset(offset),
      db.select({ total: count() }).from(courseAccess).leftJoin(users, eq(users.email, courseAccess.userEmail)).where(where),
    ]);
    const effective = await effectiveAccessRows(selected.map((row) => row.record), now);
    rows = selected.map(({ student }, index) => { const record = effective[index]; return ({ ...record, student, status: record.revokedAt ? "revoked" : record.suspendedAt ? "suspended" : record.startsAt > now ? "scheduled" : record.expiresAt && record.expiresAt <= now ? "expired" : "active" }); }); total = Number(counters[0]?.total || 0);
  }
  return Response.json({ ok: true, course: { slug: course.slug, title: course.title, university: course.university, specialty: course.specialty, lessons: course.lessons, price: course.price }, kind, rows, pagination: { page, pageSize, total }, totals: Object.fromEntries(Object.entries(totals.rows[0] || {}).map(([key, value]) => [key, Number(value)])), generatedAt: now }, { headers: { "cache-control": "no-store" } });
}
