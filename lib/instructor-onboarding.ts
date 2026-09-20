import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { instructorProfiles } from "@/db/instructor-schema";
import { sameOriginRequest, type SessionUser } from "@/lib/auth";
import { isNativeAppRequest, isMobileRequest } from "@/lib/mobile-api";
import { jsonError, cleanText } from "@/lib/api";
import { AdminMfaError } from "@/lib/admin-mfa";
import { RequestBodyTooLargeError } from "@/lib/request-body";
import { InstructorError } from "@/lib/instructor-security";
import { INSTRUCTOR_QUALIFICATIONS, isInstructorApplicationEditable, validInstructorIban } from "@/lib/instructor-policy";

export const INSTRUCTOR_PRIVATE_HEADERS = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
export const INSTRUCTOR_FILE_LIMIT = 10 * 1024 * 1024;
export type InstructorTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
export function instructorApiError(error: unknown) {
 if (error instanceof InstructorError || error instanceof AdminMfaError) return jsonError(error.message, error.status, error.code);
 if (error instanceof RequestBodyTooLargeError) return jsonError("الملف أكبر من 10 ميجابايت", 413, "INSTRUCTOR_FILE_TOO_LARGE");
 if (error instanceof SyntaxError || error instanceof TypeError) return jsonError("بيانات الطلب غير صالحة", 400, "INSTRUCTOR_INVALID");
 return jsonError("تعذر إكمال الطلب الآن؛ حاول مجددًا", 503, "INSTRUCTOR_UNAVAILABLE");
}
export function instructorWriteRequest(request: Request) {
 if (!sameOriginRequest(request) && !isNativeAppRequest(request)) throw new InstructorError("تعذر التحقق من مصدر الطلب", 403, "INSTRUCTOR_ORIGIN");
}
export function instructorNativeRegistration(request: Request) {
 const platform = request.headers.get("x-meras-platform");
 return (platform === "ios" || platform === "android") && isMobileRequest(request) && !request.headers.get("origin") && !request.headers.get("sec-fetch-site") && !request.headers.get("sec-fetch-mode");
}
export function instructorRevision(value: unknown) {
 const number = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
 if (!Number.isSafeInteger(number) || number < 1) throw new InstructorError("حدّث الملف قبل حفظ التغييرات", 409, "INSTRUCTOR_REVISION_REQUIRED");
 return number;
}
export async function lockInstructorProfile(tx: InstructorTransaction, user: SessionUser, expectedRevision: number, editable = true) {
 await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"instructor:" + user.id}))`);
 const [profile] = await tx.select().from(instructorProfiles).where(eq(instructorProfiles.userId, user.id)).limit(1).for("update");
 if (!profile) throw new InstructorError("ملف الشارح غير موجود", 404);
 const [account] = await tx.select({ id: users.id, role: users.role, status: users.status, emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, user.id)).limit(1).for("share");
 if (!account || account.role !== "instructor" || account.status !== "active" || !account.emailVerifiedAt) throw new InstructorError("الحساب لم يعد متاحًا", 403);
 if (profile.revision !== expectedRevision) throw new InstructorError("تغير الملف في جلسة أخرى. حدّث الصفحة ثم أعد المحاولة", 409, "INSTRUCTOR_CONFLICT");
 if (editable && !isInstructorApplicationEditable(profile.status)) throw new InstructorError("لا يمكن تعديل الطلب أثناء المراجعة أو بعد اعتماد العقد", 409, "INSTRUCTOR_PROFILE_LOCKED");
 if (profile.status === "suspended") throw new InstructorError("الملف موقوف. تواصل مع الإدارة", 403, "INSTRUCTOR_SUSPENDED");
 return profile;
}
export function instructorProfileInput(payload: Record<string, unknown>) {
 const country = cleanText(payload.country, 2).toUpperCase(), gender = cleanText(payload.gender, 10), qualification = cleanText(payload.qualification, 30);
 const specialty = cleanText(payload.specialty, 160), address = cleanText(payload.address, 1000);
 const bio = cleanText(payload.bio, 4000), teachingSubjects = cleanText(payload.teachingSubjects, 3000);
 const compensationModel = cleanText(payload.compensationModel, 20) || "hourly";
 if (!/^[A-Z]{2}$/.test(country) || country === "ZZ" || !new Intl.DisplayNames(["en"], { type: "region", fallback: "none" }).of(country)) throw new InstructorError("اختر الدولة من القائمة");
 if (!["male", "female"].includes(gender) || !INSTRUCTOR_QUALIFICATIONS.some(value => value === qualification)) throw new InstructorError("اختر الجنس والمؤهل العلمي");
 if (specialty.length < 2 || address.length < 10) throw new InstructorError("أكمل التخصص والعنوان بالتفصيل");
 if (!["hourly", "course"].includes(compensationModel)) throw new InstructorError("اختر نظام العمل بالساعات أو بالمادة");
 return { country, gender, qualification, specialty, address, bio, teachingSubjects, compensationModel };
}
export function instructorBankInput(value: unknown) {
 if (!value || typeof value !== "object" || Array.isArray(value)) throw new InstructorError("بيانات الحساب البنكي غير صالحة");
 const bank = value as Record<string, unknown>;
 const accountHolder = cleanText(bank.accountHolder, 160), bankName = cleanText(bank.bankName, 160), iban = cleanText(bank.iban, 50).replace(/\s/g, "").toUpperCase();
 if (accountHolder.length < 5 || bankName.length < 2 || !validInstructorIban(iban)) throw new InstructorError("تحقق من اسم صاحب الحساب والبنك ورقم الآيبان");
 return { accountHolder, bankName, iban };
}
export function instructorFileType(kind: string, bytes: Uint8Array) {
 const png = bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
 const pdf = bytes.length >= 5 && Buffer.from(bytes.subarray(0,5)).toString("ascii") === "%PDF-";
 if (png) return "image/png";
 if (jpeg) return "image/jpeg";
 if (pdf && kind !== "selfie") return "application/pdf";
 throw new InstructorError("ارفع صورة PNG أو JPEG واضحة أو ملف PDF؛ الصورة الشخصية يجب أن تكون صورة", 415, "INSTRUCTOR_FILE_TYPE");
}
export function instructorIdentityKind(kind: string) { return ["identity_front", "identity_back", "passport", "selfie"].includes(kind); }
export function instructorDocumentContext(userId: number, key: string) {
 const match = /^instructors\/(\d+)\/documents\/([a-f0-9-]{36})\.enc$/.exec(key);
 if (!match || Number(match[1]) !== userId) throw new InstructorError("تعذر التحقق من الملف", 503, "INSTRUCTOR_DATA_UNAVAILABLE");
 return "document:" + userId + ":" + match[2];
}
