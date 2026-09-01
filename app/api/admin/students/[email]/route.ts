import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  authSessions,
  courseAccess,
  courseAccessEvents,
  courseRequests,
  invoices,
  lessonProgress,
  notificationsDb,
  orderItems,
  orders,
  supportReplies,
  supportTickets,
  users,
} from "@/db/schema";
import { jsonError } from "@/lib/api";
import { getSessionUser, roleAllowed } from "@/lib/auth";
import { getCoursesCatalog, getInstitutionsCatalog } from "@/lib/catalog-store";

type Props = { params: Promise<{ email: string }> };

export async function GET(request: Request, { params }: Props) {
  const admin = await getSessionUser(request);
  if (!roleAllowed(admin, ["admin"])) return jsonError("غير مصرح بعرض ملف الطالب", 403);
  const email = decodeURIComponent((await params).email).trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return jsonError("البريد غير صالح");
  const db = getDb();
  const [student] = await db.select({
    id: users.id,
    email: users.email,
    phone: users.phone,
    fullName: users.fullName,
    role: users.role,
    status: users.status,
    universitySlug: users.universitySlug,
    specialty: users.specialty,
    academicLevel: users.academicLevel,
    emailVerifiedAt: users.emailVerifiedAt,
    phoneVerifiedAt: users.phoneVerifiedAt,
    lastLoginAt: users.lastLoginAt,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
  }).from(users).where(eq(users.email, email)).limit(1);
  if (!student) return jsonError("الطالب غير موجود", 404);

  const [access, progress, orderRows, invoiceRows, tickets, requests, notices, sessions, accessEvents, courseCatalog, institutionCatalog] = await Promise.all([
    db.select().from(courseAccess).where(eq(courseAccess.userEmail, email)).orderBy(desc(courseAccess.updatedAt)).limit(300),
    db.select().from(lessonProgress).where(eq(lessonProgress.userEmail, email)).orderBy(desc(lessonProgress.updatedAt)).limit(1_000),
    db.select().from(orders).where(eq(orders.customerEmail, email)).orderBy(desc(orders.createdAt)).limit(300),
    db.select().from(invoices).where(eq(invoices.customerEmail, email)).orderBy(desc(invoices.issuedAt)).limit(300),
    db.select().from(supportTickets).where(eq(supportTickets.userEmail, email)).orderBy(desc(supportTickets.createdAt)).limit(200),
    db.select().from(courseRequests).where(eq(courseRequests.userId, student.id)).orderBy(desc(courseRequests.createdAt)).limit(200),
    db.select().from(notificationsDb).where(eq(notificationsDb.userEmail, email)).orderBy(desc(notificationsDb.createdAt)).limit(300),
    db.select({ id: authSessions.id, deviceId: authSessions.deviceId, deviceLabel: authSessions.deviceLabel, platform: authSessions.platform, ipAddress: authSessions.ipAddress, lastSeenAt: authSessions.lastSeenAt, expiresAt: authSessions.expiresAt, revokedAt: authSessions.revokedAt, createdAt: authSessions.createdAt }).from(authSessions).where(eq(authSessions.userId, student.id)).orderBy(desc(authSessions.lastSeenAt)).limit(100),
    db.select().from(courseAccessEvents).where(eq(courseAccessEvents.userEmail, email)).orderBy(desc(courseAccessEvents.createdAt)).limit(500),
    getCoursesCatalog(true),
    getInstitutionsCatalog(true),
  ]);

  const orderNumbers = orderRows.map((order) => order.orderNumber);
  const ticketIds = tickets.map((ticket) => ticket.id);
  const [items, replies] = await Promise.all([
    orderNumbers.length ? db.select().from(orderItems).where(inArray(orderItems.orderNumber, orderNumbers)).orderBy(desc(orderItems.createdAt)) : Promise.resolve([]),
    ticketIds.length ? db.select().from(supportReplies).where(inArray(supportReplies.ticketId, ticketIds)).orderBy(desc(supportReplies.createdAt)).limit(1_000) : Promise.resolve([]),
  ]);

  const completedLessons = progress.filter((row) => row.completed).length;
  const watchedSeconds = progress.reduce((sum, row) => sum + Math.max(0, row.watchedSeconds), 0);
  const paidOrders = orderRows.filter((row) => ["paid", "partially_refunded"].includes(row.status));
  const relevantCourseSlugs = new Set([...access.map((item) => item.courseSlug), ...progress.map((item) => item.courseSlug), ...items.map((item) => item.courseSlug)]);
  return Response.json({
    ok: true,
    student,
    summary: {
      activeSubscriptions: access.filter((row) => !row.revokedAt && (!row.expiresAt || Date.parse(row.expiresAt) > Date.now())).length,
      completedLessons,
      watchedSeconds,
      paidOrders: paidOrders.length,
      paidValue: paidOrders.reduce((sum, row) => sum + row.total, 0),
      openTickets: tickets.filter((row) => !["resolved", "closed"].includes(row.status)).length,
      unreadNotifications: notices.filter((row) => !row.readAt).length,
    },
    catalog: {
      institution: institutionCatalog.find((row) => row.slug === student.universitySlug) || null,
      courses: courseCatalog
        .filter((row) => relevantCourseSlugs.has(row.slug))
        .map((row) => ({ slug: row.slug, title: row.title, university: row.university, universitySlug: row.universitySlug, specialty: row.specialty })),
    },
    subscriptions: access,
    accessEvents,
    progress,
    orders: orderRows.map((order) => ({ ...order, items: items.filter((item) => item.orderNumber === order.orderNumber), invoice: invoiceRows.find((invoice) => invoice.orderNumber === order.orderNumber) || null })),
    requests,
    support: tickets.map((ticket) => ({ ...ticket, replies: replies.filter((reply) => reply.ticketId === ticket.id) })),
    notifications: notices,
    sessions,
  }, { headers: { "cache-control": "no-store" } });
}
