"use client";
import { adminFetch } from "@/lib/admin-client";
import { uploadWithProgress, UploadError, type UploadProgress } from "@/lib/upload-client";
import { RESUMABLE_CHUNK_BYTES, RESUMABLE_MAX_BYTES, RESUMABLE_TYPES, validateUploadId, uploadPartSize } from "@/lib/resumable-upload-policy";

type UploadReceipt = { id: string; status: string; received: number[]; chunkBytes: number; sizeBytes: number; expiresAt: string; asset?: { id: number } };
type Options = { file: File; courseSlug: string; lessonId: string; contentType: string; durationSeconds?: number; signal: AbortSignal;
  onProgress?: (value: UploadProgress) => void; onPhase?: (value: string) => void };
const endpoint = "/api/admin/videos/resumable";
async function digest(value: ArrayBuffer) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", value))].map(byte => byte.toString(16).padStart(2, "0")).join(""); }
function parseReceipt(value: unknown, size: number): UploadReceipt {
  const row = value as UploadReceipt;
  if (!row || typeof row !== "object" || row.sizeBytes !== size || row.chunkBytes !== RESUMABLE_CHUNK_BYTES || !["open", "completed"].includes(row.status)
    || !Array.isArray(row.received) || row.received.some(index => !Number.isSafeInteger(index) || index < 0 || index >= Math.ceil(size / RESUMABLE_CHUNK_BYTES))
    || new Set(row.received).size !== row.received.length || typeof row.expiresAt !== "string" || !Number.isFinite(Date.parse(row.expiresAt))) throw new Error("استجابة الرفع غير صالحة");
  validateUploadId(row.id); return row;
}
function remembered(key: string) {
  try { const value = localStorage.getItem(key); return value ? validateUploadId(value) : null; } catch { return null; }
}
function remember(key: string, value: string | null) {
  try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* Private browsing can disable persistence; this tab still uploads safely. */ }
}

/** Resumption is bound to the account, destination and SHA-256 of EVERY part,
 * never to a filename/size guess. No file bytes, bearer tokens or signed URLs
 * are retained in browser storage. Reselecting the identical file resumes it. */
export async function uploadResumableVideo(options: Options): Promise<UploadReceipt> {
  const { file, courseSlug, lessonId, contentType, signal, onProgress, onPhase } = options;
  signal.throwIfAborted();
  if (file.size < 1 || file.size > RESUMABLE_MAX_BYTES || !RESUMABLE_TYPES.has(contentType)) throw new Error("اختر فيديو مدعومًا لا يزيد حجمه عن 200MB");
  const identity = await adminFetch("/api/admin/me", { credentials: "same-origin", cache: "no-store", signal });
  const actor = await identity.json() as { user?: { id?: number } };
  const ownerId = actor.user?.id;
  if (!identity.ok || !Number.isSafeInteger(ownerId) || Number(ownerId) <= 0) throw new Error("انتهت جلسة الإدارة؛ سجّل الدخول ثم استأنف الرفع");
  onPhase?.("جارٍ التحقق من بصمة الفيديو لتجهيز الاستئناف...");
  const hashes: string[] = [];
  for (let offset = 0; offset < file.size; offset += RESUMABLE_CHUNK_BYTES) {
    signal.throwIfAborted(); hashes.push(await digest(await file.slice(offset, offset + RESUMABLE_CHUNK_BYTES).arrayBuffer()));
  }
  signal.throwIfAborted();
  const manifest = { courseSlug, lessonId, contentType, sizeBytes: file.size, hashes };
  const key = `meras.video-resume.v1:${ownerId}:${await digest(new TextEncoder().encode(JSON.stringify(manifest)).buffer)}`;
  let requestKey = remembered(key) ?? crypto.randomUUID();
  remember(key, requestKey); // Persist BEFORE admission: a lost response must not create a second session.
  const json = async (body: Record<string, unknown>) => {
    const response = await adminFetch(endpoint, { method: "POST", credentials: "same-origin", signal,
      headers: { "content-type": "application/json", "x-meras-acting-user": String(ownerId) }, body: JSON.stringify({ ...body, ownerId }) });
    const value = await response.json() as { error?: string };
    if (!response.ok) throw new UploadError(value.error || "تعذر إكمال الرفع؛ أعد اختيار الملف نفسه للاستئناف", response.status);
    return parseReceipt(value, file.size);
  };
  let session: UploadReceipt;
  try { session = await json({ action: "start", ...manifest, requestKey }); }
  catch (error) {
    if (!(error instanceof UploadError) || error.status !== 410 || signal.aborted) throw error;
    // An expired session is never reopened or overwritten. A fresh, independently
    // bounded admission is required; old staging is removed by the durable worker.
    requestKey = crypto.randomUUID(); remember(key, requestKey);
    session = await json({ action: "start", ...manifest, requestKey });
  }
  const started = performance.now(); let sent = 0;
  let loaded = session.received.reduce((total, index) => total + uploadPartSize(file.size, index), 0);
  const progress = (partLoaded = 0) => {
    const bytesPerSecond = (sent + partLoaded) / Math.max((performance.now() - started) / 1000, 0.1);
    const current = Math.min(file.size, loaded + partLoaded);
    onProgress?.({ loaded: current, total: file.size, percent: Math.floor(current / file.size * 100), bytesPerSecond,
      remainingSeconds: bytesPerSecond > 0 ? Math.ceil((file.size - current) / bytesPerSecond) : null });
  };
  progress();
  const done = new Set(session.received);
  for (let index = 0; index < hashes.length && session.status === "open"; index++) {
    if (done.has(index)) continue;
    signal.throwIfAborted(); onPhase?.(`رفع / استئناف الجزء ${index + 1} من ${hashes.length}...`);
    const size = uploadPartSize(file.size, index);
    const value = await uploadWithProgress<unknown>({ url: `${endpoint}?id=${session.id}&part=${index}`, method: "PUT",
      body: file.slice(index * RESUMABLE_CHUNK_BYTES, index * RESUMABLE_CHUNK_BYTES + size), withCredentials: true,
      headers: { "content-type": "application/octet-stream", "x-meras-acting-user": String(ownerId) }, timeoutMs: 90_000,
      signal, onProgress: event => progress(Math.min(event.loaded, size)) });
    const next = parseReceipt(value, file.size);
    if (next.id !== session.id || !next.received.includes(index)) throw new Error("لم يؤكد الخادم حفظ الجزء؛ أعد المحاولة للاستئناف");
    session = next; loaded += size; sent += size; progress();
  }
  signal.throwIfAborted(); onPhase?.("جارٍ التحقق من الفيديو الكامل وربطه بالدرس...");
  const completed = await json({ action: "complete", id: session.id, durationSeconds: options.durationSeconds || 0 });
  if (completed.id !== session.id || completed.status !== "completed" || !Number.isSafeInteger(completed.asset?.id)) throw new Error("لم يؤكد الخادم اعتماد الفيديو؛ أعد اختيار الملف نفسه للتحقق");
  remember(key, null); return completed;
}
