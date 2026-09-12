import { adminUserTransitionError } from "@/lib/admin-operations";
import { AdminMfaError, requireAdminStepUp } from "@/lib/admin-mfa";
import { readBoundedJsonObject } from "@/lib/request-body";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, authSessions, pushDevices, supervisorAssignments, users } from "@/db/schema";
import { checkRateLimit, clientIp, getSessionUser, hashPassword, roleAllowed, sameOriginRequest, validEmail, validPassword, validSaudiPhone } from "@/lib/auth";
import { cleanText, isAdminRequest, jsonError, normalizePhone } from "@/lib/api";
import { getInstitutionCatalog, getProgramsCatalog } from "@/lib/catalog-store";

function canonicalPhone(value: string) {
  const digits = normalizePhone(value).replace(/\D/g, "");
  if (digits.startsWith("966")) return `+${digits}`;
  if (digits.startsWith("0")) return `+966${digits.slice(1)}`;
  return `+966${digits}`;
}

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function ensureAssignment(db: Db | Tx, userId: number, role: string, universitySlug: string, specialty: string) {
  if (role !== "supervisor") return;
  const [assignment] = await db.select({ id: supervisorAssignments.id }).from(supervisorAssignments).where(and(
    eq(supervisorAssignments.supervisorId, userId),
    eq(supervisorAssignments.institutionSlug, universitySlug),
    eq(supervisorAssignments.specialty, specialty),
  )).limit(1);
  if (!assignment) await db.insert(supervisorAssignments).values({ supervisorId: userId, institutionSlug: universitySlug, specialty, active: true });
}

async function auditStaffChange(db: Db | Tx, actorEmail: string, request: Request, action: "create" | "update", userId: number, before: unknown, after: unknown) {
  await db.insert(auditLogs).values({
    actorEmail,
    action,
    entityType: "staff_user",
    entityId: String(userId),
    beforeJson: before == null ? null : JSON.stringify(before),
    afterJson: after == null ? null : JSON.stringify(after),
    ipAddress: clientIp(request),
  });
}

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const machineAuthorized = isAdminRequest(request);
  if (!machineAuthorized && !sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const session = machineAuthorized ? null : await getSessionUser(request);
  if (!roleAllowed(session, ["admin"])) return jsonError("غير مصرح", 401);

  const identity = machineAuthorized ? `machine:${clientIp(request)}` : `user:${session!.id}`;
  if (!await checkRateLimit("admin-staff", identity, 20, 60)) return jsonError("طلبات إدارية كثيرة. حاول بعد دقيقة.", 429);

  if (!machineAuthorized && session) {
    try { await requireAdminStepUp(request, session); }
    catch (error) {
      if (error instanceof AdminMfaError) return Response.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
      throw error;
    }
  }
  let payload: Record<string, unknown>;
  try { payload = await readBoundedJsonObject(request, 32 * 1024); } catch { return jsonError("بيانات غير صالحة"); }
  const email = cleanText(payload.email, 180).toLowerCase();
  const fullName = cleanText(payload.fullName, 120);
  const rawPhone = normalizePhone(payload.phone);
  const phone = canonicalPhone(rawPhone);
  const password = typeof payload.password === "string" ? payload.password : "";
  const role = cleanText(payload.role, 20);
  const universitySlug = cleanText(payload.universitySlug, 120).toLowerCase();
  const specialty = cleanText(payload.specialty, 120);

  if (!["admin", "supervisor"].includes(role)) return jsonError("الدور يجب أن يكون admin أو supervisor");
  if (!validEmail(email) || fullName.length < 5 || !validSaudiPhone(rawPhone)) return jsonError("تحقق من بيانات الموظف");
  const institution = await getInstitutionCatalog(universitySlug);
  if (!institution) return jsonError("اختر جامعة صالحة");
  const programs = await getProgramsCatalog(universitySlug);
  if (!programs.programs.some((item) => item.name === specialty)) return jsonError("اختر تخصصًا مرتبطًا بالجامعة");

  const db = getDb();
  const [existing] = await db.select().from(users).where(or(eq(users.email, email), eq(users.phone, phone))).limit(1);
  const now = new Date().toISOString();
  const actor = session?.email || "admin-api-token";

  if (existing) {
    const emailMatches = existing.email.toLowerCase() === email;
    const phoneMatches = existing.phone === phone;
    if (!emailMatches && !phoneMatches) return jsonError("البريد والهاتف مرتبطان بحسابين مختلفين");
    if (session && existing.id === session.id && role !== "admin") return jsonError("لا يمكنك إزالة صلاحية حسابك الإداري الحالي");
    if (password && !validPassword(password)) return jsonError("كلمة المرور الجديدة لا تحقق المتطلبات");
    const after = { email, phone, fullName, role, universitySlug, specialty, status: "active" };
    const passwordHash = password ? await hashPassword(password) : undefined;
    const changed = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'active-admin-membership'}))`);
      const [current] = await tx.select().from(users).where(eq(users.id, existing.id)).for("update");
      if (!current) return "الموظف غير موجود";
      const activeAdmins = await tx.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active")));
      const error = adminUserTransitionError(current, { role, status: "active" }, session?.id || null, activeAdmins.length);
      if (error) return error;
      if (current.email !== email) return "لا يمكن تغيير هوية الحساب من نموذج الموظفين";
      await tx.update(users).set({
      email,
      phone,
      fullName,
      role: role as "admin" | "supervisor",
      universitySlug,
      specialty,
      profileCompletedAt: now,
      passwordHash: passwordHash ?? current.passwordHash,
      status: "active",
      updatedAt: now,
    }).where(eq(users.id, existing.id));
      if (passwordHash || current.role !== role) {
        await tx.update(authSessions).set({ revokedAt: now }).where(and(eq(authSessions.userId, existing.id), isNull(authSessions.revokedAt)));
        await tx.update(pushDevices).set({ status: "revoked", lastSeenAt: now }).where(eq(pushDevices.userId, existing.id));
      }
      await ensureAssignment(tx, existing.id, role, universitySlug, specialty);
      await auditStaffChange(tx, actor, request, "update", existing.id, { email: current.email, role: current.role, status: current.status }, { ...after, passwordReset: Boolean(passwordHash) });
      return null;
    });
    if (changed) return jsonError(changed, 409);
    return response({ ok: true, user: { id: existing.id, email, role, updated: true } });
  }

  if (!validPassword(password)) return jsonError("أدخل كلمة مرور قوية من 10 أحرف مع رقم ورمز");
  const [created] = await db.insert(users).values({
    email,
    phone,
    fullName,
    passwordHash: await hashPassword(password),
    role: role as "admin" | "supervisor",
    universitySlug,
    specialty,
    profileCompletedAt: now,
    onboardingCompletedAt: now,
    status: "active",
    createdAt: now,
    updatedAt: now,
  }).returning({ id: users.id, email: users.email, role: users.role });
  await ensureAssignment(db, created.id, role, universitySlug, specialty);
  await auditStaffChange(db, actor, request, "create", created.id, null, { email, role, universitySlug, specialty, status: "active" });
  return response({ ok: true, user: created }, 201);
}
