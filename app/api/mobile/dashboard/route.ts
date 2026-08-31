import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { courseAccess, courseRequests, invoices, lessonProgress, notificationsDb, orders, supportReplies, supportTickets } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { getCoursesCatalog, getInstitutionsCatalog, getRecommendedCourses } from "@/lib/catalog-store";
import { activeUserAccessWhere } from "@/lib/course-access";
import { mobileNoStoreHeaders } from "@/lib/mobile-api";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  const db = getDb();
  const now = new Date().toISOString();
  const [accessRows, progressRows, orderRows, invoiceRows, requestRows, noticeRows, ticketRows] = await Promise.all([
    db.select().from(courseAccess).where(activeUserAccessWhere(user.email, now)),
    db.select().from(lessonProgress).where(eq(lessonProgress.userEmail, user.email)),
    db.select().from(orders).where(eq(orders.customerEmail, user.email)).orderBy(desc(orders.createdAt)).limit(50),
    db.select().from(invoices).where(eq(invoices.customerEmail, user.email)).orderBy(desc(invoices.issuedAt)).limit(50),
    db.select().from(courseRequests).where(eq(courseRequests.userId, user.id)).orderBy(desc(courseRequests.createdAt)).limit(50),
    db.select().from(notificationsDb).where(or(eq(notificationsDb.userEmail, user.email), and(isNull(notificationsDb.userEmail), eq(notificationsDb.audience, user.role)))).orderBy(desc(notificationsDb.createdAt)).limit(50),
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
  const owned = accessRows.flatMap((access) => {
    const course = bySlug.get(access.courseSlug);
    if (!course) return [];
    const lessons = course.units.flatMap((unit) => unit.lessons);
    const availableLessons = lessons.filter((lesson) => lesson.ready);
    const availableIds = new Set(availableLessons.map((lesson) => lesson.id));
    const progress = progressRows.filter((row) => row.courseSlug === course.slug && availableIds.has(row.lessonId));
    const completed = progress.filter((row) => row.completed).length;
    const last = [...progress].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
    return [{ ...course, progress: availableLessons.length ? Math.round(completed / availableLessons.length * 100) : 0, currentLessonId: last?.lessonId || availableLessons[0]?.id || null, expiresAt: access.expiresAt }];
  });
  return Response.json({
    ok: true,
    user,
    owned,
    progress: progressRows,
    orders: orderRows.map((row) => ({ ...row, courseTitle: bySlug.get(row.courseSlug)?.title || row.courseSlug })),
    invoices: invoiceRows,
    requests: requestRows,
    notifications: noticeRows,
    tickets: ticketRows.map((ticket) => ({ ...ticket, replies: replyRows.filter((reply) => reply.ticketId === ticket.id) })),
    recommended,
    institutions,
  }, { headers: mobileNoStoreHeaders });
}
