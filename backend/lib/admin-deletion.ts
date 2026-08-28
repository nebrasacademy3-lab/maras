import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  analyticsEvents, auditLogs, authSessions, cartItems, catalogCourses, catalogInstitutions, catalogSpecialties, couponsDb,
  courseAccess, courseRequestFiles, courseRequests, courseReviews, courseUnitsDb, favorites, invoices,
  institutionSpecialties, lessonNotes, lessonProgress, lessonsDb, notificationReads, notificationsDb, orderItems, orders,
  passwordResetTokens, paymentEvents, pushDevices, supportReplyFiles, supportReplies,
  supportTickets, supervisorAssignments, userRoles, users, videoAssets,
} from "@/db/schema";
import { deleteObject } from "@/lib/storage";

export const ADMIN_DELETION_TYPES = [
  "institution", "specialty", "course", "unit", "lesson", "video", "user", "course_request",
  "support_ticket", "coupon", "notification", "review", "supervisor_assignment",
] as const;
export type AdminDeletionType = typeof ADMIN_DELETION_TYPES[number];

export class DeletionPolicyError extends Error {
  status = 409 as const;
  constructor(message: string) {
    super(message);
    this.name = "DeletionPolicyError";
  }
}

type CleanupKey = { key: string; source: string };

type DeletionResult = {
  entityType: AdminDeletionType;
  entityId: string;
  deleted: true;
  deletedRows: number;
  cleanupFailures: string[];
};

type DeletionInput = {
  entityType: AdminDeletionType;
  entityId: string;
  actor: string;
  ipAddress: string;
  confirmation: string;
};

function asJson(value: unknown) {
  try { return JSON.stringify(value); } catch { return "{}"; }
}

function nowIso() {
  return new Date().toISOString();
}

function storedKey(value: string | null | undefined) {
  return value?.startsWith("r2:") ? value.slice(3) : null;
}

function isActiveAccess(row: { revokedAt: string | null; expiresAt: string | null }) {
  if (row.revokedAt) return false;
  if (!row.expiresAt) return true;
  const expiry = new Date(row.expiresAt).getTime();
  return Number.isNaN(expiry) || expiry > Date.now();
}

async function ensureCourseDeletable(db: ReturnType<typeof getDb>, courseSlug: string) {
  const itemRows = await db.select({ orderNumber: orderItems.orderNumber }).from(orderItems).where(eq(orderItems.courseSlug, courseSlug));
  const orderNumbers = [...new Set(itemRows.map((row) => row.orderNumber).filter(Boolean))];
  if (orderNumbers.length) {
    const linkedOrders = await db.select({ orderNumber: orders.orderNumber, status: orders.status }).from(orders).where(inArray(orders.orderNumber, orderNumbers));
    if (linkedOrders.some((row) => row.status === "paid")) throw new DeletionPolicyError("لا يمكن حذف المادة لأنها مرتبطة بطلب مدفوع؛ استخدم إخفاء المادة أو سحب الوصول بدلًا من حذف السجل المالي.");
    const linkedInvoices = await db.select({ orderNumber: invoices.orderNumber }).from(invoices).where(inArray(invoices.orderNumber, orderNumbers));
    if (linkedInvoices.length) throw new DeletionPolicyError("لا يمكن حذف المادة لأنها مرتبطة بفاتورة؛ يجب إبقاء السجل المالي محفوظًا.");
    const linkedPayments = await db.select({ orderNumber: paymentEvents.orderNumber }).from(paymentEvents).where(inArray(paymentEvents.orderNumber, orderNumbers));
    if (linkedPayments.length) throw new DeletionPolicyError("لا يمكن حذف المادة لأنها مرتبطة بأحداث دفع؛ يجب إبقاء سجل Tap وidempotency محفوظًا.");
  }
  const accesses = await db.select({ revokedAt: courseAccess.revokedAt, expiresAt: courseAccess.expiresAt }).from(courseAccess).where(eq(courseAccess.courseSlug, courseSlug));
  if (accesses.some(isActiveAccess)) throw new DeletionPolicyError("لا يمكن حذف المادة لأن لها وصولًا فعالًا. أوقف الوصول أو استخدم إخفاء المادة أولًا.");
  const requests = await db.select({ id: courseRequests.id }).from(courseRequests).where(eq(courseRequests.preparedCourseSlug, courseSlug));
  if (requests.length) throw new DeletionPolicyError("لا يمكن حذف المادة لأنها مرتبطة بطلبات مواد؛ عالج الطلبات أو أزل ربطها أولًا.");
}

