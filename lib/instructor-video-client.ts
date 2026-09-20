"use client";
import { authRequest } from "@/lib/auth-request";
import { uploadWithProgress, UploadError, type UploadProgress } from "@/lib/upload-client";
import { RESUMABLE_CHUNK_BYTES, RESUMABLE_MAX_BYTES, RESUMABLE_TYPES, uploadPartSize, validateUploadId } from "@/lib/resumable-upload-policy";

type Receipt = { id: string; status: string; received: number[]; chunkBytes: number; sizeBytes: number; expiresAt: string; asset?: { id: number } };
export function instructorUploadReceipt(value: unknown, size: number): Receipt {
  const row = value as Receipt;
  if (!Number.isSafeInteger(size) || size < 1 || size > RESUMABLE_MAX_BYTES || !row || row.sizeBytes !== size || row.chunkBytes !== RESUMABLE_CHUNK_BYTES || !["open", "completed"].includes(row.status) || !Array.isArray(row.received)
    || row.received.some(index => !Number.isSafeInteger(index) || index < 0 || index >= Math.ceil(size / RESUMABLE_CHUNK_BYTES)) || new Set(row.received).size !== row.received.length || !Number.isFinite(Date.parse(row.expiresAt))) throw new Error("تعذر التحقق من استجابة الرفع");
  validateUploadId(row.id); return row;
}
async function hash(value: ArrayBuffer) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", value))].map(byte => byte.toString(16).padStart(2,"0")).join(""); }
export async function uploadInstructorVideo(options: { file: File; ownerId: number; assignmentId: number; lessonId: number; expectedRevision: number; signal: AbortSignal; onProgress: (progress: UploadProgress) => void; onPhase: (text: string) => void }) {
  const { file, signal, onPhase, onProgress } = options;
  if (!file.size || file.size > RESUMABLE_MAX_BYTES || !RESUMABLE_TYPES.has(file.type)) throw new Error("اختر فيديو MP4 أو WebM أو MOV أو MKV أو AVI لا يتجاوز 200 ميجابايت");
  const endpoint = `/api/instructor/assignments/${options.assignmentId}/videos`;
  onPhase("جارٍ تجهيز بصمة الفيديو للاستكمال الآمن…");
  const hashes: string[] = [];
  for (let offset = 0; offset < file.size; offset += RESUMABLE_CHUNK_BYTES) { signal.throwIfAborted(); hashes.push(await hash(await file.slice(offset, offset + RESUMABLE_CHUNK_BYTES).arrayBuffer())); }
  const manifest = { lessonId: options.lessonId, contentType: file.type, sizeBytes: file.size, hashes };
  const key = `maras.instructor-video.v1:${options.ownerId}:${options.assignmentId}:${await hash(new TextEncoder().encode(JSON.stringify(manifest)).buffer)}`;
  let requestKey = crypto.randomUUID() as string;
  try { const prior = localStorage.getItem(key); if (prior) requestKey = validateUploadId(prior); } catch { /* A private session can still upload without persistent resumption. */ }
  const remember = () => { try { localStorage.setItem(key, requestKey); } catch {} };
  remember();
  const json = async (body: Record<string, unknown>) => {
    const response = await authRequest(endpoint, { method: "POST", credentials: "same-origin", signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, expectedRevision: options.expectedRevision }) });
    const value = await response.json().catch(() => ({})); if (!response.ok) throw new UploadError(value.error || "تعذر إكمال الرفع. أعد اختيار الملف نفسه للاستكمال.", response.status);
    return instructorUploadReceipt(value, file.size);
  };
  let session: Receipt;
  try { session = await json({ action: "start", ...manifest, requestKey }); }
  catch (reason) { if (!(reason instanceof UploadError) || reason.status !== 410 || signal.aborted) throw reason; requestKey = crypto.randomUUID(); remember(); session = await json({ action: "start", ...manifest, requestKey }); }
  const started = performance.now(); let sent = 0;
  let loaded = session.received.reduce((sum,index) => sum + uploadPartSize(file.size,index),0);
  function progress(bytes = 0) { const bytesPerSecond = (sent + bytes) / Math.max((performance.now() - started) / 1000, .1); const current = Math.min(file.size, loaded + bytes); onProgress({ loaded: current, total: file.size, percent: Math.floor(current / file.size * 100), bytesPerSecond, remainingSeconds: bytesPerSecond ? Math.ceil((file.size-current) / bytesPerSecond) : null }); }
  progress();
  for (let index = 0; session.status === "open" && index < hashes.length; index++) {
    if (session.received.includes(index)) continue; signal.throwIfAborted(); onPhase(`رفع الجزء ${index + 1} من ${hashes.length}`);
    const size = uploadPartSize(file.size,index), part = file.slice(index * RESUMABLE_CHUNK_BYTES, index * RESUMABLE_CHUNK_BYTES + size);
    const receipt = instructorUploadReceipt(await uploadWithProgress({ url: `${endpoint}?id=${session.id}&part=${index}`, method: "PUT", body: part, headers: { "content-type": "application/octet-stream" }, signal, timeoutMs: 90_000, onProgress: p => progress(Math.min(p.loaded,size)) }), file.size);
    if (receipt.id !== session.id || !receipt.received.includes(index)) throw new Error("لم يؤكد الخادم حفظ الجزء. أعد اختيار الفيديو نفسه لاستكماله.");
    session = receipt; loaded += size; sent += size; progress();
  }
  signal.throwIfAborted(); onPhase("جارٍ اعتماد الفيديو وربطه بالدرس…");
  const complete = await json({ action: "complete", id: session.id });
  if (complete.id !== session.id || complete.status !== "completed" || !Number.isSafeInteger(complete.asset?.id)) throw new Error("لم يؤكد الخادم اكتمال الرفع. أعد اختيار الملف نفسه للتحقق.");
  try { localStorage.removeItem(key); } catch {} return complete;
}
