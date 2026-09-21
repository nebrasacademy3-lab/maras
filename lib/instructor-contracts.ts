import { createHash } from "node:crypto";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, notificationsDb, users } from "@/db/schema";
import { instructorContracts, instructorProfiles } from "@/db/instructor-schema";
import { cleanText } from "@/lib/api";
import { clientIp, verifyPassword, type SessionUser } from "@/lib/auth";
import { getPublicSettings } from "@/lib/platform-settings";
import { decryptInstructorData, encryptInstructorData, InstructorError } from "@/lib/instructor-security";
import { validateInstructorSignature, validInstructorRate } from "@/lib/instructor-policy";

export type InstructorContractRow = typeof instructorContracts.$inferSelect;
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
export type EmploymentDetails = { startDate: string; endDate: string; workLocation: string; weeklyHours: number; nationality: string; paymentTermsAr: string; paymentTermsEn: string; benefitsAr: string; benefitsEn: string };
function employmentInput(value: unknown): EmploymentDetails {
 const data = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
 const weeklyHours = Number(data.weeklyHours);
 return { startDate: cleanText(data.startDate, 10), endDate: cleanText(data.endDate, 10), workLocation: cleanText(data.workLocation, 300), nationality: cleanText(data.nationality, 100), weeklyHours: Number.isFinite(weeklyHours) ? weeklyHours : 0, paymentTermsAr: cleanText(data.paymentTermsAr, 3000), paymentTermsEn: cleanText(data.paymentTermsEn, 3000), benefitsAr: cleanText(data.benefitsAr, 3000), benefitsEn: cleanText(data.benefitsEn, 3000) };
}
export function validateEmploymentOffer(value: EmploymentDetails) {
 const realDate = (text: string) => /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(text + "T00:00:00Z")) && new Date(text + "T00:00:00Z").toISOString().slice(0,10) === text;
 if (!realDate(value.startDate) || value.endDate && (!realDate(value.endDate) || value.endDate <= value.startDate)) throw new InstructorError("حدد تاريخ مباشرة صحيحاً ونهاية صحيحة للعقد المحدد المدة");
 if (value.workLocation.length < 3 || value.nationality.length < 2 || !Number.isFinite(value.weeklyHours) || value.weeklyHours <= 0 || value.weeklyHours > 48) throw new InstructorError("أكمل الجنسية ومكان العمل وساعات العمل الأسبوعية ضمن الحد المعتاد");
 if (value.paymentTermsAr.length < 10 || value.paymentTermsEn.length < 10 || value.benefitsAr.length < 5 || value.benefitsEn.length < 5) throw new InstructorError("أكمل مواعيد وآلية دفع الأجر والمزايا باللغتين قبل تقديم العقد");
}
export function instructorContractInput(payload: Record<string, unknown>) {
 const title = cleanText(payload.title, 200), termsAr = cleanText(payload.termsAr, 30000), termsEn = cleanText(payload.termsEn, 30000);
 const compensationModel = cleanText(payload.compensationModel, 10), rateHalalas = Number(payload.rateHalalas), trialDays = Number(payload.trialDays);
 const trialTermsAr = cleanText(payload.trialTermsAr, 3000), trialTermsEn = cleanText(payload.trialTermsEn, 3000);
 if (title.length < 5 || termsAr.length < 100 || termsEn.length < 100 || !["hourly","course"].includes(compensationModel) || !validInstructorRate(rateHalalas)) throw new InstructorError("أكمل عنوان العقد والبنود باللغتين ونظام الأجر وسعره");
 if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 180 || trialTermsAr.length < 10 || trialTermsEn.length < 10) throw new InstructorError("حدد التجربة من 0 إلى 180 يوماً وشروط التقييم باللغتين");
 return { title, termsAr, termsEn, compensationModel, rateHalalas, trialDays, trialTermsAr, trialTermsEn, employmentJson: JSON.stringify(employmentInput(payload.employment)) };
}
export function contractTermsDigest(row: InstructorContractRow) {
 return createHash("sha256").update(JSON.stringify({ id: row.id, userId: row.userId, version: row.version, title: row.title, termsAr: row.termsAr, termsEn: row.termsEn, compensationModel: row.compensationModel, rateHalalas: row.rateHalalas, trialDays: row.trialDays, trialTermsAr: row.trialTermsAr, trialTermsEn: row.trialTermsEn, employmentJson: row.employmentJson, organizationJson: row.organizationJson, instructorJson: row.instructorJson })).digest("hex");
}
export function contractView(row: InstructorContractRow) {
 if (row.status !== "draft" && row.contentHash !== contractTermsDigest(row)) throw new InstructorError("تعذر التحقق من سلامة نسخة العقد", 503, "CONTRACT_INTEGRITY");
 if (row.status === "signed" || row.status === "terminated") {
  const expected = createHash("sha256").update(JSON.stringify({ contentHash: row.contentHash, signatureJson: row.signatureJson, userId: row.userId, signedAt: row.signedAt })).digest("hex");
  if (row.signatureHash !== expected || !row.signatureJson || !validateInstructorSignature(JSON.parse(row.signatureJson))) throw new InstructorError("تعذر التحقق من سلامة دليل التوقيع", 503, "CONTRACT_INTEGRITY");
 }
 const { instructorJson, organizationJson, employmentJson, signatureJson, signedIp: _ip, signedUserAgent: _agent, signatureHash: _hash, ...safe } = row;
 void _ip; void _agent; void _hash;
 return { ...safe, instructor: JSON.parse(decryptInstructorData(instructorJson, `contract-party:${row.userId}:${row.version}`)), organization: JSON.parse(organizationJson), employment: JSON.parse(employmentJson), signature: signatureJson ? JSON.parse(signatureJson) : null };
}
export async function listInstructorContracts(userId: number, owner: boolean) {
 const rows = await getDb().select().from(instructorContracts).where(and(eq(instructorContracts.userId, userId), owner ? undefined : ne(instructorContracts.status, "draft"))).orderBy(desc(instructorContracts.version)).limit(100);
 return rows.map(contractView);
}
async function lockedProfile(tx: Tx, userId: number, allowInactive = false) {
 await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"instructor:" + userId}))`);
 const [profile] = await tx.select().from(instructorProfiles).where(eq(instructorProfiles.userId, userId)).for("update");
 const [user] = await tx.select().from(users).where(and(eq(users.id, userId), eq(users.role, "instructor"), allowInactive ? undefined : eq(users.status, "active"))).for("share");
 if (!profile || !user || !allowInactive && !user.emailVerifiedAt) throw new InstructorError("حساب الشارح غير متاح", 404);
 return { profile, user };
}
async function audit(tx: Tx, actor: SessionUser, request: Request, action: string, id: number, data: Record<string, unknown>) {
 await tx.insert(auditLogs).values({ actorEmail: actor.email, action: `instructor.contract.${action}`, entityType: "instructor_contract", entityId: String(id), afterJson: JSON.stringify(data), ipAddress: clientIp(request) });
}
async function notify(tx: Tx, row: InstructorContractRow, title: string, body: string) {
 await tx.insert(notificationsDb).values({ targetUserId: row.userId, audience: "user", title, body, actionUrl: "/instructor", actionLabel: "فتح عقد العمل", dedupeKey: `instructor-contract:${row.id}:${row.status}:${row.revision}` }).onConflictDoNothing();
}
export async function mutateInstructorContract(actor: SessionUser, request: Request, payload: Record<string, unknown>) {
 const action = cleanText(payload.action, 20), userId = Number(payload.userId), id = Number(payload.id), expectedRevision = Number(payload.expectedRevision);
 if (!Number.isSafeInteger(userId) || userId < 1 || !["save","offer","withdraw","terminate"].includes(action)) throw new InstructorError("بيانات العقد غير صالحة");
 const settings = action === "save" || action === "offer" ? await getPublicSettings() : null;
 return getDb().transaction(async tx => {
  const { profile, user } = await lockedProfile(tx, userId, action === "withdraw" || action === "terminate");
  if (action !== "withdraw" && action !== "terminate" && profile.status !== "approved") throw new InstructorError("اعتمد ملف الشارح بعد مراجعة مستنداته أولاً", 409);
  const [existing] = Number.isSafeInteger(id) && id > 0 ? await tx.select().from(instructorContracts).where(and(eq(instructorContracts.id, id), eq(instructorContracts.userId, userId))).for("update") : [];
  if (payload.id && !existing) throw new InstructorError("العقد غير موجود", 404);
  if (existing && existing.revision !== expectedRevision) throw new InstructorError("تغير العقد؛ حدّث النسخة قبل متابعة الإجراء", 409, "CONTRACT_CONFLICT");
  const now = new Date().toISOString();
  if (action === "save") {
   if (existing && existing.status !== "draft") throw new InstructorError("أنشئ نسخة جديدة؛ لا يمكن تغيير عقد معروض أو موقع", 409);
   const data = instructorContractInput(payload);
   const [last] = await tx.select({ version: instructorContracts.version }).from(instructorContracts).where(eq(instructorContracts.userId, userId)).orderBy(desc(instructorContracts.version)).limit(1);
   const version = existing?.version || (last?.version || 0) + 1;
   const party = encryptInstructorData(JSON.stringify({ fullName: user.fullName, email: user.email, phone: user.phone, country: profile.country, address: decryptInstructorData(profile.addressEncrypted, `address:${userId}`) }), `contract-party:${userId}:${version}`);
   const values = { ...data, instructorJson: party, organizationJson: JSON.stringify(settings), updatedAt: now, revision: existing ? existing.revision + 1 : 1 };
   const [saved] = existing ? await tx.update(instructorContracts).set(values).where(eq(instructorContracts.id, id)).returning() : await tx.insert(instructorContracts).values({ ...values, userId, version, createdBy: actor.id }).returning();
   await audit(tx, actor, request, "saved", saved.id, { version, revision: saved.revision });
   return contractView(saved);
  }
  if (!existing) throw new InstructorError("العقد غير موجود", 404);
  if (action === "offer") {
   if (existing.status !== "draft") throw new InstructorError("يمكن تقديم مسودة العقد فقط", 409);
   validateEmploymentOffer(JSON.parse(existing.employmentJson));
   if (!settings?.legal_name || !settings.commercial_registration_number || !settings.legal_address) throw new InstructorError("أكمل اسم المنشأة والسجل التجاري وعنوانها في الإعدادات قبل تقديم العقد");
   const [open] = await tx.select({ id: instructorContracts.id }).from(instructorContracts).where(and(eq(instructorContracts.userId, userId), sql`${instructorContracts.status} IN ('offered','signed')`)).limit(1);
   if (open) throw new InstructorError("يوجد عقد معروض أو سارٍ؛ اسحبه أو أنهه بإجراء موثق قبل تقديم نسخة بديلة", 409);
   const current = { ...existing, organizationJson: JSON.stringify(settings) };
   const [offered] = await tx.update(instructorContracts).set({ organizationJson: current.organizationJson, contentHash: contractTermsDigest(current), status: "offered", offeredAt: now, updatedAt: now, revision: existing.revision + 1 }).where(eq(instructorContracts.id, id)).returning();
   await audit(tx, actor, request, "offered", id, { hash: offered.contentHash, version: offered.version });
   await notify(tx, offered, "عقد العمل جاهز للمراجعة", "راجع جميع بنود العقد ثم وقّع إذا وافقت على النسخة المعروضة.");
   return contractView(offered);
  }
  const reason = cleanText(payload.reason, 1000);
  if (reason.length < 5 || (action === "withdraw" ? existing.status !== "offered" : existing.status !== "signed")) throw new InstructorError("تحقق من حالة العقد واكتب سبب الإجراء");
  const [changed] = await tx.update(instructorContracts).set({ status: action === "withdraw" ? "withdrawn" : "terminated", revision: existing.revision + 1, updatedAt: now }).where(eq(instructorContracts.id, id)).returning();
  await audit(tx, actor, request, action, id, { reason, contentHash: existing.contentHash });
  await notify(tx, changed, action === "withdraw" ? "تم سحب عرض العقد" : "تم تحديث حالة عقد العمل", reason);
  return contractView(changed);
 });
}
export async function signInstructorContract(user: SessionUser, request: Request, id: number, payload: Record<string, unknown>) {
 if (payload.accepted !== true || !validateInstructorSignature(payload.signature)) throw new InstructorError("اقرأ العقد ووافق عليه وأضف توقيعاً واضحاً");
 const password = typeof payload.password === "string" ? payload.password : "";
 if (!password || password.length > 128) throw new InstructorError("أدخل كلمة مرور حسابك لتأكيد التوقيع");
 return getDb().transaction(async tx => {
  const { profile, user: account } = await lockedProfile(tx, user.id);
  if (profile.status !== "approved") throw new InstructorError("ملف الشارح غير معتمد للتوقيع", 403);
  if (!await verifyPassword(password, account.passwordHash)) throw new InstructorError("كلمة المرور غير صحيحة", 403, "CONTRACT_REAUTH_REQUIRED");
  const [row] = await tx.select().from(instructorContracts).where(and(eq(instructorContracts.id, id), eq(instructorContracts.userId, user.id))).for("update");
  if (!row || row.status !== "offered") throw new InstructorError("العقد غير متاح للتوقيع", 409);
  if (row.revision !== Number(payload.expectedRevision) || payload.contentHash !== row.contentHash || row.contentHash !== contractTermsDigest(row)) throw new InstructorError("تغيرت نسخة العقد. افتحها واقرأها من جديد قبل التوقيع", 409, "CONTRACT_CONFLICT");
  const signedAt = new Date().toISOString(), signatureJson = JSON.stringify(payload.signature);
  const signatureHash = createHash("sha256").update(JSON.stringify({ contentHash: row.contentHash, signatureJson, userId: user.id, signedAt })).digest("hex");
  const [signed] = await tx.update(instructorContracts).set({ status: "signed", signatureJson, signatureHash, signedAt, signedIp: clientIp(request), signedUserAgent: (request.headers.get("user-agent") || "").slice(0,300), revision: row.revision + 1, updatedAt: signedAt }).where(eq(instructorContracts.id, id)).returning();
  await audit(tx, user, request, "signed", id, { contentHash: row.contentHash, signatureHash, signedAt });
  await notify(tx, signed, "تم حفظ توقيع عقد العمل", "نسخة العقد الموقعة متاحة لك للتنزيل؛ ستظهر التكليفات التي تعتمدها الإدارة في حسابك.");
  return contractView(signed);
 });
}