async function deleteVideoRows(tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], courseSlug: string, lessonIds: string[] | null, cleanup: CleanupKey[]) {
  const condition = lessonIds?.length ? and(eq(videoAssets.courseSlug, courseSlug), inArray(videoAssets.lessonId, lessonIds)) : eq(videoAssets.courseSlug, courseSlug);
  const assets = await tx.select({ id: videoAssets.id, objectKey: videoAssets.objectKey }).from(videoAssets).where(condition);
  cleanup.push(...assets.map((asset) => ({ key: asset.objectKey, source: "video" })));
  if (assets.length) await tx.delete(videoAssets).where(inArray(videoAssets.id, assets.map((asset) => asset.id)));
  return assets.length;
}

async function deleteCourseRows(tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], courseSlug: string, cleanup: CleanupKey[]) {
  const courses = await tx.select({ slug: catalogCourses.slug, coverImageUrl: catalogCourses.coverImageUrl }).from(catalogCourses).where(eq(catalogCourses.slug, courseSlug));
  if (!courses.length) throw new DeletionPolicyError("المادة غير موجودة.");
  const units = await tx.select({ id: courseUnitsDb.id }).from(courseUnitsDb).where(eq(courseUnitsDb.courseSlug, courseSlug));
  const unitIds = units.map((unit) => unit.id);
  const lessons = await tx.select({ id: lessonsDb.id }).from(lessonsDb).where(eq(lessonsDb.courseSlug, courseSlug));
  const lessonIds = lessons.map((lesson) => lesson.id);
  await deleteVideoRows(tx, courseSlug, lessonIds.length ? lessonIds : null, cleanup);
  if (lessonIds.length) {
    await tx.delete(lessonNotes).where(inArray(lessonNotes.lessonId, lessonIds));
    await tx.delete(lessonProgress).where(inArray(lessonProgress.lessonId, lessonIds));
    await tx.delete(lessonsDb).where(inArray(lessonsDb.id, lessonIds));
  }
  if (unitIds.length) await tx.delete(courseUnitsDb).where(inArray(courseUnitsDb.id, unitIds));
  await tx.delete(lessonProgress).where(eq(lessonProgress.courseSlug, courseSlug));
  await tx.delete(courseAccess).where(eq(courseAccess.courseSlug, courseSlug));
  await tx.delete(favorites).where(eq(favorites.courseSlug, courseSlug));
  await tx.delete(cartItems).where(eq(cartItems.courseSlug, courseSlug));
  await tx.delete(courseReviews).where(eq(courseReviews.courseSlug, courseSlug));
  await tx.delete(analyticsEvents).where(eq(analyticsEvents.courseSlug, courseSlug));
  const coverKey = storedKey(courses[0].coverImageUrl);
  if (coverKey) cleanup.push({ key: coverKey, source: "course-cover" });
  await tx.delete(catalogCourses).where(eq(catalogCourses.slug, courseSlug));
  return 1 + units.length + lessons.length;
}

async function deleteSupportTicketRows(tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], ticketId: number, cleanup: CleanupKey[]) {
  const files = await tx.select({ objectKey: supportReplyFiles.objectKey }).from(supportReplyFiles).where(eq(supportReplyFiles.ticketId, ticketId));
  cleanup.push(...files.map((file) => ({ key: file.objectKey, source: "support" })));
  await tx.delete(supportReplyFiles).where(eq(supportReplyFiles.ticketId, ticketId));
  await tx.delete(supportReplies).where(eq(supportReplies.ticketId, ticketId));
  await tx.delete(supportTickets).where(eq(supportTickets.id, ticketId));
  return files.length;
}

