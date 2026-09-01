import { and, count, countDistinct, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { analyticsEvents, courseAccess, lessonProgress } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { getSessionUser, roleAllowed } from "@/lib/auth";

const actorExpression = sql<string>`COALESCE(${analyticsEvents.userEmail}, ${analyticsEvents.anonymousId}, 'unknown')`;

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!roleAllowed(user, ["admin"])) return jsonError("غير مصرح بعرض التحليلات", 403);
  const url = new URL(request.url);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const courseSlug = cleanText(url.searchParams.get("course"), 120).replace(/[^A-Za-z0-9_-]/g, "");
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const where = and(gte(analyticsEvents.createdAt, since), courseSlug ? eq(analyticsEvents.courseSlug, courseSlug) : undefined);
  const db = getDb();

  const [eventRows, courseRows, dailyRows, accessRows, progressRows] = await Promise.all([
    db.select({ event: analyticsEvents.event, total: count(), actors: countDistinct(actorExpression) }).from(analyticsEvents).where(where).groupBy(analyticsEvents.event).orderBy(desc(count())),
    db.select({ courseSlug: analyticsEvents.courseSlug, total: count(), actors: countDistinct(actorExpression) }).from(analyticsEvents).where(and(where, sql`${analyticsEvents.courseSlug} IS NOT NULL`)).groupBy(analyticsEvents.courseSlug).orderBy(desc(count())).limit(20),
    db.select({ day: sql<string>`to_char(${analyticsEvents.createdAt}::timestamptz, 'YYYY-MM-DD')`, total: count(), actors: countDistinct(actorExpression) }).from(analyticsEvents).where(where).groupBy(sql`to_char(${analyticsEvents.createdAt}::timestamptz, 'YYYY-MM-DD')`).orderBy(sql`to_char(${analyticsEvents.createdAt}::timestamptz, 'YYYY-MM-DD')`),
    db.select().from(courseAccess).where(gte(courseAccess.startsAt, since)).limit(50_000),
    db.select().from(lessonProgress).where(gte(lessonProgress.updatedAt, since)).limit(100_000),
  ]);

  const totals = Object.fromEntries(eventRows.map((row) => [row.event, Number(row.total)]));
  const actorTotals = Object.fromEntries(eventRows.map((row) => [row.event, Number(row.actors)]));
  const step = (event: string) => actorTotals[event] || 0;
  const funnel = [
    { event: "course_view", label: "زيارة المادة", actors: step("course_view") },
    { event: "preview_start", label: "تشغيل التجريبي", actors: step("preview_start") },
    { event: "add_to_cart", label: "الإضافة للسلة", actors: step("add_to_cart") },
    { event: "checkout_start", label: "بدء الدفع", actors: step("checkout_start") },
    { event: "payment_paid", label: "دفع ناجح", actors: step("payment_paid") },
    { event: "first_lesson_start", label: "بدء أول درس", actors: step("first_lesson_start") },
  ].map((item, index, rows) => ({ ...item, conversionFromPrevious: index === 0 || !rows[index - 1].actors ? null : Math.round(item.actors / rows[index - 1].actors * 10_000) / 100 }));
  const progressByAccess = new Map<string, typeof progressRows>();
  for (const row of progressRows) progressByAccess.set(`${row.userEmail.toLowerCase()}:${row.courseSlug}`, [...(progressByAccess.get(`${row.userEmail.toLowerCase()}:${row.courseSlug}`) || []), row]);
  const cohortMap = new Map<string, { cohort:string;enrolled:number;activated:number;retained7:number;retained30:number }>();
  for (const access of accessRows) {
    const cohort = access.startsAt.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(cohort)) continue;
    const row = cohortMap.get(cohort) || { cohort, enrolled: 0, activated: 0, retained7: 0, retained30: 0 };
    row.enrolled += 1;
    const activity = progressByAccess.get(`${access.userEmail.toLowerCase()}:${access.courseSlug}`) || [];
    if (activity.length) row.activated += 1;
    const started = Date.parse(access.startsAt);
    if (activity.some((item) => Date.parse(item.updatedAt) >= started + 7 * 86_400_000)) row.retained7 += 1;
    if (activity.some((item) => Date.parse(item.updatedAt) >= started + 30 * 86_400_000)) row.retained30 += 1;
    cohortMap.set(cohort, row);
  }
  const cohorts = [...cohortMap.values()].sort((left, right) => right.cohort.localeCompare(left.cohort)).slice(0, 12).map((row) => ({ ...row, activationRate: row.enrolled ? Math.round(row.activated / row.enrolled * 10_000) / 100 : 0, retention7Rate: row.enrolled ? Math.round(row.retained7 / row.enrolled * 10_000) / 100 : 0, retention30Rate: row.enrolled ? Math.round(row.retained30 / row.enrolled * 10_000) / 100 : 0 }));

  return Response.json({
    ok: true,
    range: { days, since, courseSlug: courseSlug || null },
    totals,
    funnel,
    topCourses: courseRows.map((row) => ({ courseSlug: row.courseSlug, events: Number(row.total), actors: Number(row.actors) })),
    daily: dailyRows.map((row) => ({ day: row.day, events: Number(row.total), actors: Number(row.actors) })),
    cohorts,
  }, { headers: { "cache-control": "no-store" } });
}
