import { env } from "cloudflare:workers";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs, authSessions, courseAccess, courseRequestFiles, courseRequests, courseReviews, favorites, invoices,
  lessonNotes, lessonProgress, notificationsDb, orders, passwordResetTokens, pushDevices, supervisorAssignments,
  supportReplies, supportTickets, users,
} from "@/db/schema";
import { getSessionUser, verifyPassword } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { isMobileRequest, mobileNoStoreHeaders } from "@/lib/mobile-api";

export async function DELETE(request: Request) {
  if (!isMobileRequest(request)) return jsonError("طلب تطبيق غير صالح", 403);
  const current = await getSessionUser(request);
  if (!current) return jsonError("سجّل الدخول", 401);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات الحذف غير صالحة"); }
  if (payload.confirmation !== "حذف حسابي") return jsonError("اكتب عبارة التأكيد المطلوبة");
  const password = typeof payload.password === "string" ? payload.password : "";
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.id, current.id)).limit(1);
  if (!row || !await verifyPassword(password, row.passwordHash)) return jsonError("كلمة المرور غير صحيحة", 401);
  const now = new Date().toISOString();
  const anonymizedEmail = `deleted+${current.id}+${Date.now()}@meras.invalid`;
  const requestRows = await db.select({ id: courseRequests.id }).from(courseRequests).where(eq(courseRequests.userId, current.id));
  const requestIds = requestRows.map((row) => row.id);
  const fileRows = requestIds.length ? await db.select({ objectKey: courseRequestFiles.objectKey }).from(courseRequestFiles).where(inArray(courseRequestFiles.requestId, requestIds)) : [];
  const bucket = (env as unknown as { BUCKET?: { delete(keys: string | string[]): Promise<unknown> } }).BUCKET;
  if (bucket && fileRows.length) await bucket.delete(fileRows.map((row) => row.objectKey)).catch(() => undefined);
  if (requestIds.length) {
    await db.delete(courseRequestFiles).where(inArray(courseRequestFiles.requestId, requestIds));
    await db.delete(courseRequests).where(inArray(courseRequests.id, requestIds));
  }
  await db.delete(favorites).where(eq(favorites.userEmail, current.email));
  await db.delete(lessonNotes).where(eq(lessonNotes.userEmail, current.email));
  await db.delete(lessonProgress).where(eq(lessonProgress.userEmail, current.email));
  await db.delete(courseAccess).where(eq(courseAccess.userEmail, current.email));
  await db.delete(courseReviews).where(eq(courseReviews.userEmail, current.email));
  await db.delete(notificationsDb).where(eq(notificationsDb.userEmail, current.email));
  await db.delete(supportReplies).where(eq(supportReplies.authorEmail, current.email));
  await db.delete(supportTickets).where(eq(supportTickets.userEmail, current.email));
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, current.id));
  await db.delete(supervisorAssignments).where(eq(supervisorAssignments.supervisorId, current.id));
  await db.update(orders).set({ customerEmail: anonymizedEmail, customerName: "حساب محذوف", customerPhone: null, updatedAt: now }).where(eq(orders.customerEmail, current.email));
  await db.update(invoices).set({ customerEmail: anonymizedEmail }).where(eq(invoices.customerEmail, current.email));
  await db.update(auditLogs).set({ actorEmail: anonymizedEmail }).where(eq(auditLogs.actorEmail, current.email));
  await db.update(users).set({ email: anonymizedEmail, phone: null, fullName: "حساب محذوف", passwordHash: null, universitySlug: null, specialty: null, profileCompletedAt: null, onboardingCompletedAt: null, status: "deleted", updatedAt: now }).where(eq(users.id, current.id));
  await db.update(authSessions).set({ revokedAt: now }).where(eq(authSessions.userId, current.id));
  await db.delete(pushDevices).where(eq(pushDevices.userId, current.id));
  await db.insert(auditLogs).values({ actorEmail: anonymizedEmail, action: "delete-account", entityType: "user", entityId: String(current.id), afterJson: JSON.stringify({ anonymized: true }), createdAt: now });
  return Response.json({ ok: true, deletedAt: now }, { headers: mobileNoStoreHeaders });
}
