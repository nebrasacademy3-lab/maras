import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";
import { instructorDocuments, instructorProfiles } from "@/db/instructor-schema";
import { checkRateLimit, clientIp, getSessionUser } from "@/lib/auth";
import { readBoundedJsonObject } from "@/lib/request-body";
import { readScanBytes } from "@/lib/file-security";
import { getObject, deleteObject } from "@/lib/storage";
import { decryptInstructorData, InstructorError, instructorActor, instructorOwner } from "@/lib/instructor-security";
import { instructorApiError, instructorDocumentContext, instructorRevision, instructorWriteRequest, INSTRUCTOR_FILE_LIMIT, INSTRUCTOR_PRIVATE_HEADERS, lockInstructorProfile } from "@/lib/instructor-onboarding";
type Context = { params: Promise<{ id: string }> };
function documentId(value: string) { if (!/^[1-9]\d{0,9}$/.test(value) || !Number.isSafeInteger(Number(value))) throw new InstructorError("المستند غير موجود", 404); return Number(value); }
export async function GET(request: Request, context: Context) {
 try {
  const id = documentId((await context.params).id);
  const session = await getSessionUser(request);
  const administrator = session?.role === "admin" && session.isPlatformOwner === true;
  const user = administrator ? await instructorOwner(request, true) : await instructorActor(request);
  if (!await checkRateLimit("instructor-document-read", String(user.id), 30, 300)) throw new InstructorError("طلبات كثيرة. حاول لاحقًا", 429);
  const db = getDb();
  const [document] = await db.select().from(instructorDocuments).where(administrator ? eq(instructorDocuments.id, id) : and(eq(instructorDocuments.id, id), eq(instructorDocuments.userId, user.id))).limit(1);
  if (!document || document.scanStatus !== "clean") throw new InstructorError("المستند غير موجود", 404);
  if (document.expiresAt && (!Number.isFinite(Date.parse(document.expiresAt)) || Date.parse(document.expiresAt) <= Date.now())) throw new InstructorError("انتهت مدة حفظ مستند التحقق", 410, "INSTRUCTOR_DOCUMENT_EXPIRED");
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
  const provider = document.storageProvider === "s3" ? "s3" : document.storageProvider === "local" ? "local" : null;
  if (!provider) throw new InstructorError("تعذر التحقق من الملف المحفوظ", 503);
  const object = await getObject(document.objectKey, undefined, provider, signal);
  if (!object) throw new InstructorError("المستند غير موجود", 404);
  if (object.size > 22 * 1024 * 1024) { await object.body.cancel(); throw new InstructorError("تعذر التحقق من الملف المحفوظ", 503); }
  const encrypted = await readScanBytes(object.body, 22 * 1024 * 1024, signal);
  const base64 = decryptInstructorData(encrypted.toString("utf8"), instructorDocumentContext(document.userId, document.objectKey));
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 1 || bytes.length > INSTRUCTOR_FILE_LIMIT || bytes.length !== document.sizeBytes || !/^[a-f0-9]{64}$/.test(document.sha256) || !timingSafeEqual(createHash("sha256").update(bytes).digest(), Buffer.from(document.sha256, "hex"))) throw new InstructorError("تعذر التحقق من سلامة المستند", 503, "INSTRUCTOR_DATA_UNAVAILABLE");
  await db.insert(auditLogs).values({ actorEmail: user.email, action: "instructor_document_downloaded", entityType: "instructor_document", entityId: String(id), afterJson: JSON.stringify({ ownerId: document.userId, administrator }), ipAddress: clientIp(request), createdAt: new Date().toISOString() });
  const extension = document.contentType === "application/pdf" ? "pdf" : document.contentType === "image/png" ? "png" : "jpg";
  return new Response(new Uint8Array(bytes), { headers: { ...INSTRUCTOR_PRIVATE_HEADERS, "content-type": document.contentType, "content-length": String(bytes.length), "content-disposition": 'attachment; filename="maras-document-' + id + '.' + extension + '"', "content-security-policy": "default-src 'none'; sandbox" } });
 } catch (error) { return instructorApiError(error); }
}
export async function DELETE(request: Request, context: Context) {
 try {
  instructorWriteRequest(request);
  const user = await instructorActor(request), id = documentId((await context.params).id);
  if (!await checkRateLimit("instructor-document-delete", String(user.id), 20, 900)) throw new InstructorError("محاولات كثيرة. حاول لاحقًا", 429);
  const body = await readBoundedJsonObject(request, 1024), expectedRevision = instructorRevision(body.expectedRevision);
  const result = await getDb().transaction(async tx => {
   const profile = await lockInstructorProfile(tx, user, expectedRevision);
   const [document] = await tx.select().from(instructorDocuments).where(and(eq(instructorDocuments.id, id), eq(instructorDocuments.userId, user.id))).limit(1);
   if (!document) throw new InstructorError("المستند غير موجود", 404);
   const provider = document.storageProvider === "s3" ? "s3" : document.storageProvider === "local" ? "local" : null;
   if (!provider) throw new InstructorError("تعذر حذف الملف المحفوظ", 503);
   instructorDocumentContext(user.id, document.objectKey);
   await deleteObject(document.objectKey, provider, AbortSignal.timeout(12_000));
   await tx.delete(instructorDocuments).where(and(eq(instructorDocuments.id, id), eq(instructorDocuments.userId, user.id)));
   const now = new Date().toISOString(), revision = profile.revision + 1;
   await tx.update(instructorProfiles).set({ revision, updatedAt: now }).where(eq(instructorProfiles.userId, user.id));
   await tx.insert(auditLogs).values({ actorEmail: user.email, action: "instructor_document_deleted", entityType: "instructor_document", entityId: String(id), afterJson: JSON.stringify({ ownerId: user.id, kind: document.kind, revision }), ipAddress: clientIp(request), createdAt: now });
   return { revision };
  });
  return Response.json({ ok: true, ...result }, { headers: INSTRUCTOR_PRIVATE_HEADERS });
 } catch (error) { return instructorApiError(error); }
}
