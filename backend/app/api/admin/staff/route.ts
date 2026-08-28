import { and, eq, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, supervisorAssignments, users } from "@/db/schema";
import { checkRateLimit, clientIp, getSessionUser, hashPassword, roleAllowed, sameOriginRequest, validEmail, validPassword, validSaudiPhone } from "@/lib/auth";
import { cleanText, isAdminRequest, isUniqueConstraintError, jsonError, normalizePhone } from "@/lib/api";
import { getInstitutionCatalog, getProgramsCatalog } from "@/lib/catalog-store";
import { hasConfirmedExistingStaffUpdate, resolveStaffIdentityMatches, STAFF_UPDATE_CONFIRMATION, staffAccountSummary } from "@/lib/staff-account-contract";

function canonicalPhone(value: string) {
  const digits = normalizePhone(value).replace(/\D/g, "");
  if (digits.startsWith("966")) return `+${digits}`;
  if (digits.startsWith("0")) return `+966${digits.slice(1)}`;
  return `+966${digits}`;
}

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

export async function POST(request: Request) {
  const machineAuthorized = isAdminRequest(request);
  if (!machineAuthorized && !sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const session = machineAuthorized ? null : await getSessionUser(request);
  if (!machineAuthorized && !roleAllowed(session, ["admin"])) return jsonError("غير مصرح", 401);

  const identity = machineAuthorized ? `machine:${clientIp(request)}` : `user:${session!.id}`;
  if (!await checkRateLimit("admin-staff", identity, 20, 60)) return jsonError("طلبات إدارية كثيرة. حاول بعد دقيقة.", 429);

  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات غير صالحة"); }
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
  const identityRows = await db.select().from(users).where(or(sql`lower(${users.email}) = ${email}`, eq(users.phone, phone))).limit(2);
  const { emailAccount, phoneAccount, existing, identitiesConflict } = resolveStaffIdentityMatches(identityRows, email, phone);
  const now = new Date().toISOString();
  const actor = session?.email || "admin-api-token";

  if (identitiesConflict) {
    return response({
      ok: false,
      error: "البريد والجوال مرتبطان بحسابين مختلفين. راجع الحسابين قبل المتابعة.",
      code: "STAFF_IDENTITY_CONFLICT",
      conflicts: {
        email: emailAccount ? staffAccountSummary(emailAccount) : null,
        phone: phoneAccount ? staffAccountSummary(phoneAccount) : null,
      },
    }, 409);
  }

  if (existing) {
    const existingSummary = staffAccountSummary(existing);
    const emailMatches = existing.email.toLowerCase() === email;

    if (payload.allowExisting !== true) {
      return response({
        ok: false,
        error: "يوجد حساب بهذه البيانات. أكّد صراحةً إذا كنت تقصد تحديث الحساب الحالي.",
        code: "STAFF_ACCOUNT_EXISTS",
        existing: existingSummary,
        confirmation: STAFF_UPDATE_CONFIRMATION,
      }, 409);
    }
    if (!hasConfirmedExistingStaffUpdate(payload)) {
      return response({
        ok: false,
        error: `اكتب عبارة «${STAFF_UPDATE_CONFIRMATION}» حرفيًا لتأكيد تعديل الحساب الحالي.`,
        code: "STAFF_UPDATE_CONFIRMATION_REQUIRED",
        existing: existingSummary,
        confirmation: STAFF_UPDATE_CONFIRMATION,
      }, 409);
    }
    if (!emailMatches) {
      return response({
        ok: false,
        error: "لا يمكن تغيير بريد حساب موظف من هذا المسار لأنه مفتاح لسجلات مترابطة؛ أنشئ حسابًا جديدًا أو استخدم إجراء ترحيل إداري موثق.",
        code: "STAFF_EMAIL_CHANGE_UNSUPPORTED",
        existing: existingSummary,
      }, 409);
    }
    if (session && existing.id === session.id && role !== "admin") return jsonError("لا يمكنك إزالة صلاحية حسابك الإداري الحالي");
    if (existing.role === "admin" && existing.status === "active" && role !== "admin") {
      const [result] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active")));
      if ((result?.count || 0) <= 1) return jsonError("لا يمكن إزالة صلاحية آخر مدير نشط في المنصة.", 409);
    }
    if (password && !validPassword(password)) return jsonError("كلمة المرور الجديدة لا تحقق المتطلبات");
    const after = { email, phone, fullName, role, universitySlug, specialty, status: "active" };
    const passwordHash = password ? await hashPassword(password) : existing.passwordHash;
    await db.transaction(async (tx) => {
      await tx.update(users).set({ email, phone, fullName, role: role as "admin" | "supervisor", universitySlug, specialty, profileCompletedAt: now, passwordHash, status: "active", updatedAt: now }).where(eq(users.id, existing.id));
      await tx.update(supervisorAssignments).set({ active: false }).where(eq(supervisorAssignments.supervisorId, existing.id));
      if (role === "supervisor") {
        await tx.insert(supervisorAssignments).values({ supervisorId: existing.id, institutionSlug: universitySlug, specialty, active: true }).onConflictDoUpdate({
          target: [supervisorAssignments.supervisorId, supervisorAssignments.institutionSlug, supervisorAssignments.specialty],
          set: { active: true },
        });
      }
      await tx.insert(auditLogs).values({ actorEmail: actor, action: "update", entityType: "staff_user", entityId: String(existing.id), beforeJson: JSON.stringify({ email: existing.email, role: existing.role, status: existing.status }), afterJson: JSON.stringify(after), ipAddress: clientIp(request) });
    });
    return response({ ok: true, user: { id: existing.id, email, role, updated: true } });
  }

  if (!validPassword(password)) return jsonError("أدخل كلمة مرور قوية من 10 أحرف مع رقم ورمز");
  const passwordHash = await hashPassword(password);
  let created: { id: number; email: string; role: string };
  try {
    created = await db.transaction(async (tx) => {
      const [row] = await tx.insert(users).values({ email, phone, fullName, passwordHash, role: role as "admin" | "supervisor", universitySlug, specialty, profileCompletedAt: now, onboardingCompletedAt: now, status: "active", createdAt: now, updatedAt: now }).returning({ id: users.id, email: users.email, role: users.role });
      if (role === "supervisor") await tx.insert(supervisorAssignments).values({ supervisorId: row.id, institutionSlug: universitySlug, specialty, active: true });
      await tx.insert(auditLogs).values({ actorEmail: actor, action: "create", entityType: "staff_user", entityId: String(row.id), beforeJson: null, afterJson: JSON.stringify({ email, role, universitySlug, specialty, status: "active" }), ipAddress: clientIp(request) });
      return row;
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return response({ ok: false, error: "أصبح البريد أو الجوال مرتبطًا بحساب آخر. حدّث البيانات وحاول مجددًا.", code: "STAFF_IDENTITY_CONFLICT" }, 409);
    }
    throw error;
  }
  return response({ ok: true, user: created }, 201);
}
