/** Shared wire contract. Byte hashes bind every part, not just name and size. */
export const STUDY_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
export const STUDY_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
export const STUDY_UPLOAD_TYPES: ReadonlySet<string> = new Set([
  "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "text/markdown", "image/png", "image/jpeg",
]);
export class StudyUploadError extends Error {
  constructor(message: string, public status = 400, public code = "STUDY_UPLOAD_INVALID") { super(message); this.name = "StudyUploadError"; }
}
export function studyUploadId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)) throw new StudyUploadError("معرّف جلسة الرفع غير صالح.");
  return value.toLowerCase();
}
export type StudyUploadManifest = { requestKey: string; originalName: string; contentType: string; sizeBytes: number; hashes: string[]; conversationId: number | null };
export function studyUploadManifest(input: Record<string, unknown>): StudyUploadManifest {
  const requestKey = studyUploadId(input.requestKey), originalName = input.originalName, contentType = input.contentType, sizeBytes = input.sizeBytes;
  if (typeof originalName !== "string" || !originalName.trim() || originalName.length > 180 || /[\\/\u0000-\u001f\u007f]/.test(originalName)) throw new StudyUploadError("اسم الملف غير صالح.");
  if (typeof contentType !== "string" || !STUDY_UPLOAD_TYPES.has(contentType)) throw new StudyUploadError("نوع الملف غير مدعوم.", 415);
  if (typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > STUDY_UPLOAD_MAX_BYTES) throw new StudyUploadError("حجم الملف أكبر من سياسة الرفع المتاحة.", 413);
  const hashes = input.hashes;
  if (!Array.isArray(hashes) || hashes.length !== Math.ceil(sizeBytes / STUDY_UPLOAD_CHUNK_BYTES) || hashes.some(h => typeof h !== "string" || !/^[a-f0-9]{64}$/.test(h))) throw new StudyUploadError("بصمات أجزاء الملف غير صالحة.");
  const conversationId = input.conversationId ?? null;
  if (conversationId !== null && (typeof conversationId !== "number" || !Number.isSafeInteger(conversationId) || conversationId < 1)) throw new StudyUploadError("معرّف المحادثة غير صالح.");
  return { requestKey, originalName: originalName.trim(), contentType, sizeBytes, hashes: [...hashes], conversationId };
}
export function studyPartSize(size: number, index: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > STUDY_UPLOAD_MAX_BYTES || !Number.isSafeInteger(index) || index < 0 || index >= Math.ceil(size / STUDY_UPLOAD_CHUNK_BYTES)) throw new StudyUploadError("رقم الجزء غير صالح.");
  return Math.min(STUDY_UPLOAD_CHUNK_BYTES, size - index * STUDY_UPLOAD_CHUNK_BYTES);
}
export type StudyUploadReceipt = { id: string; status: "open" | "completed"; received: number[]; chunkBytes: number; sizeBytes: number; expiresAt: string; file?: { id: number; conversationId: number | null; originalName: string; contentType: string; sizeBytes: number; status: string; scanStatus: string; createdAt: string } };
export function parseStudyUploadReceipt(value: unknown, size: number): StudyUploadReceipt {
  const row = value as StudyUploadReceipt;
  if (!row || typeof row !== "object" || row.sizeBytes !== size || row.chunkBytes !== STUDY_UPLOAD_CHUNK_BYTES || !["open", "completed"].includes(row.status) || !Array.isArray(row.received) || row.received.some(i => !Number.isSafeInteger(i) || i < 0 || i >= Math.ceil(size / STUDY_UPLOAD_CHUNK_BYTES)) || new Set(row.received).size !== row.received.length || !Number.isFinite(Date.parse(row.expiresAt))) throw new StudyUploadError("استجابة الرفع غير صالحة.", 502);
  studyUploadId(row.id);
  if (row.status === "completed" && (!row.file || !Number.isSafeInteger(row.file.id) || row.file.id < 1 || row.file.sizeBytes !== size || !["ready", "pending_scan"].includes(row.file.status))) throw new StudyUploadError("إيصال اعتماد الملف غير صالح.", 502);
  return row;
}
