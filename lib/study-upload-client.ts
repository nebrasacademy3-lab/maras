import { STUDY_UPLOAD_CHUNK_BYTES, STUDY_UPLOAD_MAX_BYTES, StudyUploadError, parseStudyUploadReceipt, studyPartSize, studyUploadId, type StudyUploadReceipt } from "./study-upload-policy";
export type StudyUploadSource = { originalName: string; contentType: string; sizeBytes: number; conversationId?: number; read: (offset: number, length: number) => Promise<Uint8Array> };
export type StudyUploadTransport = {
  userId: number; signal: AbortSignal;
  hash: (bytes: Uint8Array) => Promise<string>; uuid: () => string;
  saved: (key: string, value?: string | null) => Promise<string | null>;
  request: (path: string, method: string, body?: string | Uint8Array) => Promise<unknown>;
  onProgress?: (value: { phase: "hashing" | "uploading" | "finalizing" | "completed"; acceptedBytes: number; totalBytes: number; percent: number }) => void;
};
/** Identical browser/native state machine. Storage retains only a random request
 * ID under an account+manifest digest. No bytes, local paths, signed URLs or tokens. */
export async function resumeStudyUpload(source: StudyUploadSource, transport: StudyUploadTransport): Promise<StudyUploadReceipt> {
  const { signal, userId, onProgress } = transport, endpoint = "/api/ai/files/resumable";
  signal.throwIfAborted();
  if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isSafeInteger(source.sizeBytes) || source.sizeBytes < 1 || source.sizeBytes > STUDY_UPLOAD_MAX_BYTES) throw new StudyUploadError("اختر ملفًا مدعومًا ضمن حد حسابك.", 413);
  const limits = await transport.request(endpoint, "GET") as { ownerId?: number; maxFileBytes?: number };
  if (limits.ownerId !== userId || !Number.isSafeInteger(limits.maxFileBytes) || source.sizeBytes > Number(limits.maxFileBytes)) throw new StudyUploadError("حجم الملف أكبر من الحد المسموح لحسابك أو تغيّر الحساب.", 413);
  onProgress?.({ phase: "hashing", acceptedBytes: 0, totalBytes: source.sizeBytes, percent: 0 });
  const hashes: string[] = [];
  for (let offset = 0; offset < source.sizeBytes; offset += STUDY_UPLOAD_CHUNK_BYTES) {
    signal.throwIfAborted(); const length = Math.min(STUDY_UPLOAD_CHUNK_BYTES, source.sizeBytes-offset), bytes = await source.read(offset, length);
    if (bytes.byteLength !== length) throw new StudyUploadError("لم يعد الملف المحلي متاحًا كاملًا. أعد اختياره.", 409);
    hashes.push(await transport.hash(bytes));
  }
  signal.throwIfAborted();
  const manifest = { originalName: source.originalName, contentType: source.contentType, sizeBytes: source.sizeBytes, conversationId: source.conversationId ?? null, hashes };
  const scope = `upload.${userId}.${await transport.hash(new TextEncoder().encode(JSON.stringify(manifest)))}`;
  let requestKey: string;
  try { requestKey = studyUploadId(await transport.saved(scope)); } catch { requestKey = transport.uuid(); }
  await transport.saved(scope, requestKey); // Before admission, including a lost first HTTP response.
  const post = async (body: object) => parseStudyUploadReceipt(await transport.request(endpoint, "POST", JSON.stringify(body)), source.sizeBytes);
  let session: StudyUploadReceipt;
  try { session = await post({ action: "start", ...manifest, requestKey }); }
  catch (error) {
    if (!(error instanceof StudyUploadError) || error.status !== 410 || signal.aborted) throw error;
    requestKey = transport.uuid(); await transport.saved(scope, requestKey);
    session = await post({ action: "start", ...manifest, requestKey });
  }
  let accepted = session.received.reduce((sum, index) => sum + studyPartSize(source.sizeBytes, index), 0);
  const progress = (phase: "uploading" | "finalizing" | "completed") => onProgress?.({ phase, acceptedBytes: accepted, totalBytes: source.sizeBytes, percent: phase === "completed" ? 100 : Math.min(99, Math.floor(accepted/source.sizeBytes*100)) });
  progress("uploading");
  for (let index = 0; session.status === "open" && index < hashes.length; index++) {
    if (session.received.includes(index)) continue;
    signal.throwIfAborted(); const length = studyPartSize(source.sizeBytes, index), bytes = await source.read(index*STUDY_UPLOAD_CHUNK_BYTES, length);
    if (bytes.byteLength !== length || await transport.hash(bytes) !== hashes[index]) throw new StudyUploadError("تغيّر الملف المحلي بعد تجهيز بصمته؛ أعد اختيار النسخة المطابقة.", 409);
    const next = parseStudyUploadReceipt(await transport.request(`${endpoint}?id=${session.id}&part=${index}`, "PUT", bytes), source.sizeBytes);
    if (next.id !== session.id || next.status !== "open" || !next.received.includes(index) || session.received.some(part => !next.received.includes(part))) throw new StudyUploadError("إيصال أجزاء الرفع غير متسق.", 502);
    session = next; accepted = session.received.reduce((sum, part) => sum + studyPartSize(source.sizeBytes, part), 0); progress("uploading");
  }
  signal.throwIfAborted(); progress("finalizing");
  if (session.status !== "completed") {
    const complete = await post({ action: "complete", id: session.id });
    if (complete.id !== session.id || complete.status !== "completed") throw new StudyUploadError("لم يعتمد الخادم الملف بعد. أعد اختياره لاستئناف الاعتماد.", 502);
    session = complete;
  }
  signal.throwIfAborted(); await transport.saved(scope, null); progress("completed"); return session;
}