export async function deleteAdminEntity(db: ReturnType<typeof getDb>, input: DeletionInput): Promise<DeletionResult> {
  if (!ADMIN_DELETION_TYPES.includes(input.entityType)) throw new DeletionPolicyError("نوع الحذف غير مسموح.");
  if (input.confirmation !== "حذف") throw new DeletionPolicyError("اكتب كلمة «حذف» حرفيًا لتأكيد العملية المدمرة.");
  // All destructive branches below follow children-first deletion order.
  const cleanup: CleanupKey[] = [];
  let deletedRows = 0;
  let before: unknown = null;
  const now = nowIso();

  if (input.entityType === "course") await ensureCourseDeletable(db, input.entityId);
  if (input.entityType === "unit") {
    const unitId = Number(input.entityId);
    const [unit] = Number.isSafeInteger(unitId) ? await db.select({ courseSlug: courseUnitsDb.courseSlug }).from(courseUnitsDb).where(eq(courseUnitsDb.id, unitId)).limit(1) : [];
    if (unit) await ensureCourseDeletable(db, unit.courseSlug);
  }
  if (input.entityType === "lesson") {
    const [lesson] = await db.select({ courseSlug: lessonsDb.courseSlug }).from(lessonsDb).where(eq(lessonsDb.id, input.entityId)).limit(1);
    if (lesson) await ensureCourseDeletable(db, lesson.courseSlug);
  }
  if (input.entityType === "video") {
    const videoId = Number(input.entityId);
    const [video] = Number.isSafeInteger(videoId) ? await db.select({ courseSlug: videoAssets.courseSlug }).from(videoAssets).where(eq(videoAssets.id, videoId)).limit(1) : [];
    if (video) await ensureCourseDeletable(db, video.courseSlug);
  }
  if (input.entityType === "institution") {
    const usersAtInstitution = await db.select({ id: users.id }).from(users).where(eq(users.universitySlug, input.entityId));
    const requestsAtInstitution = await db.select({ id: courseRequests.id }).from(courseRequests).where(eq(courseRequests.universitySlug, input.entityId));
    if (usersAtInstitution.length || requestsAtInstitution.length) throw new DeletionPolicyError("لا يمكن حذف الجامعة لأنها مرتبطة بطلاب أو طلبات مواد؛ استخدم الإخفاء بدلًا من فقدان العلاقات.");
    const coursesAtInstitution = await db.select({ slug: catalogCourses.slug }).from(catalogCourses).where(eq(catalogCourses.institutionSlug, input.entityId));
    for (const course of coursesAtInstitution) await ensureCourseDeletable(db, course.slug);
  }
  if (input.entityType === "specialty") {
    const [specialty] = await db.select({ name: catalogSpecialties.name }).from(catalogSpecialties).where(eq(catalogSpecialties.slug, input.entityId)).limit(1);
    if (!specialty) throw new DeletionPolicyError("التخصص غير موجود.");
    const coursesAtSpecialty = await db.select({ slug: catalogCourses.slug }).from(catalogCourses).where(eq(catalogCourses.specialtySlug, input.entityId));
    for (const course of coursesAtSpecialty) await ensureCourseDeletable(db, course.slug);
    const usersAtSpecialty = await db.select({ id: users.id }).from(users).where(eq(users.specialty, specialty.name));
    if (usersAtSpecialty.length) throw new DeletionPolicyError("لا يمكن حذف التخصص لأنه مرتبط بمستخدمين؛ استخدم الإخفاء أو حدّث ملفاتهم أولًا.");
  }
  if (input.entityType === "user") {
    const targetId = Number(input.entityId);
    if (!Number.isSafeInteger(targetId) || targetId <= 0) throw new DeletionPolicyError("معرّف المستخدم غير صالح.");
    const [target] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
    if (!target) throw new DeletionPolicyError("المستخدم غير موجود.");
    before = { id: target.id, email: target.email, role: target.role, status: target.status };
    if (target.email === input.actor) throw new DeletionPolicyError("لا يمكنك حذف حسابك الإداري الحالي.");
    if (target.role === "admin") {
      const activeAdmins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active")));
      if (activeAdmins.length <= 1) throw new DeletionPolicyError("لا يمكن حذف آخر مدير نشط في المنصة.");
    }
    const userOrders = await db.select({ orderNumber: orders.orderNumber }).from(orders).where(eq(orders.customerEmail, target.email));
    const userInvoices = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.customerEmail, target.email));
    const userPayments = userOrders.length ? await db.select({ id: paymentEvents.id }).from(paymentEvents).where(inArray(paymentEvents.orderNumber, userOrders.map((row) => row.orderNumber))) : [];
    if (userOrders.length || userInvoices.length || userPayments.length) throw new DeletionPolicyError("لا يمكن حذف الحساب لأنه مرتبط بسجل طلبات أو فاتورة أو أحداث دفع؛ لحماية السجل المالي استخدم التعطيل أو إخفاء الهوية كإجراء منفصل.");
  }

  await db.transaction(async (tx) => {
    if (input.entityType === "course") {
      const [row] = await tx.select().from(catalogCourses).where(eq(catalogCourses.slug, input.entityId)).limit(1);
      if (!row) throw new DeletionPolicyError("المادة غير موجودة.");
      before = { slug: row.slug, title: row.title, institutionSlug: row.institutionSlug, specialtySlug: row.specialtySlug, coverImageUrl: row.coverImageUrl };
      deletedRows = await deleteCourseRows(tx, input.entityId, cleanup);
    } else if (input.entityType === "institution") {
      const [row] = await tx.select().from(catalogInstitutions).where(eq(catalogInstitutions.slug, input.entityId)).limit(1);
      if (!row) throw new DeletionPolicyError("الجامعة غير موجودة.");
      before = { slug: row.slug, name: row.name, logoUrl: row.logoUrl };
      const courses = await tx.select({ slug: catalogCourses.slug }).from(catalogCourses).where(eq(catalogCourses.institutionSlug, input.entityId));
      for (const course of courses) { deletedRows += await deleteCourseRows(tx, course.slug, cleanup); }
      const logoKey = storedKey(row.logoUrl);
      if (logoKey) cleanup.push({ key: logoKey, source: "institution-logo" });
      await tx.delete(institutionSpecialties).where(eq(institutionSpecialties.institutionSlug, input.entityId));
      await tx.delete(catalogInstitutions).where(eq(catalogInstitutions.slug, input.entityId));
      deletedRows += courses.length + 1;
    } else if (input.entityType === "specialty") {
      const [row] = await tx.select().from(catalogSpecialties).where(eq(catalogSpecialties.slug, input.entityId)).limit(1);
      if (!row) throw new DeletionPolicyError("التخصص غير موجود.");
      before = { slug: row.slug, name: row.name };
      const courses = await tx.select({ slug: catalogCourses.slug }).from(catalogCourses).where(eq(catalogCourses.specialtySlug, input.entityId));
      for (const course of courses) { deletedRows += await deleteCourseRows(tx, course.slug, cleanup); }
      await tx.delete(institutionSpecialties).where(eq(institutionSpecialties.specialtySlug, input.entityId));
      await tx.delete(catalogSpecialties).where(eq(catalogSpecialties.slug, input.entityId));
      deletedRows += courses.length + 1;
    } else if (input.entityType === "unit") {
      const unitId = Number(input.entityId);
      if (!Number.isSafeInteger(unitId) || unitId <= 0) throw new DeletionPolicyError("معرّف الوحدة غير صالح.");
      const [row] = await tx.select().from(courseUnitsDb).where(eq(courseUnitsDb.id, unitId)).limit(1);
      if (!row) throw new DeletionPolicyError("الوحدة غير موجودة.");
      before = { id: row.id, courseSlug: row.courseSlug, title: row.title };
      const lessons = await tx.select({ id: lessonsDb.id }).from(lessonsDb).where(eq(lessonsDb.unitId, unitId));
      const lessonIds = lessons.map((lesson) => lesson.id);
      if (lessonIds.length) await deleteVideoRows(tx, row.courseSlug, lessonIds, cleanup);
      if (lessonIds.length) { await tx.delete(lessonNotes).where(inArray(lessonNotes.lessonId, lessonIds)); await tx.delete(lessonProgress).where(inArray(lessonProgress.lessonId, lessonIds)); await tx.delete(lessonsDb).where(inArray(lessonsDb.id, lessonIds)); }
      await tx.delete(courseUnitsDb).where(eq(courseUnitsDb.id, unitId));
      deletedRows = lessons.length + 1;
    } else if (input.entityType === "lesson") {
      const [row] = await tx.select().from(lessonsDb).where(eq(lessonsDb.id, input.entityId)).limit(1);
      if (!row) throw new DeletionPolicyError("الدرس غير موجود.");
      before = { id: row.id, courseSlug: row.courseSlug, title: row.title };
      await deleteVideoRows(tx, row.courseSlug, [row.id], cleanup);
      await tx.delete(lessonNotes).where(eq(lessonNotes.lessonId, row.id));
      await tx.delete(lessonProgress).where(eq(lessonProgress.lessonId, row.id));
      await tx.delete(lessonsDb).where(eq(lessonsDb.id, row.id));
      deletedRows = 1;
    } else if (input.entityType === "video") {
      const videoId = Number(input.entityId);
      if (!Number.isSafeInteger(videoId) || videoId <= 0) throw new DeletionPolicyError("معرّف الفيديو غير صالح.");
      const [row] = await tx.select().from(videoAssets).where(eq(videoAssets.id, videoId)).limit(1);
      if (!row) throw new DeletionPolicyError("الفيديو غير موجود.");
      before = { id: row.id, courseSlug: row.courseSlug, lessonId: row.lessonId, objectKey: row.objectKey };
      cleanup.push({ key: row.objectKey, source: "video" });
      await tx.delete(videoAssets).where(eq(videoAssets.id, videoId));
      await tx.update(lessonsDb).set({ videoAssetId: null, updatedAt: now }).where(eq(lessonsDb.videoAssetId, videoId));
      deletedRows = 1;
    } else if (input.entityType === "user") {
      const targetId = Number(input.entityId);
      const [row] = await tx.select().from(users).where(eq(users.id, targetId)).limit(1);
      if (!row) throw new DeletionPolicyError("المستخدم غير موجود.");
      before = { id: row.id, email: row.email, role: row.role, status: row.status };
      const requests = await tx.select({ id: courseRequests.id }).from(courseRequests).where(eq(courseRequests.userId, targetId));
      const requestIds = requests.map((item) => item.id);
      const requestFiles = requestIds.length ? await tx.select({ objectKey: courseRequestFiles.objectKey }).from(courseRequestFiles).where(inArray(courseRequestFiles.requestId, requestIds)) : [];
      cleanup.push(...requestFiles.map((file) => ({ key: file.objectKey, source: "course-request" })));
      if (requestIds.length) await tx.delete(courseRequestFiles).where(inArray(courseRequestFiles.requestId, requestIds));
      if (requestIds.length) await tx.delete(courseRequests).where(inArray(courseRequests.id, requestIds));
      const tickets = await tx.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.userEmail, row.email));
      for (const ticket of tickets) await deleteSupportTicketRows(tx, ticket.id, cleanup);
      const authoredReplies = await tx.select({ id: supportReplies.id }).from(supportReplies).where(eq(supportReplies.authorEmail, row.email));
      const authoredReplyIds = authoredReplies.map((reply) => reply.id);
      if (authoredReplyIds.length) {
        const replyFiles = await tx.select({ objectKey: supportReplyFiles.objectKey }).from(supportReplyFiles).where(inArray(supportReplyFiles.replyId, authoredReplyIds));
        cleanup.push(...replyFiles.map((file) => ({ key: file.objectKey, source: "support" })));
        await tx.delete(supportReplyFiles).where(inArray(supportReplyFiles.replyId, authoredReplyIds));
        await tx.delete(supportReplies).where(inArray(supportReplies.id, authoredReplyIds));
      }
      await tx.delete(authSessions).where(eq(authSessions.userId, targetId));
      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, targetId));
      await tx.delete(pushDevices).where(eq(pushDevices.userId, targetId));
      await tx.delete(userRoles).where(eq(userRoles.userId, targetId));
      await tx.delete(supervisorAssignments).where(eq(supervisorAssignments.supervisorId, targetId));
      await tx.update(courseRequests).set({ assignedSupervisorId: null, updatedAt: now }).where(eq(courseRequests.assignedSupervisorId, targetId));
      await tx.update(supportTickets).set({ assignedTo: null, updatedAt: now }).where(eq(supportTickets.assignedTo, row.email));
      await tx.delete(favorites).where(eq(favorites.userEmail, row.email));
      await tx.delete(cartItems).where(eq(cartItems.userEmail, row.email));
      await tx.delete(lessonNotes).where(eq(lessonNotes.userEmail, row.email));
      await tx.delete(lessonProgress).where(eq(lessonProgress.userEmail, row.email));
      await tx.delete(courseReviews).where(eq(courseReviews.userEmail, row.email));
      await tx.delete(courseAccess).where(eq(courseAccess.userEmail, row.email));
      await tx.delete(notificationReads).where(eq(notificationReads.userId, targetId));
      await tx.delete(notificationsDb).where(eq(notificationsDb.userEmail, row.email));
      await tx.delete(analyticsEvents).where(eq(analyticsEvents.userEmail, row.email));
      await tx.delete(users).where(eq(users.id, targetId));
      deletedRows = 1;
    } else if (input.entityType === "course_request") {
      const requestId = Number(input.entityId);
      if (!Number.isSafeInteger(requestId) || requestId <= 0) throw new DeletionPolicyError("معرّف الطلب غير صالح.");
      const [row] = await tx.select().from(courseRequests).where(eq(courseRequests.id, requestId)).limit(1);
      if (!row) throw new DeletionPolicyError("طلب المادة غير موجود.");
      before = { id: row.id, courseName: row.courseName, userId: row.userId, status: row.status };
      const files = await tx.select({ objectKey: courseRequestFiles.objectKey }).from(courseRequestFiles).where(eq(courseRequestFiles.requestId, requestId));
      cleanup.push(...files.map((file) => ({ key: file.objectKey, source: "course-request" })));
      await tx.delete(courseRequestFiles).where(eq(courseRequestFiles.requestId, requestId));
      await tx.delete(courseRequests).where(eq(courseRequests.id, requestId));
      deletedRows = 1;
    } else if (input.entityType === "support_ticket") {
      const ticketId = Number(input.entityId);
      if (!Number.isSafeInteger(ticketId) || ticketId <= 0) throw new DeletionPolicyError("معرّف التذكرة غير صالح.");
      const [row] = await tx.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
      if (!row) throw new DeletionPolicyError("التذكرة غير موجودة.");
      before = { id: row.id, ticketNumber: row.ticketNumber, userEmail: row.userEmail, title: row.title };
      await deleteSupportTicketRows(tx, ticketId, cleanup);
      deletedRows = 1;
    } else if (input.entityType === "coupon") {
      const [row] = await tx.select().from(couponsDb).where(eq(couponsDb.code, input.entityId)).limit(1);
      if (!row) throw new DeletionPolicyError("الكوبون غير موجود.");
      before = { code: row.code, type: row.type, value: row.value, courseSlug: row.courseSlug, status: row.status };
      await tx.delete(couponsDb).where(eq(couponsDb.code, input.entityId));
      deletedRows = 1;
    } else if (input.entityType === "notification") {
      const id = Number(input.entityId);
      if (!Number.isSafeInteger(id) || id <= 0) throw new DeletionPolicyError("معرّف الإشعار غير صالح.");
      const [row] = await tx.select().from(notificationsDb).where(eq(notificationsDb.id, id)).limit(1);
      if (!row) throw new DeletionPolicyError("الإشعار غير موجود.");
      before = { id: row.id, audience: row.audience, title: row.title };
      await tx.delete(notificationsDb).where(eq(notificationsDb.id, id));
      deletedRows = 1;
    } else if (input.entityType === "review") {
      const id = Number(input.entityId);
      if (!Number.isSafeInteger(id) || id <= 0) throw new DeletionPolicyError("معرّف التقييم غير صالح.");
      const [row] = await tx.select().from(courseReviews).where(eq(courseReviews.id, id)).limit(1);
      if (!row) throw new DeletionPolicyError("التقييم غير موجود.");
      before = { id: row.id, courseSlug: row.courseSlug, userEmail: row.userEmail, rating: row.rating };
      await tx.delete(courseReviews).where(eq(courseReviews.id, id));
      deletedRows = 1;
    } else if (input.entityType === "supervisor_assignment") {
      const id = Number(input.entityId);
      if (!Number.isSafeInteger(id) || id <= 0) throw new DeletionPolicyError("معرّف التكليف غير صالح.");
      const [row] = await tx.select().from(supervisorAssignments).where(eq(supervisorAssignments.id, id)).limit(1);
      if (!row) throw new DeletionPolicyError("التكليف غير موجود.");
      before = { id: row.id, supervisorId: row.supervisorId, institutionSlug: row.institutionSlug, specialty: row.specialty };
      await tx.delete(supervisorAssignments).where(eq(supervisorAssignments.id, id));
      deletedRows = 1;
    }
    await tx.insert(auditLogs).values({ actorEmail: input.actor, action: "delete", entityType: input.entityType, entityId: input.entityId, beforeJson: asJson(before), afterJson: null, ipAddress: input.ipAddress, createdAt: now });
  });

  const uniqueCleanup = [...new Map(cleanup.map((item) => [item.key, item])).values()];
  const cleanupFailures: string[] = [];
  await Promise.all(uniqueCleanup.map(async (item) => {
    try { await deleteObject(item.key); } catch { cleanupFailures.push(`${item.source}:${item.key}`); }
  }));
  if (cleanupFailures.length) {
    await db.insert(auditLogs).values({ actorEmail: input.actor, action: "cleanup_warning", entityType: input.entityType, entityId: input.entityId, beforeJson: asJson({ failedObjects: cleanupFailures }), afterJson: null, ipAddress: input.ipAddress, createdAt: nowIso() });
  }
  return { entityType: input.entityType, entityId: input.entityId, deleted: true, deletedRows, cleanupFailures };
}
