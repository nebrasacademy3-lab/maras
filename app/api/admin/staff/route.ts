import { and, count, desc, eq, gt, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accountMfaChallenges, accountMfaRecoveryCodes, adminMfaFactors, auditLogs, authSessions, pushDevices, staffPermissions, users } from "@/db/schema";
import { checkRateLimit, clientIp, getSessionUser, hashPassword, sameOriginRequest, validEmail, validPassword, validSaudiPhone } from "@/lib/auth";
import { AdminMfaError, requireAdminStepUp } from "@/lib/admin-mfa";
import { cleanText, jsonError, normalizePhone } from "@/lib/api";
import { readBoundedJsonObject, RequestBodyTooLargeError } from "@/lib/request-body";
import { ADMIN_PERMISSIONS, OWNER_ONLY, PERMISSION_LABELS, validStaffGrants } from "@/lib/staff-policy";

const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const owner = await getSessionUser(request);
  if (!owner?.isPlatformOwner) return jsonError("هذه الصفحة للمدير الأعلى فقط", 403);
  if (!await checkRateLimit("staff-read", String(owner.id), 60, 60)) return jsonError("طلبات كثيرة؛ حاول بعد دقيقة", 429);
  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Math.min(10000, Number(params.get("page")) || 1));
  const needle = cleanText(params.get("q"), 160).replace(/[\\%_]/g, "\\$&");
  const condition = and(inArray(users.role, ["admin", "supervisor"]), needle ? or(ilike(users.fullName, `%${needle}%`), ilike(users.email, `%${needle}%`)) : undefined);
  const db = getDb();
  const [rows, totals] = await Promise.all([
    db.select({ id: users.id, fullName: users.fullName, email: users.email, phone: users.phone, role: users.role, isPlatformOwner: users.isPlatformOwner, status: users.status, updatedAt: users.updatedAt, createdAt: users.createdAt }).from(users).where(condition).orderBy(desc(users.isPlatformOwner), users.id).limit(50).offset((Math.floor(page) - 1) * 50),
    db.select({ total: count() }).from(users).where(condition),
  ]);
  const ids = rows.map(row => row.id);
  const now = new Date().toISOString();
  const [grants, factors, sessions] = ids.length ? await Promise.all([
    db.select().from(staffPermissions).where(inArray(staffPermissions.userId, ids)),
    db.select({ userId: adminMfaFactors.userId, verifiedAt: adminMfaFactors.verifiedAt }).from(adminMfaFactors).where(and(inArray(adminMfaFactors.userId, ids), isNull(adminMfaFactors.disabledAt), sql`${adminMfaFactors.verifiedAt} IS NOT NULL`)),
    db.select({ id: authSessions.id, userId: authSessions.userId, deviceLabel: authSessions.deviceLabel, platform: authSessions.platform, userAgent: authSessions.userAgent, lastSeenAt: authSessions.lastSeenAt, createdAt: authSessions.createdAt, expiresAt: authSessions.expiresAt }).from(authSessions).where(and(inArray(authSessions.userId, ids), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, now))).orderBy(desc(authSessions.lastSeenAt)).limit(500),
  ]) : [[], [], []];
  return Response.json({ ok: true, page: Math.floor(page), pageSize: 50, total: Number(totals[0]?.total || 0), permissions: Object.values(ADMIN_PERMISSIONS).filter(value => !OWNER_ONLY.has(value)).map(key => ({ key, label: PERMISSION_LABELS[key] })), staff: rows.map(row => ({ ...row, permissions: row.isPlatformOwner ? Object.values(ADMIN_PERMISSIONS) : grants.filter(grant => grant.userId === row.id).map(grant => grant.permission), mfaEnabled: factors.some(factor => factor.userId === row.id), sessions: sessions.filter(session => session.userId === row.id), sessionsMayBeTruncated: sessions.length === 500 })) }, { headers });
}

