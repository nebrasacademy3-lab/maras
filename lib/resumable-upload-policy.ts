export const RESUMABLE_CHUNK_BYTES = 4 * 1024 * 1024;
export const RESUMABLE_MAX_BYTES = 200 * 1024 * 1024;
export const RESUMABLE_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-matroska", "video/x-msvideo"]);
export class ResumableUploadError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = "ResumableUploadError"; }
}
export type UploadManifest = { courseSlug: string; lessonId: string; contentType: string; sizeBytes: number; hashes: string[]; requestKey: string };
export function validateUploadId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw new ResumableUploadError("معرّف الرفع غير صالح");
  return value.toLowerCase();
}
export function validateUploadManifest(value: Record<string, unknown>): UploadManifest {
  const { courseSlug, lessonId, contentType, sizeBytes, hashes } = value;
  if (typeof courseSlug !== "string" || typeof lessonId !== "string" || !/^[a-zA-Z0-9._-]{1,120}$/.test(courseSlug) || !/^[a-zA-Z0-9._-]{1,120}$/.test(lessonId)
    || [courseSlug, lessonId].some(v => v === "." || v === "..")) throw new ResumableUploadError("المادة أو الدرس غير صالح");
  if (typeof contentType !== "string" || !RESUMABLE_TYPES.has(contentType)) throw new ResumableUploadError("نوع الفيديو غير مدعوم");
  if (typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > RESUMABLE_MAX_BYTES) throw new ResumableUploadError("حجم الفيديو أكبر من المسموح", 413);
  if (!Array.isArray(hashes) || hashes.length !== Math.ceil(sizeBytes / RESUMABLE_CHUNK_BYTES) || hashes.some(hash => typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))) throw new ResumableUploadError("بصمات أجزاء الفيديو غير صالحة");
  return { courseSlug, lessonId, contentType, sizeBytes, hashes, requestKey: validateUploadId(value.requestKey) };
}
export function uploadPartSize(size: number, index: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > RESUMABLE_MAX_BYTES || !Number.isSafeInteger(index) || index < 0 || index >= Math.ceil(size / RESUMABLE_CHUNK_BYTES)) throw new ResumableUploadError("رقم جزء الفيديو غير صالح");
  return Math.min(RESUMABLE_CHUNK_BYTES, size - index * RESUMABLE_CHUNK_BYTES);
}
export function resumablePartKey(id: string, index: number, hash: string) {
  validateUploadId(id);
  if (!Number.isSafeInteger(index) || index < 0 || index >= RESUMABLE_MAX_BYTES / RESUMABLE_CHUNK_BYTES || !/^[a-f0-9]{64}$/.test(hash)) throw new ResumableUploadError("بيانات الجزء غير صالحة");
  return `private/resumable/${id}/${index}-${hash}`;
}
export function validResumableVideoHeader(type: string, bytes: Uint8Array) {
  const mp4 = bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  const webm = bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  const avi = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 11)) === "AVI";
  return ["video/mp4", "video/quicktime"].includes(type) ? mp4 : ["video/webm", "video/x-matroska"].includes(type) ? webm : type === "video/x-msvideo" && avi;
}
