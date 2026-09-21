import { eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { users, auditLogs } from "@/db/schema";
import { instructorProfiles } from "@/db/instructor-schema";
import { consumeRateLimit, clientIp, createSession, DeviceLimitError, hashPassword, sameOriginRequest, sessionUserFromRow, validEmail, validPassword } from "@/lib/auth";
import { ensureVerificationEmail } from "@/lib/email-verification";
import { cleanText, isUniqueConstraintError } from "@/lib/api";
import { readBoundedJsonObject } from "@/lib/request-body";
import { encryptInstructorData, InstructorError } from "@/lib/instructor-security";
import { validInstructorPhone } from "@/lib/instructor-policy";
import { instructorApiError, instructorNativeRegistration, instructorProfileInput, INSTRUCTOR_PRIVATE_HEADERS } from "@/lib/instructor-onboarding";
async function registrationLimit(scope: string, identity: string, limit: number, seconds: number, account = false) {
 const result = await consumeRateLimit(scope, identity, limit, seconds);
 if (result.allowed) return null;
 const wait = result.retryAfterSeconds <= 60 ? "دقيقة" : Math.ceil(result.retryAfterSeconds / 60) + " دقيقة";
 return Response.json({ ok: false, error: account ? "محاولات كثيرة للبريد أو رقم الجوال. حاول بعد " + wait + " أو سجّل الدخول إن كان لديك حساب." : "طلبات تسجيل كثيرة من هذه الشبكة. حاول بعد " + wait + ".", code: account ? "INSTRUCTOR_REGISTRATION_IDENTITY_LIMIT" : "INSTRUCTOR_REGISTRATION_NETWORK_LIMIT", retryAfterSeconds: result.retryAfterSeconds }, { status: 429, headers: { ...INSTRUCTOR_PRIVATE_HEADERS, "retry-after": String(result.retryAfterSeconds) } });
}

export async function POST(request: Request) {
 try {
  const native = instructorNativeRegistration(request);
  if (!native && !sameOriginRequest(request)) throw new InstructorError("تعذر التحقق من مصدر الطلب", 403);
  const ip = clientIp(request);
  // Invalid form edits only consume a short network burst, never an hour-long lock.
  const burst = await registrationLimit("instructor-register-burst-v2", ip, 60, 60);
  if (burst) return burst;
  const body = await readBoundedJsonObject(request, 16 * 1024);
  const fullName = cleanText(body.fullName, 120).replace(/\s+/g, " "), email = cleanText(body.email, 180).toLowerCase(), phone = cleanText(body.phone, 20);
  const password = typeof body.password === "string" ? body.password : "";
  const profile = instructorProfileInput(body);
  if (fullName.length < 5 || !validEmail(email) || !validInstructorPhone(phone)) throw new InstructorError("تحقق من الاسم الكامل والبريد ورقم الهاتف بصيغة دولية مثل +966…");
  if (password.length > 128 || !validPassword(password)) throw new InstructorError("استخدم كلمة مرور من 10 إلى 128 حرفًا تحتوي رقمًا ورمزًا خاصًا");
  if (body.termsAccepted !== true || body.privacyAccepted !== true) throw new InstructorError("يلزم الموافقة على الشروط وسياسة الخصوصية");

  // Validate encryption before committing any account or personally identifiable data.
  encryptInstructorData("configuration-check", "register-check");
  // Separate dimensions prevent rotating one field to evade the other field's limit.
  const emailLimit = await registrationLimit("instructor-register-email-v2", email, 5, 15 * 60, true);
  if (emailLimit) return emailLimit;
  const phoneLimit = await registrationLimit("instructor-register-phone-v2", phone, 5, 15 * 60, true);
  if (phoneLimit) return phoneLimit;
  const db = getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(or(eq(users.email, email), eq(users.phone, phone))).limit(1);
  if (existing) throw new InstructorError("يوجد حساب مرتبط بالبريد أو رقم الهاتف. سجّل الدخول أو تواصل مع الدعم", 409, "INSTRUCTOR_ACCOUNT_EXISTS");
  // Reserve creation only after validation, readiness and duplicate checks.
  const creationLimit = await registrationLimit("instructor-register-create-v2", ip, 20, 3600);
  if (creationLimit) return creationLimit;
  const passwordHash = await hashPassword(password), now = new Date().toISOString();
  const created = await db.transaction(async tx => {
   const [user] = await tx.insert(users).values({ fullName, email, phone, passwordHash, role: "instructor", status: "active", profileCompletedAt: now, createdAt: now, updatedAt: now }).onConflictDoNothing().returning();
   if (!user) throw new InstructorError("يوجد حساب مرتبط بالبريد أو رقم الهاتف", 409, "INSTRUCTOR_ACCOUNT_EXISTS");
   const { address, ...fields } = profile;
   await tx.insert(instructorProfiles).values({ ...fields, userId: user.id, addressEncrypted: encryptInstructorData(address, "address:" + user.id), status: "draft", createdAt: now, updatedAt: now });
   await tx.insert(auditLogs).values({ actorEmail: email, action: "instructor_registered", entityType: "instructor", entityId: String(user.id), afterJson: JSON.stringify({ termsAccepted: true, privacyAccepted: true, consentAt: now }), ipAddress: clientIp(request), createdAt: now });
   return user;
  });
  const session = await createSession(created.id, request, true);
  const verification = await ensureVerificationEmail(created.id, request);
  const headers = new Headers(INSTRUCTOR_PRIVATE_HEADERS);
  if (!native) { headers.append("set-cookie", session.cookie); if (session.deviceCookie) headers.append("set-cookie", session.deviceCookie); }
  return Response.json({ ok: true, user: sessionUserFromRow(created), next: "/verify-email?return_to=%2Finstructor", verification, ...(native ? { token: session.token, expiresAt: session.expiresAt } : {}) }, { status: 201, headers });
 } catch (error) {
  if (error instanceof DeviceLimitError) return instructorApiError(new InstructorError("بلغ الحساب حد الجهازين المعتمدين. تواصل مع الدعم", 409));
  if (isUniqueConstraintError(error)) return instructorApiError(new InstructorError("يوجد حساب مرتبط بالبريد أو رقم الهاتف", 409));
  return instructorApiError(error);
 }
}