class StaffError extends Error { constructor(message: string, public status = 400) { super(message); } }
export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const owner = await getSessionUser(request);
  if (!owner?.isPlatformOwner) return jsonError("إدارة المشرفين متاحة للمدير الأعلى فقط", 403);
  if (!await checkRateLimit("staff-write", String(owner.id), 20, 60)) return jsonError("طلبات كثيرة؛ حاول بعد دقيقة", 429);
  try {
    await requireAdminStepUp(request, owner);
    const payload = await readBoundedJsonObject(request, 16 * 1024);
    const action = cleanText(payload.action, 32) || "save";
    if (!["save", "revokeSession", "suspend", "activate", "resetMfa"].includes(action)) throw new StaffError("إجراء غير معروف");
    const db = getDb(); const now = new Date().toISOString();
    const email = cleanText(payload.email, 180).toLowerCase();
    const fullName = cleanText(payload.fullName, 120);
    const password = typeof payload.password === "string" ? payload.password : "";
    const reason = cleanText(payload.reason, 600);
    if (password && (password.length > 128 || !validPassword(password))) throw new StaffError("كلمة المرور لا تحقق المتطلبات");
    if (action === "save" && (!validEmail(email) || fullName.length < 5 || payload.role && payload.role !== "supervisor" || !validStaffGrants(payload.permissions))) throw new StaffError("تحقق من الاسم والبريد والصلاحيات؛ يُضاف أعضاء الإدارة كمشرفين فقط");
    if (action !== "save" && reason.length < 4) throw new StaffError("اكتب سبب الإجراء ليحفظ في سجل التدقيق");
    const rawPhone = normalizePhone(payload.phone);
    if (rawPhone && !validSaudiPhone(rawPhone)) throw new StaffError("رقم الجوال غير صالح");
    const digits = rawPhone.replace(/\D/g, "");
    const phone = digits ? `+${digits.startsWith("966") ? digits : `966${digits.replace(/^0/, "")}`}` : null;
    const passwordHash = password ? await hashPassword(password) : null;
    const result = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'active-admin-membership'}))`);
      const id = Number(payload.id);
      const targetWhere = action === "save" && !payload.id ? eq(users.email, email) : eq(users.id, Number.isSafeInteger(id) ? id : -1);
      const [candidate] = await tx.select({ id: users.id }).from(users).where(targetWhere).limit(1);
      if (candidate) await tx.execute(sql`SELECT pg_advisory_xact_lock(${candidate.id})`);
      const [existing] = await tx.select().from(users).where(targetWhere).for("update");
      if (payload.id && !existing) throw new StaffError("الحساب المطلوب غير موجود", 404);
      if (existing?.isPlatformOwner || existing?.id === owner.id) throw new StaffError("حساب المدير الأعلى محمي؛ لا يمكن إدارته من صفحة المشرفين", 403);
      if (existing && payload.expectedUpdatedAt && payload.expectedUpdatedAt !== existing.updatedAt) throw new StaffError("تغير الحساب أثناء التحرير. حدّث بياناته ثم حاول مجددًا", 409);
      if (action !== "save" && !existing) throw new StaffError("الحساب غير موجود", 404);
      if (existing?.role === "student" && !["save", "resetMfa"].includes(action)) throw new StaffError("استخدم إدارة الطلاب لهذا الحساب");
      let targetId = existing?.id;
      let before: unknown = existing ? { email: existing.email, role: existing.role, status: existing.status } : null;
      let after: Record<string, unknown> = { action, reason };
      if (action === "save") {
        if (existing && existing.email.toLowerCase() !== email) throw new StaffError("لا يمكن تغيير هوية الحساب من نموذج المشرفين");
        if (!existing && !passwordHash) throw new StaffError("أدخل كلمة مرور قوية للمشرف الجديد");
        const values = { email, fullName, phone, role: "supervisor", status: "active", profileCompletedAt: now, onboardingCompletedAt: now, updatedAt: now };
        if (existing) await tx.update(users).set({ ...values, passwordHash: passwordHash || existing.passwordHash }).where(eq(users.id, existing.id));
        else { const [created] = await tx.insert(users).values({ ...values, passwordHash, createdAt: now }).returning({ id: users.id }); targetId = created.id; }
        const previousGrants = await tx.select({ permission: staffPermissions.permission }).from(staffPermissions).where(eq(staffPermissions.userId, targetId!));
        before = existing ? { ...(before as object), permissions: previousGrants.map(row => row.permission) } : null;
        await tx.delete(staffPermissions).where(eq(staffPermissions.userId, targetId!));
        const permissions = [...new Set(payload.permissions as string[])];
        if (permissions.length) await tx.insert(staffPermissions).values(permissions.map(permission => ({ userId: targetId!, permission, grantedBy: owner.id, createdAt: now })));
        after = { ...values, permissions, passwordChanged: Boolean(passwordHash) };
      } else if (action === "suspend" || action === "activate") {
        await tx.update(users).set({ status: action === "suspend" ? "suspended" : "active", updatedAt: now }).where(eq(users.id, targetId!));
      } else if (action === "resetMfa") {
        await tx.update(adminMfaFactors).set({ disabledAt: now, secretEncrypted: null, updatedAt: now }).where(and(eq(adminMfaFactors.userId, targetId!), isNull(adminMfaFactors.disabledAt)));
        await tx.delete(accountMfaRecoveryCodes).where(eq(accountMfaRecoveryCodes.userId, targetId!));
      }
      const specificSession = action === "revokeSession" && payload.sessionId !== "all";
      if (specificSession && (!Number.isSafeInteger(Number(payload.sessionId)) || Number(payload.sessionId) < 1)) throw new StaffError("معرف الجلسة غير صالح");
      // Permission changes take effect at the server immediately; revoke credentials too.
      const revoked = await tx.update(authSessions).set({ revokedAt: now }).where(and(eq(authSessions.userId, targetId!), isNull(authSessions.revokedAt), specificSession ? eq(authSessions.id, Number(payload.sessionId)) : undefined)).returning({ id: authSessions.id });
      if (specificSession && !revoked.length) throw new StaffError("الجلسة ليست نشطة أو لا تتبع هذا الحساب", 404);
      await tx.update(accountMfaChallenges).set({ usedAt: now }).where(and(eq(accountMfaChallenges.userId, targetId!), isNull(accountMfaChallenges.usedAt)));
      if (!specificSession) await tx.update(pushDevices).set({ status: "revoked", lastSeenAt: now }).where(eq(pushDevices.userId, targetId!));
      await tx.insert(auditLogs).values({ actorEmail: owner.email, action: `staff.${action}`, entityType: "staff_user", entityId: String(targetId), beforeJson: JSON.stringify(before), afterJson: JSON.stringify({ ...after, revokedSessions: revoked.length }), ipAddress: clientIp(request), createdAt: now });
      return { id: targetId, email: existing?.email || email, role: action === "save" ? "supervisor" : existing!.role, revokedSessions: revoked.length };
    });
    return Response.json({ ok: true, user: result }, { headers });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return jsonError(error.message, 413);
    if (error instanceof SyntaxError || error instanceof TypeError) return jsonError("بيانات الطلب غير صالحة", 400);
    if (error instanceof AdminMfaError) return jsonError(error.message, error.status, error.code);
    if (error instanceof StaffError) return jsonError(error.message, error.status);
    const code = (error as { cause?: { code?: string }; code?: string })?.cause?.code || (error as { code?: string })?.code;
    if (code === "23505") return jsonError("البريد أو رقم الجوال مستخدم بحساب آخر", 409);
    console.error("[staff] request failed without exposing account credentials");
    return jsonError("تعذر حفظ المشرف. راجع البيانات وحاول مجددًا", 500);
  }
}
