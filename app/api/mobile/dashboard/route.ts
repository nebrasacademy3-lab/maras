import { studentWorkspaceRequirementResponse } from "@/lib/student-workspace-policy";
import { notificationRecipientWhere } from "@/lib/notification-visibility";
import { effectiveAccessRows } from "@/lib/course-access";
import { dashboardCourseLearning, dashboardRecommendationMatch } from "@/lib/dashboard-learning";
import { and, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import { courseAccess, courseRequests, invoices, lessonProgress, notificationReads, notificationsDb, orders, refundRequests, supportReplies, supportTickets } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { getCoursesCatalog, getInstitutionsCatalog, getRecommendedCourses } from "@/lib/catalog-store";
import { mobileNoStoreHeaders } from "@/lib/mobile-api";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  const workspaceDenied = studentWorkspaceRequirementResponse(user); if (workspaceDenied) return workspaceDenied;
  const db = getDb();
  const now = new Date().toISOString();
  const visibleNotifications = and(
    notificationRecipientWhere(user),
    or(eq(notificationsDb.presentation, "inbox"), eq(notificationsDb.presentation, "all")),
    or(isNull(notificationsDb.startsAt), lte(notificationsDb.startsAt, now)),
    or(isNull(notificationsDb.expiresAt), gt(notificationsDb.expiresAt, now)),
  );
  const [accessRows, progressRows, orderRows, invoiceRows, requestRows, noticeRows, ticketRows] = await Promise.all([
    db.select().from(courseAccess).where(eq(courseAccess.userId, user.id)).then(rows => effectiveAccessRows(rows)),
    db.select().from(lessonProgress).where(eq(lessonProgress.userId, user.id)),
    db.select().from(orders).where(eq(orders.userId, user.id)).orderBy(desc(orders.createdAt)).limit(50),
    db.select({ invoice: invoices }).from(invoices)
      .innerJoin(orders, eq(orders.orderNumber, invoices.orderNumber))
      .where(eq(orders.userId, user.id)).orderBy(desc(invoices.issuedAt)).limit(50)
      .then(rows => rows.map(row => row.invoice)),
    db.select().from(courseRequests).where(eq(courseRequests.userId, user.id)).orderBy(desc(courseRequests.createdAt)).limit(50),
    db.select({ notification: notificationsDb, readAt: notificationReads.readAt }).from(notificationsDb)
      .leftJoin(notificationReads, and(eq(notificationReads.notificationId, notificationsDb.id), eq(notificationReads.userId, user.id)))
      .where(visibleNotifications).orderBy(desc(notificationsDb.createdAt)).limit(50),
    db.select().from(supportTickets).where(eq(supportTickets.userId, user.id)).orderBy(desc(supportTickets.createdAt)).limit(50),
  ]);
  const ticketIds = ticketRows.map((ticket) => ticket.id);
  const [replyRows, courses, institutions, recommended, refundRows] = await Promise.all([
    ticketIds.length ? db.select().from(supportReplies).where(and(eq(supportReplies.internal, false), inArray(supportReplies.ticketId, ticketIds))).orderBy(desc(supportReplies.createdAt)).limit(300) : Promise.resolve([]),
    getCoursesCatalog(),
    getInstitutionsCatalog(),
    getRecommendedCourses(user.universitySlug || "", user.specialty || ""),
    orderRows.length ? db.select({ orderNumber: refundRequests.orderNumber, status: refundRequests.status, createdAt: refundRequests.createdAt }).from(refundRequests).where(inArray(refundRequests.orderNumber, orderRows.map(row => row.orderNumber))).orderBy(desc(refundRequests.createdAt)) : Promise.resolve([]),
  ]);
  const bySlug = new Map(courses.map((course) => [course.slug, course]));
  const refundByOrder = new Map<string, string>();
  for (const refund of refundRows) if (!refundByOrder.has(refund.orderNumber)) refundByOrder.set(refund.orderNumber, refund.status);
  const allCourses = accessRows.filter((access) => !access.revokedAt).flatMap((access) => {
    const course = bySlug.get(access.courseSlug);
    if (!course) return [];
    return [{ ...course, ...dashboardCourseLearning(course, progressRows, access, now) }];
  });
  const owned = allCourses.filter((course) => course.accessState === "active");
  const expired = allCourses.filter((course) => course.accessState !== "active");
  return Response.json({
    ok: true,
    user,
    owned,
    expired,
    progress: progressRows,
    orders: orderRows.map((row) => ({ ...row, courseTitle: bySlug.get(row.courseSlug)?.title || row.courseSlug, refundStatus: refundByOrder.get(row.orderNumber) || null })),
    invoices: invoiceRows,
    requests: requestRows.map(row => ({ ...row, preparedCourseTitle: row.preparedCourseSlug ? bySlug.get(row.preparedCourseSlug)?.title || null : null })),
    notifications: noticeRows.map((row) => ({ ...row.notification, readAt: row.readAt })),
    tickets: ticketRows.map((ticket) => ({ ...ticket, replies: replyRows.filter((reply) => reply.ticketId === ticket.id) })),
    recommended: recommended.map(course => ({ ...course, match: dashboardRecommendationMatch(course, user.universitySlug) })),
    institutions,
  }, { headers: mobileNoStoreHeaders });
}
