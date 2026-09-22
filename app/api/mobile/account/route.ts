import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs, authSessions, courseAccess, storeCourseGrants, courseRequestFiles, courseRequests, courseReviews, favorites,
  lessonNotes, lessonProgress, notificationsDb, passwordResetTokens, pushDevices, supervisorAssignments,
  supportReplyFiles, supportReplies, supportTickets, users,
} from "@/db/schema";
import { checkRateLimit, getSessionUser, hashOpaqueToken, requestSessionToken, verifyPassword } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { isMobileRequest, mobileNoStoreHeaders } from "@/lib/mobile-api";
import { removeAccountPrivateData } from "@/lib/account-deletion-data";
import { enqueueStorageCleanupTx, processStorageCleanupBatch } from "@/lib/storage-cleanup";
import { processAppleRevocations } from "@/lib/apple-account-tokens";
import { consumeEmailCode, requestEmailCode, EmailCodeError } from "@/lib/email-verification";
import { EmailDeliveryError } from "@/lib/transactional-email";
import { readBoundedJsonObject } from "@/lib/request-body";

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
const deletionAllowed = (role: string) => role === "student" || role === "instructor";
export async function GET(request: Request) {
  if (!isMobileRequest(request)) return jsonError("طلب تطبيق غير صالح", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  const [row] = await getDb().select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id,user.id)).limit(1);
  return Response.json({ ok:true, allowed:deletionAllowed(user.role), method:row?.passwordHash ? "password" : "email_code" },{headers:mobileNoStoreHeaders});
}
export async function POST(request: Request) {
  if (!isMobileRequest(request)) return jsonError("طلب تطبيق غير صالح", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  if (!deletionAllowed(user.role)) return jsonError("الحساب الإداري يديره المدير الأعلى",403);
  try { return Response.json(await requestEmailCode(user.id,"delete_account",request),{headers:mobileNoStoreHeaders}); }
  catch(error) { if(error instanceof EmailCodeError || error instanceof EmailDeliveryError) return jsonError(error.message,error.status,error.code); return jsonError("تعذر إرسال رمز الحذف",503); }
}
export async function DELETE(request: Request) {
  try { return await deleteAccount(request); } catch(error) { if(error instanceof EmailCodeError) return jsonError(error.message,error.status,error.code); throw error; }
}
async function deleteAccount(request: Request) {
  if (!isMobileRequest(request)) return jsonError("طلب تطبيق غير صالح", 403);
  const current = await getSessionUser(request);
  if (!current) return jsonError("سجّل الدخول", 401);
  if (!await checkRateLimit("delete-account", `user:${current.id}`, 5, 60 * 60)) return jsonError("محاولات حذف كثيرة. حاول لاحقًا.", 429);
  let payload: Record<string, unknown>;
  try { payload = await readBoundedJsonObject(request); } catch { return jsonError("بيانات الحذف غير صالحة"); }
  if (payload.userId !== undefined && payload.userId !== current.id) return jsonError("تغيّر الحساب؛ حدّث الصفحة قبل المتابعة.", 409);
  if (payload.confirmation !== "حذف حسابي") return jsonError("اكتب عبارة التأكيد المطلوبة");
  const password = typeof payload.password === "string" ? payload.password : "";
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.id, current.id)).limit(1);
  if (!row) return jsonError("الحساب غير متاح",401);
  const byEmail = typeof payload.code === "string" && payload.code.trim().length > 0;
  if (!byEmail && (!row.passwordHash || !await verifyPassword(password, row.passwordHash))) return jsonError("أدخل كلمة المرور أو رمز تأكيد الحذف المرسل لبريدك",401);
  if (!deletionAllowed(current.role) || current.isPlatformOwner) return jsonError("حذف الحساب الإداري أو الإشرافي يتم من الإدارة",403);
  const now = new Date().toISOString();
  const anonymizedEmail = `deleted+${current.id}+${Date.now()}@meras.invalid`;
  const token = requestSessionToken(request);
  const tokenHash = token ? await hashOpaqueToken(token) : "";
  const perform = async (tx: Transaction) => {
    if (current.role === "instructor") await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"instructor:"+current.id}))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${current.id})`);
    const [session] = await tx.select({ id: authSessions.id }).from(authSessions).where(and(
      eq(authSessions.userId, current.id), eq(authSessions.tokenHash, tokenHash),
      isNull(authSessions.revokedAt), gt(authSessions.expiresAt, new Date().toISOString()),
    )).limit(1).for("update");
    const [fresh] = await tx.select().from(users).where(eq(users.id, current.id)).limit(1).for("update");
    if (!session || !tokenHash || !fresh || fresh.status !== "active") return { error: "انتهت الجلسة. سجّل الدخول مجددًا قبل حذف الحساب.", status: 401 } as const;
    if (!deletionAllowed(fresh.role) || fresh.isPlatformOwner || fresh.role !== current.role || fresh.email !== current.email || fresh.passwordHash !== row.passwordHash) return { error: "تغيّرت بيانات الحساب أثناء الطلب. سجّل الدخول مجددًا.", status: 409 } as const;
    // Select deletion targets only after locking and revalidating this account.
    // Historical reply authorship is not proof that the account owns a ticket.
    const requestRows = await tx.select({ id: courseRequests.id }).from(courseRequests).where(eq(courseRequests.userId, fresh.id));
    const requestIds = requestRows.map((row) => row.id);
    const requestFileRows = requestIds.length ? await tx.select({ objectKey: courseRequestFiles.objectKey }).from(courseRequestFiles).where(inArray(courseRequestFiles.requestId, requestIds)) : [];
    const ticketRows = await tx.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.userId, fresh.id));
    const ticketIds = ticketRows.map((row) => row.id);
    const authoredReplyRows = ticketIds.length ? await tx.select({ id: supportReplies.id }).from(supportReplies).where(inArray(supportReplies.ticketId, ticketIds)) : [];
    const replyIds = authoredReplyRows.map((row) => row.id);
    const supportFileRows = replyIds.length || ticketIds.length
      ? await tx.select({ objectKey: supportReplyFiles.objectKey }).from(supportReplyFiles).where(or(...[ticketIds.length ? inArray(supportReplyFiles.ticketId, ticketIds) : undefined, replyIds.length ? inArray(supportReplyFiles.replyId, replyIds) : undefined].filter((value): value is NonNullable<typeof value> => Boolean(value))))
      : [];
    const privateData = await removeAccountPrivateData(tx, fresh.id, now);
    const cleanupJobIds = await enqueueStorageCleanupTx(tx, [...privateData.targets,...[...requestFileRows,...supportFileRows].map(file => ({ key:file.objectKey, source:"account-deletion" }))]);
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
    await tx.delete(favorites).where(eq(favorites.userId, fresh.id));
    await tx.delete(lessonNotes).where(eq(lessonNotes.userId, fresh.id));
    await tx.delete(lessonProgress).where(eq(lessonProgress.userId, fresh.id));
    await tx.delete(courseAccess).where(eq(courseAccess.userId, fresh.id));
    await tx.update(storeCourseGrants).set({ userEmail: anonymizedEmail }).where(eq(storeCourseGrants.userId, fresh.id));
    await tx.delete(courseReviews).where(eq(courseReviews.userId, fresh.id));
    await tx.delete(notificationsDb).where(eq(notificationsDb.targetUserId, fresh.id));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, fresh.id));
    await tx.delete(supervisorAssignments).where(eq(supervisorAssignments.supervisorId, fresh.id));
    // Financial snapshots remain unchanged and bound to this retained account ID.
    // Existing audit rows are immutable and are intentionally not rewritten.
    await tx.update(users).set({ email: anonymizedEmail, phone: null, fullName: "حساب محذوف", passwordHash: null, universitySlug: null, specialty: null, academicLevel: null, profileCompletedAt: null, onboardingCompletedAt: null, emailVerifiedAt: null, phoneVerifiedAt: null, lastLoginAt: null, status: "deleted", updatedAt: now }).where(eq(users.id, fresh.id));
    await tx.update(authSessions).set({ revokedAt: now }).where(eq(authSessions.userId, fresh.id));
    await tx.delete(pushDevices).where(eq(pushDevices.userId, fresh.id));
    await tx.insert(auditLogs).values({ actorEmail: anonymizedEmail, action: "delete-account", entityType: "user", entityId: String(fresh.id), afterJson: JSON.stringify({ anonymized: true, financialRecordsRetained: true }), createdAt: now });
    return { cleanupJobIds, appleManualRevocationRequired: privateData.appleManualRevocationRequired };
  };
  const result = byEmail ? await consumeEmailCode(current.id,"delete_account",payload.code,request,perform) : await db.transaction(perform);

  if ("error" in result) return jsonError(result.error!, result.status);
  await processStorageCleanupBatch(db,{jobIds:result.cleanupJobIds.slice(0,10),limit:10}).catch(() => undefined);
  await processAppleRevocations({userId:current.id}).catch(() => undefined);
  return Response.json({ ok:true,deletedAt:now,appleManualRevocationRequired:result.appleManualRevocationRequired },{headers:mobileNoStoreHeaders});
}
