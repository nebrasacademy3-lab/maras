import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, notificationsDb, users } from "@/db/schema";
import { instructorDocuments, instructorProfiles } from "@/db/instructor-schema";
import { checkRateLimit, clientIp } from "@/lib/auth";
import { readBoundedJsonObject } from "@/lib/request-body";
import { decryptInstructorData, encryptInstructorData, InstructorError, instructorActor, instructorIdentityCollectionPolicy } from "@/lib/instructor-security";
import { instructorApiError, instructorBankInput, instructorProfileInput, instructorRevision, instructorWriteRequest, INSTRUCTOR_PRIVATE_HEADERS, lockInstructorProfile } from "@/lib/instructor-onboarding";
export async function GET(request: Request) {
 try {
  const user = await instructorActor(request);
  if (!await checkRateLimit("instructor-profile-read", String(user.id), 60, 60)) throw new InstructorError("طلبات كثيرة. حاول بعد قليل", 429);
  const db = getDb();
  const [profile] = await db.select().from(instructorProfiles).where(eq(instructorProfiles.userId, user.id)).limit(1);
  if (!profile) throw new InstructorError("ملف الشارح غير موجود", 404);
  const documents = await db.select({ id: instructorDocuments.id, kind: instructorDocuments.kind, originalName: instructorDocuments.originalName, contentType: instructorDocuments.contentType, sizeBytes: instructorDocuments.sizeBytes, createdAt: instructorDocuments.createdAt, expiresAt: instructorDocuments.expiresAt }).from(instructorDocuments).where(eq(instructorDocuments.userId, user.id)).orderBy(desc(instructorDocuments.id));
  return Response.json({ ok: true, user: { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone }, profile: { country: profile.country, gender: profile.gender, qualification: profile.qualification, specialty: profile.specialty, address: decryptInstructorData(profile.addressEncrypted, "address:" + user.id), bio: profile.bio, teachingSubjects: profile.teachingSubjects, compensationModel: profile.compensationModel, status: profile.status, reviewNotes: profile.reviewNotes, revision: profile.revision, submittedAt: profile.submittedAt, createdAt: profile.createdAt, updatedAt: profile.updatedAt, bank: profile.bankEncrypted ? JSON.parse(decryptInstructorData(profile.bankEncrypted, "bank:" + user.id)) : null }, documents, identityCollection: await instructorIdentityCollectionPolicy() }, { headers: INSTRUCTOR_PRIVATE_HEADERS });
 } catch (error) { return instructorApiError(error); }
}
export async function POST(request: Request) {
 try {
  instructorWriteRequest(request);
  const user = await instructorActor(request);
  if (!await checkRateLimit("instructor-profile-write", String(user.id), 30, 900)) throw new InstructorError("محاولات كثيرة. حاول لاحقًا", 429);
  const body = await readBoundedJsonObject(request, 16 * 1024), expectedRevision = instructorRevision(body.expectedRevision);
  if (!["save", "submit", "bank"].includes(String(body.action))) throw new InstructorError("الإجراء غير صالح");
  const now = new Date().toISOString();
  const submissionPolicy = body.action === "submit" ? await instructorIdentityCollectionPolicy() : null;
  const result = await getDb().transaction(async tx => {
   const current = await lockInstructorProfile(tx, user, expectedRevision, body.action !== "bank");
   const revision = current.revision + 1;
   let patch: Partial<typeof instructorProfiles.$inferInsert>;
   if (body.action === "save") {
    const { address, ...fields } = instructorProfileInput(body);
    patch = { ...fields, addressEncrypted: encryptInstructorData(address, "address:" + user.id) };
   } else if (body.action === "bank") {
    patch = { bankEncrypted: encryptInstructorData(JSON.stringify(instructorBankInput(body.bank)), "bank:" + user.id) };
   } else {
    if (current.bio.trim().length < 30 || current.teachingSubjects.trim().length < 3) throw new InstructorError("اكتب نبذة عن خبرتك والمواد التي تستطيع شرحها قبل التقديم");
    const identityPolicy = submissionPolicy;
    if (!identityPolicy?.enabled) throw new InstructorError("تجهيز استقبال مستندات التحقق لدى الإدارة قيد الإكمال. يمكنك حفظ طلبك كمسودة الآن", 503, "INSTRUCTOR_IDENTITY_UNAVAILABLE");
    const documents = await tx.select({ kind: instructorDocuments.kind, expiresAt: instructorDocuments.expiresAt }).from(instructorDocuments).where(and(eq(instructorDocuments.userId, user.id), eq(instructorDocuments.scanStatus, "clean")));
    const kinds = new Set(documents.filter(document => !document.expiresAt || Date.parse(document.expiresAt) > Date.now()).map(document => document.kind));
    if (!kinds.has("selfie")) throw new InstructorError("التقط وأرفق صورتك الشخصية أولاً");
    if (!kinds.has("passport") && !(kinds.has("identity_front") && kinds.has("identity_back"))) throw new InstructorError("أرفق جواز السفر أو وجهي الهوية بصورة واضحة قبل التقديم");
    patch = { status: "submitted", submittedAt: now };
    const [owner] = await tx.select({ id: users.id }).from(users).where(and(eq(users.isPlatformOwner, true), eq(users.role, "admin"), eq(users.status, "active"))).limit(1);
    if (owner) await tx.insert(notificationsDb).values({ targetUserId: owner.id, userEmail: null, audience: "admin", title: "طلب انضمام شارح جديد", body: "وصل طلب انضمام لفريق مراس وهو جاهز للمراجعة", actionUrl: "/admin/instructors", actionLabel: "مراجعة الطلب", dedupeKey: "instructor:" + user.id + ":submitted:" + revision, pushEnabled: true, pushStatus: "pending", createdAt: now });
   }
   await tx.update(instructorProfiles).set({ ...patch, revision, updatedAt: now }).where(eq(instructorProfiles.userId, user.id));
   await tx.insert(auditLogs).values({ actorEmail: user.email, action: "instructor_profile_" + String(body.action), entityType: "instructor", entityId: String(user.id), afterJson: JSON.stringify({ revision, status: patch.status || current.status }), ipAddress: clientIp(request), createdAt: now });
   return { revision, status: patch.status || current.status };
  });
  return Response.json({ ok: true, ...result }, { headers: INSTRUCTOR_PRIVATE_HEADERS });
 } catch (error) { return instructorApiError(error); }
}
