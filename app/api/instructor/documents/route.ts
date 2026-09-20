import { enqueueStorageCleanupTx } from "@/lib/storage-cleanup";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, storageCleanupJobs } from "@/db/schema";
import { instructorDocuments, instructorProfiles } from "@/db/instructor-schema";
import { checkRateLimit, clientIp } from "@/lib/auth";
import { boundedRequestBody } from "@/lib/request-body";
import { readScanBytes, scanBuffer } from "@/lib/file-security";
import { activeStorageProvider, putObject, deleteObject } from "@/lib/storage";
import { encryptInstructorData, InstructorError, instructorActor, instructorIdentityCollectionPolicy } from "@/lib/instructor-security";
import { INSTRUCTOR_DOCUMENT_KINDS, isInstructorApplicationEditable } from "@/lib/instructor-policy";
import { instructorApiError, instructorDocumentContext, instructorFileType, instructorIdentityKind, instructorRevision, instructorWriteRequest, INSTRUCTOR_FILE_LIMIT, INSTRUCTOR_PRIVATE_HEADERS, lockInstructorProfile } from "@/lib/instructor-onboarding";
export async function POST(request: Request) {
 let stored: Awaited<ReturnType<typeof putObject>> | null = null;
 let committed = false;
 try {
  instructorWriteRequest(request);
  const user = await instructorActor(request);
  if (!await checkRateLimit("instructor-document-upload", String(user.id), 20, 3600)) throw new InstructorError("بلغت حد محاولات رفع المستندات. حاول لاحقًا", 429);
  const [profile] = await getDb().select().from(instructorProfiles).where(eq(instructorProfiles.userId, user.id)).limit(1);
  if (!profile || !isInstructorApplicationEditable(profile.status)) throw new InstructorError("لا يمكن تغيير مستندات الطلب في حالته الحالية", 409);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]);
  const maxBody = INSTRUCTOR_FILE_LIMIT + 64 * 1024;
  const multipart = await readScanBytes(boundedRequestBody(request, maxBody), maxBody, signal);
  const form = await new Response(new Uint8Array(multipart), { headers: { "content-type": request.headers.get("content-type") || "" } }).formData();
  const expectedRevision = instructorRevision(form.get("expectedRevision"));
  const kind = String(form.get("kind") || "");
  if (!INSTRUCTOR_DOCUMENT_KINDS.some(value => value === kind)) throw new InstructorError("نوع المستند غير صالح");
  const identity = instructorIdentityKind(kind), policy = await instructorIdentityCollectionPolicy();
  if (identity && !policy.enabled) throw new InstructorError("استقبال صور الهوية غير متاح حتى اكتمال إعدادات حفظها لدى الإدارة", 503, "INSTRUCTOR_IDENTITY_UNAVAILABLE");
  if (kind === "selfie" && form.get("captureSource") !== "camera") throw new InstructorError("التقط صورتك باستخدام الكاميرا من صفحة التقديم", 400, "INSTRUCTOR_CAMERA_REQUIRED");
  const file = form.get("file");
  if (!(file instanceof File) || form.getAll("file").length !== 1 || file.size < 1 || file.size > INSTRUCTOR_FILE_LIMIT) throw new InstructorError("ارفع ملفًا واحدًا لا يتجاوز 10 ميجابايت", 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  const contentType = instructorFileType(kind, bytes);
  const scan = await scanBuffer(bytes, signal);
  if (scan.status !== "clean" || !scan.sha256) throw new InstructorError(scan.status === "quarantined" ? "رُفض الملف بعد الفحص الأمني" : "خدمة فحص الملفات غير متاحة الآن؛ لم يُحفظ المستند", scan.status === "quarantined" ? 422 : 503, "INSTRUCTOR_SCAN_REQUIRED");
  const id = randomUUID(), objectKey = "instructors/" + user.id + "/documents/" + id + ".enc";
  const ciphertext = Buffer.from(encryptInstructorData(bytes.toString("base64"), instructorDocumentContext(user.id, objectKey)), "utf8");
  const provider = activeStorageProvider();
  // Register cleanup before writing bytes, so a process crash cannot orphan a confidential object.
  // The one-hour delay exceeds this request's bounded upload window. Success cancels it atomically.
  const stagingJobId = await getDb().transaction(async tx => {
   const [jobId] = await enqueueStorageCleanupTx(tx, [{ key: objectKey, provider, source: "instructor-document-staging" }]);
   await tx.update(storageCleanupJobs).set({ availableAt: new Date(Date.now() + 3600_000) }).where(eq(storageCleanupJobs.id, jobId));
   return jobId;
  });
  stored = await putObject(objectKey, new Blob([new Uint8Array(ciphertext)]).stream(), "application/octet-stream", provider, { maxBytes: 22 * 1024 * 1024, signal });
  const now = new Date().toISOString(), expiresAt = identity ? new Date(Date.now() + policy.retentionDays * 86_400_000).toISOString() : null;
  const extension = contentType === "application/pdf" ? "pdf" : contentType === "image/png" ? "png" : "jpg";
  // Server filename avoids embedded HTML/control characters or customer metadata leaking into headers.
  const originalName = kind + "." + extension;
  const storageProvider = stored.provider;
  const result = await getDb().transaction(async tx => {
   const current = await lockInstructorProfile(tx, user, expectedRevision);
   const [stagingJob] = await tx.select({ id: storageCleanupJobs.id }).from(storageCleanupJobs).where(and(eq(storageCleanupJobs.id, stagingJobId), eq(storageCleanupJobs.status, "pending"), eq(storageCleanupJobs.objectKey, objectKey))).limit(1).for("update");
   if (!stagingJob) throw new InstructorError("انتهت مهلة حفظ الملف؛ أعد الرفع", 409);
   const documents = await tx.select({ id: instructorDocuments.id, kind: instructorDocuments.kind }).from(instructorDocuments).where(eq(instructorDocuments.userId, user.id));
   if (documents.length >= 12) throw new InstructorError("الحد الأقصى 12 مستندًا؛ احذف مستندًا غير مطلوب أولاً", 409);
   if (kind !== "certificate" && documents.some(document => document.kind === kind)) throw new InstructorError("يوجد مستند من هذا النوع. احذفه قبل استبداله", 409);
   const [document] = await tx.insert(instructorDocuments).values({ userId: user.id, kind, objectKey, storageProvider, originalName, contentType, sizeBytes: bytes.length, sha256: scan.sha256!, scanStatus: "clean", expiresAt, identityLegalBasis: identity ? policy.basis : null, createdAt: now }).returning({ id: instructorDocuments.id });
   const revision = current.revision + 1;
   await tx.update(instructorProfiles).set({ revision, updatedAt: now }).where(eq(instructorProfiles.userId, user.id));
   await tx.insert(auditLogs).values({ actorEmail: user.email, action: "instructor_document_uploaded", entityType: "instructor_document", entityId: String(document.id), afterJson: JSON.stringify({ userId: user.id, kind, revision, expiresAt }), ipAddress: clientIp(request), createdAt: now });
   await tx.delete(storageCleanupJobs).where(eq(storageCleanupJobs.id, stagingJobId));
   return { id: document.id, revision, expiresAt };
  });
  committed = true;
  return Response.json({ ok: true, ...result }, { status: 201, headers: INSTRUCTOR_PRIVATE_HEADERS });
 } catch (error) { return instructorApiError(error); }
 // Failed attempts keep their pre-registered durable cleanup job, even if immediate deletion fails.
 finally { if (stored && !committed) await deleteObject(stored.key, stored.provider, AbortSignal.timeout(15_000)).catch(() => undefined); }
}
