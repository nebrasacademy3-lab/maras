import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { courseAccess, courseRequests, invoices, lessonProgress, orderItems, orders, supportReplies, supportTickets } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { getCoursesCatalog, getInstitutionsCatalog, getRecommendedCourses } from "@/lib/catalog-store";
import { mobileNoStoreHeaders } from "@/lib/mobile-api";
import { getVisibleNotifications } from "@/lib/notifications";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  const db = getDb();
  const now = new Date().toISOString();
  const [accessRows, progressRows, orderRows, invoiceRows, requestRows, noticeRows, ticketRows] = await Promise.all([
    db.select().from(courseAccess).where(and(eq(courseAccess.userEmail, user.email), isNull(courseAccess.revokedAt), or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, now)))),
    db.select().from(lessonProgress).where(eq(lessonProgress.userEmail, user.email)),
    db.select().from(orders).where(eq(orders.customerEmail, user.email)).orderBy(desc(orders.createdAt)).limit(50),
    db.select().from(invoices).where(eq(invoices.customerEmail, user.email)).orderBy(desc(invoices.issuedAt)).limit(50),
    db.select().from(courseRequests).where(eq(courseRequests.userId, user.id)).orderBy(desc(courseRequests.createdAt)).limit(50),
    getVisibleNotifications(user, 50),
    db.select().from(supportTickets).where(eq(supportTickets.userEmail, user.email)).orderBy(desc(supportTickets.createdAt)).limit(50),
  ]);
  const ticketIds = ticketRows.map((ticket) => ticket.id);
  const orderNumbers = orderRows.map((order) => order.orderNumber);
  const [replyRows, itemRows, courses, institutions, recommended] = await Promise.all([
    ticketIds.length ? db.select().from(supportReplies).where(and(eq(supportReplies.internal, false), inArray(supportReplies.ticketId, ticketIds))).orderBy(desc(supportReplies.createdAt)).limit(300) : Promise.resolve([]),
    orderNumbers.length ? db.select().from(orderItems).where(inArray(orderItems.orderNumber, orderNumbers)) : Promise.resolve([]),
    getCoursesCatalog(),
    getInstitutionsCatalog(),
    getRecommendedCourses(user.universitySlug || "", user.specialty || ""),
  ]);
  const bySlug = new Map(courses.map((course) => [course.slug, course]));
  const owned = accessRows.flatMap((access) => {
    const course = bySlug.get(access.courseSlug);
    if (!course) return [];
    const lessons = course.units.flatMap((unit) => unit.lessons);
    const lessonIds = new Set(lessons.map((lesson) => lesson.id));
    const progress = progressRows.filter((row) => row.courseSlug === course.slug && lessonIds.has(row.lessonId));
    const completed = progress.filter((row) => row.completed).length;
    const last = [...progress].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
    return [{ ...course, progress: lessons.length ? Math.min(100, Math.max(0, Math.round(completed / lessons.length * 100))) : 0, currentLessonId: last?.lessonId || lessons[0]?.id || null, expiresAt: access.expiresAt }];
  });
  const ownedSlugs = new Set(owned.map((course) => course.slug));
  return Response.json({
    ok: true,
    user,
    owned,
    progress: progressRows.map((row) => ({ courseSlug: row.courseSlug, lessonId: row.lessonId, watchedSeconds: row.watchedSeconds, completed: row.completed, updatedAt: row.updatedAt })),
    orders: orderRows.map((row) => {
      const items = itemRows.filter((item) => item.orderNumber === row.orderNumber).map((item) => ({
        ...item,
        courseTitle: bySlug.get(item.courseSlug)?.title || item.courseSlug,
      }));
      const resolvedItems = items.length ? items : [{
        id: 0,
        orderNumber: row.orderNumber,
        courseSlug: row.courseSlug,
        unitPrice: row.subtotal,
        discount: row.discount,
        total: row.total,
        createdAt: row.createdAt,
        courseTitle: bySlug.get(row.courseSlug)?.title || row.courseSlug,
      }];
      return {
        orderNumber: row.orderNumber,
        subtotal: row.subtotal,
        discount: row.discount,
        total: row.total,
        currency: row.currency,
        status: row.status,
        createdAt: row.createdAt,
        paidAt: row.paidAt,
        items: resolvedItems.map((item) => ({ courseSlug: item.courseSlug, unitPrice: item.unitPrice, discount: item.discount, total: item.total, courseTitle: item.courseTitle })),
        courseSlugs: resolvedItems.map((item) => item.courseSlug),
        courseTitle: resolvedItems.map((item) => item.courseTitle).join("، "),
      };
    }),
    invoices: invoiceRows.map((row) => ({ id: row.id, invoiceNumber: row.invoiceNumber, orderNumber: row.orderNumber, total: row.total, currency: row.currency, issuedAt: row.issuedAt })),
    requests: requestRows.map((row) => ({ id: row.id, university: row.university, specialty: row.specialty, courseName: row.courseName, notes: row.notes, notify: row.notify, status: row.status, attachmentsCount: row.attachmentsCount, createdAt: row.createdAt, updatedAt: row.updatedAt })),
    notifications: noticeRows,
    tickets: ticketRows.map((ticket) => ({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      category: ticket.category,
      priority: ticket.priority,
      title: ticket.title,
      message: ticket.message,
      contactChannel: ticket.contactChannel,
      status: ticket.status,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      replies: replyRows.filter((reply) => reply.ticketId === ticket.id).map((reply) => ({ id: reply.id, authorRole: reply.authorRole, body: reply.body, createdAt: reply.createdAt })),
    })),
    recommended: recommended.filter((course) => !ownedSlugs.has(course.slug)),
    institutions,
  }, { headers: mobileNoStoreHeaders });
}
