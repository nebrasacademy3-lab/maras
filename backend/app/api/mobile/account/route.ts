import { eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs, authSessions, courseAccess, courseRequestFiles, courseRequests, courseReviews, favorites, invoices,
  lessonNotes, lessonProgress, notificationReads, notificationsDb, orders, passwordResetTokens, pushDevices, supervisorAssignments,
  supportReplyFiles, supportReplies, supportTickets, users,
} from "@/db/schema";
import { checkRateLimit, getSessionUser, verifyPassword } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { isMobileRequest, mobileNoStoreHeaders } from "@/lib/mobile-api";
import { deleteObject } from "@/lib/storage";

export async function DELETE(request: Request) {
  if (!isMobileRequest(request)) return jsonError("طلب تطبيق غير صالح", 403);
  const current = await getSessionUser(request);
  if (!current) return jsonError("سجّل الدخول", 401);
  if (!await checkRateLimit("delete-account", `user:${current.id}`, 5, 60 * 60)) return jsonError("محاولات حذف كثيرة. حاول لاحقًا.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات الحذف غير صالحة"); }
  if (payload.confirmation !== "حذف حسابي") return jsonError("اكتب عبارة التأكيد المطلوبة");
  const password = typeof payload.password === "string" ? payload.password : "";
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.id, current.id)).limit(1);
  if (!row || !await verifyPassword(password, row.passwordHash)) return jsonError("كلمة المرور غير صحيحة", 401);
  if (current.role !== "student") return jsonError("حذف الحساب الإداري أو الإشرافي لا يتم من تطبيق الطالب", 403);
  const now = new Date().toISOString();
  const anonymizedEmail = `deleted+${current.id}+${Date.now()}@meras.invalid`;
  const requestRows = await db.select({ id: courseRequests.id }).from(courseRequests).where(eq(courseRequests.userId, current.id));
  const requestIds = requestRows.map((row) => row.id);
  const requestFileRows = requestIds.length ? await db.select({ objectKey: courseRequestFiles.objectKey }).from(courseRequestFiles).where(inArray(courseRequestFiles.requestId, requestIds)) : [];
  const ticketRows = await db.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.userEmail, current.email));
  const ticketIds = ticketRows.map((row) => row.id);
  const authoredReplyRows = await db.select({ id: supportReplies.id }).from(supportReplies).where(eq(supportReplies.authorEmail, current.email));
  const replyIds = authoredReplyRows.map((row) => row.id);
  const supportFileRows = replyIds.length || ticketIds.length
    ? await db.select({ objectKey: supportReplyFiles.objectKey }).from(supportReplyFiles).where(or(...[ticketIds.length ? inArray(supportReplyFiles.ticketId, ticketIds) : undefined, replyIds.length ? inArray(supportReplyFiles.replyId, replyIds) : undefined].filter((value): value is NonNullable<typeof value> => Boolean(value))))
    : [];
  const objectKeys = [...requestFileRows, ...supportFileRows].map((row) => row.objectKey);

  await db.transaction(async (tx) => {
    if (requestIds.length) {
      await tx.delete(courseRequestFiles).where(inArray(courseRequestFiles.requestId, requestIds));
      await tx.delete(courseRequests).where(inArray(courseRequests.id, requestIds));
    }
    if (ticketIds.length || replyIds.length) {
      const predicates = [ticketIds.length ? inArray(supportReplyFiles.ticketId, ticketIds) : undefined, replyIds.length ? inArray(supportReplyFiles.replyId, replyIds) : undefined].filter((value): value is NonNullable<typeof value> => Boolean(value));
      await tx.delete(supportReplyFiles).where(or(...predicates));
    }
    if (ticketIds.length) {
      await tx.delete(supportReplies).where(inArray(supportReplies.ticketId, ticketIds));
      await tx.delete(supportTickets).where(inArray(supportTickets.id, ticketIds));
    }
    if (replyIds.length) await tx.delete(supportReplies).where(inArray(supportReplies.id, replyIds));
    await tx.delete(favorites).where(eq(favorites.userEmail, current.email));
    await tx.delete(lessonNotes).where(eq(lessonNotes.userEmail, current.email));
    await tx.delete(lessonProgress).where(eq(lessonProgress.userEmail, current.email));
    await tx.delete(courseAccess).where(eq(courseAccess.userEmail, current.email));
    await tx.delete(courseReviews).where(eq(courseReviews.userEmail, current.email));
    await tx.delete(notificationReads).where(eq(notificationReads.userEmail, current.email));
    await tx.delete(notificationsDb).where(eq(notificationsDb.userEmail, current.email));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, current.id));
    await tx.delete(supervisorAssignments).where(eq(supervisorAssignments.supervisorId, current.id));
    // Financial orders and invoices are retained; only their customer contact is anonymized.
    await tx.update(orders).set({ customerEmail: anonymizedEmail, customerName: "حساب محذوف", customerPhone: null, updatedAt: now }).where(eq(orders.customerEmail, current.email));
    await tx.update(invoices).set({ customerEmail: anonymizedEmail }).where(eq(invoices.customerEmail, current.email));
    // Existing audit rows are immutable and are intentionally not rewritten.
    await tx.update(users).set({ email: anonymizedEmail, phone: null, fullName: "حساب محذوف", passwordHash: null, universitySlug: null, specialty: null, academicLevel: null, profileCompletedAt: null, onboardingCompletedAt: null, status: "deleted", updatedAt: now }).where(eq(users.id, current.id));
    await tx.update(authSessions).set({ revokedAt: now }).where(eq(authSessions.userId, current.id));
    await tx.delete(pushDevices).where(eq(pushDevices.userId, current.id));
    await tx.insert(auditLogs).values({ actorEmail: anonymizedEmail, action: "delete-account", entityType: "user", entityId: String(current.id), afterJson: JSON.stringify({ anonymized: true, financialRecordsRetained: true }), createdAt: now });
  });

  const cleanupFailures: string[] = [];
  await Promise.all([...new Set(objectKeys)].map(async (objectKey) => { try { await deleteObject(objectKey); } catch { cleanupFailures.push(objectKey); } }));
  if (cleanupFailures.length) {
    await db.insert(auditLogs).values({ actorEmail: anonymizedEmail, action: "storage-cleanup-warning", entityType: "user", entityId: String(current.id), afterJson: JSON.stringify({ failedCount: cleanupFailures.length }), createdAt: new Date().toISOString() }).catch(() => undefined);
  }
  return Response.json({ ok: true, deletedAt: now }, { headers: mobileNoStoreHeaders });
}
