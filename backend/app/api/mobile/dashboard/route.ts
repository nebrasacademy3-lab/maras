import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { courseAccess, courseRequests, invoices, lessonProgress, notificationsDb, orders, supportReplies, supportTickets } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { getCoursesCatalog, getInstitutionsCatalog, getRecommendedCourses } from "@/lib/catalog-store";
import { mobileNoStoreHeaders } from "@/lib/mobile-api";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  const db = getDb();
  const now = new Date().toISOString();
  const [accessRows, progressRows, orderRows, invoiceRows, requestRows, noticeRows, ticketRows, replyRows, courses, institutions, recommended] = await Promise.all([
    db.select().from(courseAccess).where(and(eq(courseAccess.userEmail, user.email), isNull(courseAccess.revokedAt), or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, now)))),
    db.select().from(lessonProgress).where(eq(lessonProgress.userEmail, user.email)),
    db.select().from(orders).where(eq(orders.customerEmail, user.email)).orderBy(desc(orders.createdAt)).limit(50),
    db.select().from(invoices).where(eq(invoices.customerEmail, user.email)).orderBy(desc(invoices.issuedAt)).limit(50),
    db.select().from(courseRequests).where(eq(courseRequests.userId, user.id)).orderBy(desc(courseRequests.createdAt)).limit(50),
    db.select().from(notificationsDb).where(or(eq(notificationsDb.userEmail, user.email), and(isNull(notificationsDb.userEmail), eq(notificationsDb.audience, user.role)))).orderBy(desc(notificationsDb.createdAt)).limit(50),
    db.select().from(supportTickets).where(eq(supportTickets.userEmail, user.email)).orderBy(desc(supportTickets.createdAt)).limit(50),
    db.select().from(supportReplies).where(eq(supportReplies.internal, false)).orderBy(desc(supportReplies.createdAt)).limit(300),
    getCoursesCatalog(), getInstitutionsCatalog(), getRecommendedCourses(user.universitySlug || "", user.specialty || ""),
  ]);
  const bySlug = new Map(courses.map((course) => [course.slug, course]));
  const owned = accessRows.flatMap((access) => {
    const course = bySlug.get(access.courseSlug);
    if (!course) return [];
    const lessons = course.units.flatMap((unit) => unit.lessons);
    const progress = progressRows.filter((row) => row.courseSlug === course.slug);
    const completed = progress.filter((row) => row.completed).length;
    const last = [...progress].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
    return [{ ...course, progress: lessons.length ? Math.round(completed / lessons.length * 100) : 0, currentLessonId: last?.lessonId || lessons[0]?.id || null, expiresAt: access.expiresAt }];
  });
  return Response.json({
    ok: true, user, owned, progress: progressRows,
    orders: orderRows.map((row) => ({ ...row, courseTitle: bySlug.get(row.courseSlug)?.title || row.courseSlug })),
    invoices: invoiceRows,
    requests: requestRows,
    notifications: noticeRows,
    tickets: ticketRows.map((ticket) => ({ ...ticket, replies: replyRows.filter((reply) => reply.ticketId === ticket.id) })),
    recommended,
    institutions,
  }, { headers: mobileNoStoreHeaders });
}
