import { and, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import { courseAccess, courseRequests, invoices, lessonProgress, notificationReads, notificationsDb, orders, supportReplies, supportTickets } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { getCoursesCatalog, getInstitutionsCatalog, getRecommendedCourses } from "@/lib/catalog-store";
import { mobileNoStoreHeaders } from "@/lib/mobile-api";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  const db = getDb();
  const now = new Date().toISOString();
  const visibleNotifications = and(
    or(
      eq(notificationsDb.userEmail, user.email),
      and(isNull(notificationsDb.userEmail), or(eq(notificationsDb.audience, user.role), eq(notificationsDb.audience, "public"))),
    ),
    or(eq(notificationsDb.presentation, "inbox"), eq(notificationsDb.presentation, "all")),
    or(isNull(notificationsDb.startsAt), lte(notificationsDb.startsAt, now)),
    or(isNull(notificationsDb.expiresAt), gt(notificationsDb.expiresAt, now)),
  );
  const [accessRows, progressRows, orderRows, invoiceRows, requestRows, noticeRows, ticketRows] = await Promise.all([
    db.select().from(courseAccess).where(eq(courseAccess.userEmail, user.email)),
    db.select().from(lessonProgress).where(eq(lessonProgress.userEmail, user.email)),
    db.select().from(orders).where(eq(orders.customerEmail, user.email)).orderBy(desc(orders.createdAt)).limit(50),
    db.select().from(invoices).where(eq(invoices.customerEmail, user.email)).orderBy(desc(invoices.issuedAt)).limit(50),
    db.select().from(courseRequests).where(eq(courseRequests.userId, user.id)).orderBy(desc(courseRequests.createdAt)).limit(50),
    db.select({ notification: notificationsDb, readAt: notificationReads.readAt }).from(notificationsDb)
      .leftJoin(notificationReads, and(eq(notificationReads.notificationId, notificationsDb.id), eq(notificationReads.userId, user.id)))
      .where(visibleNotifications).orderBy(desc(notificationsDb.createdAt)).limit(50),
    db.select().from(supportTickets).where(eq(supportTickets.userEmail, user.email)).orderBy(desc(supportTickets.createdAt)).limit(50),
  ]);
  const ticketIds = ticketRows.map((ticket) => ticket.id);
  const [replyRows, courses, institutions, recommended] = await Promise.all([
    ticketIds.length ? db.select().from(supportReplies).where(and(eq(supportReplies.internal, false), inArray(supportReplies.ticketId, ticketIds))).orderBy(desc(supportReplies.createdAt)).limit(300) : Promise.resolve([]),
    getCoursesCatalog(),
    getInstitutionsCatalog(),
    getRecommendedCourses(user.universitySlug || "", user.specialty || ""),
  ]);
  const bySlug = new Map(courses.map((course) => [course.slug, course]));
  const allCourses = accessRows.filter((access) => !access.revokedAt).flatMap((access) => {
    const course = bySlug.get(access.courseSlug);
    if (!course) return [];
    const lessons = course.units.flatMap((unit) => unit.lessons);
    const availableLessons = lessons.filter((lesson) => lesson.ready);
    const availableIds = new Set(availableLessons.map((lesson) => lesson.id));
    const progress = progressRows.filter((row) => row.courseSlug === course.slug && availableIds.has(row.lessonId));
    const completed = progress.filter((row) => row.completed).length;
    const last = [...progress].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
    const accessState = access.suspendedAt ? "suspended" : access.expiresAt && Date.parse(access.expiresAt) <= Date.now() ? "expired" : "active";
    return [{ ...course, progress: availableLessons.length ? Math.round(completed / availableLessons.length * 100) : 0, currentLessonId: last?.lessonId || availableLessons[0]?.id || null, expiresAt: access.expiresAt, accessState }];
  });
  const owned = allCourses.filter((course) => course.accessState === "active");
  const expired = allCourses.filter((course) => course.accessState !== "active");
  return Response.json({
    ok: true,
    user,
    owned,
    expired,
    progress: progressRows,
    orders: orderRows.map((row) => ({ ...row, courseTitle: bySlug.get(row.courseSlug)?.title || row.courseSlug })),
    invoices: invoiceRows,
    requests: requestRows,
    notifications: noticeRows.map((row) => ({ ...row.notification, readAt: row.readAt })),
    tickets: ticketRows.map((ticket) => ({ ...ticket, replies: replyRows.filter((reply) => reply.ticketId === ticket.id) })),
    recommended,
    institutions,
  }, { headers: mobileNoStoreHeaders });
}
