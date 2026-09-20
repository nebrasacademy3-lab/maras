import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { and, eq, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { aiConversations, aiFiles, users } from "@/db/schema";
import { studyUploadSessions as sessions } from "@/db/study-upload-schema";
import { filePayload } from "@/lib/ai-api";
import { validAiFileSignature } from "@/lib/ai-files";
import { activeStorageProvider, getObject, putObject, storageLocationFingerprint, type StorageProvider } from "@/lib/storage";
import { enqueueStorageCleanupTx } from "@/lib/storage-cleanup";
import { boundedRequestBody } from "@/lib/request-body";
import { scanColumns, scanStoredFile } from "@/lib/file-security";
import { studyStoredUsage, studyUploadLimits } from "@/lib/study-upload-quota";
import { STUDY_UPLOAD_CHUNK_BYTES, StudyUploadError, studyPartSize, studyUploadId, studyUploadManifest, type StudyUploadReceipt } from "@/lib/study-upload-policy";

type Database = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Session = typeof sessions.$inferSelect;
export type StudyUploadActor = { id: number; email: string };
export type StudyUploadReauthorize = () => Promise<number>;
const stagingKey = (id: string, index: number, hash: string) => `private/resumable/${studyUploadId(id)}/${index}-${hash}`;
function verified(row: Session) {
  const manifest = studyUploadManifest({ ...row, hashes: JSON.parse(row.hashesJson) });
  const received: unknown = JSON.parse(row.receivedJson);
  if (!Array.isArray(received) || received.some(i => !Number.isSafeInteger(i) || i < 0 || i >= manifest.hashes.length) || new Set(received).size !== received.length) throw new StudyUploadError("سجل أجزاء الملف يحتاج مراجعة.", 409);
  if (row.objectKey !== `ai/${row.ownerId}/files/${studyUploadId(row.id)}.upload` || !["local", "s3"].includes(row.provider) || row.locationFingerprint !== storageLocationFingerprint(row.provider as StorageProvider)) throw new StudyUploadError("تغيّر موقع التخزين؛ لم تُنقل الأجزاء إلى مخزن آخر.", 409, "STUDY_STORAGE_CHANGED");
  return { manifest, received: received as number[], provider: row.provider as StorageProvider };
}
async function authorized(tx: Tx, actor: StudyUploadActor, conversationId: number | null, reauthorize: StudyUploadReauthorize) {
  if (!Number.isSafeInteger(actor.id) || actor.id < 1 || await reauthorize() !== actor.id) throw new StudyUploadError("تغيّر الحساب أو انتهت الجلسة.", 403);
  const [user] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, actor.id), eq(users.status, "active"))).for("share");
  if (!user) throw new StudyUploadError("الحساب غير متاح.", 403);
  if (conversationId) {
    const [conversation] = await tx.select({ id: aiConversations.id }).from(aiConversations).where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, actor.id), eq(aiConversations.status, "active"))).for("share");
    if (!conversation) throw new StudyUploadError("المحادثة غير متاحة لهذا الحساب.", 404);
  }
}
async function owned(tx: Tx, actor: StudyUploadActor, id: string, reauthorize: StudyUploadReauthorize) {
  const [row] = await tx.select().from(sessions).where(and(eq(sessions.id, studyUploadId(id)), eq(sessions.ownerId, actor.id))).for("update");
  if (!row) throw new StudyUploadError("جلسة الرفع غير موجودة.", 404);
  await authorized(tx, actor, row.conversationId, reauthorize);
  if (row.status !== "completed" && (row.status !== "open" || row.expiresAt.getTime() <= Date.now())) throw new StudyUploadError("انتهت جلسة الرفع. أعد اختيار الملف لبدء جلسة جديدة.", 410);
  verified(row);
  return row;
}
async function receipt(tx: Tx, row: Session): Promise<StudyUploadReceipt> {
  const result: StudyUploadReceipt = { id: row.id, status: row.status as "open" | "completed", received: verified(row).received, chunkBytes: STUDY_UPLOAD_CHUNK_BYTES, sizeBytes: row.sizeBytes, expiresAt: row.expiresAt.toISOString() };
  if (row.status === "completed") {
    const [file] = await tx.select().from(aiFiles).where(and(eq(aiFiles.id, row.fileId || 0), eq(aiFiles.userId, row.ownerId))).for("share");
    if (!file || file.objectKey !== row.objectKey || !["ready", "pending_scan"].includes(file.status) || file.scanStatus === "quarantined") throw new StudyUploadError("الملف المعتمد لم يعد متاحًا؛ لا تُعاد كتابة نسخته القديمة.", 410);
    result.file = filePayload(file);
  }
  return result;
}
export async function startStudyUpload(db: Database, actor: StudyUploadActor, input: Record<string, unknown>, reauthorize: StudyUploadReauthorize) {
  const manifest = studyUploadManifest(input);
  const limits = await studyUploadLimits(actor);
  if (manifest.sizeBytes > limits.maxFileBytes) throw new StudyUploadError("حجم الملف أكبر من الحد المسموح لحسابك.", 413);
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('meras-study-upload-admission'))`);
    // Lock quota before the session: all admission paths use the same ordering.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`ai-file-quota:${actor.id}`}))`);
    const [prior] = await tx.select().from(sessions).where(and(eq(sessions.ownerId, actor.id), eq(sessions.requestKey, manifest.requestKey))).for("update");
    if (prior) {
      if (JSON.stringify(verified(prior).manifest) !== JSON.stringify(manifest)) throw new StudyUploadError("معرّف العملية مستخدم لملف أو وجهة مختلفة.", 409);
      return receipt(tx, await owned(tx, actor, prior.id, reauthorize));
    }
    await authorized(tx, actor, manifest.conversationId, reauthorize);
    const counts = await tx.execute(sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE owner_id = ${actor.id})::int AS owned FROM study_upload_sessions u
      WHERE status IN ('open','blocked') OR EXISTS (SELECT 1 FROM storage_cleanup_jobs j WHERE j.object_key = 'private/resumable/' || u.id AND j.status <> 'completed')`);
    if (Number(counts.rows[0]?.total) >= 16 || Number(counts.rows[0]?.owned) >= 2) throw new StudyUploadError("أكمل أو ألغ عمليات الرفع المفتوحة، وانتظر تنظيف الأجزاء الملغاة.", 429);
    const usage = await studyStoredUsage(actor.id, tx);
    if (usage.fileCount >= limits.maxFiles || usage.totalBytes + manifest.sizeBytes > limits.maxBytes) throw new StudyUploadError("تجاوز الملف حصة التخزين المتاحة لحسابك.", 409, "AI_UPLOAD_STORAGE_QUOTA");
    const id = randomUUID(), provider = activeStorageProvider();
    const [row] = await tx.insert(sessions).values({ id, ...manifest, ownerId: actor.id, hashesJson: JSON.stringify(manifest.hashes), provider, locationFingerprint: storageLocationFingerprint(provider), objectKey: `ai/${actor.id}/files/${id}.upload`, expiresAt: new Date(Date.now() + 86400_000) }).returning();
    return receipt(tx, row);
  });
}
export async function studyUploadStatus(db: Database, actor: StudyUploadActor, id: string, reauthorize: StudyUploadReauthorize) {
  return db.transaction(async tx => receipt(tx, await owned(tx, actor, id, reauthorize)));
}
export async function writeStudyUploadPart(db: Database, actor: StudyUploadActor, id: string, index: number, request: Request, reauthorize: StudyUploadReauthorize) {
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]);
  return db.transaction(async tx => {
    const row = await owned(tx, actor, id, reauthorize), { manifest, received, provider } = verified(row);
    const size = studyPartSize(row.sizeBytes, index);
    if (row.status !== "open") throw new StudyUploadError("اكتمل الملف ولا يقبل استبدال الأجزاء.", 409);
    if (received.includes(index)) { await request.body?.cancel().catch(() => undefined); return receipt(tx, row); }
    const input = boundedRequestBody(request, size);
    if (!input) throw new StudyUploadError("بيانات الجزء مفقودة.");
    const hash = createHash("sha256"); let length = 0;
    const checked = input.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) { signal.throwIfAborted(); length += chunk.byteLength; hash.update(chunk); controller.enqueue(chunk); },
      flush() { if (length !== size || hash.digest("hex") !== manifest.hashes[index]) throw new StudyUploadError("بصمة الجزء أو حجمه لا يطابق الملف.", 422); },
    }));
    await putObject(stagingKey(row.id, index, manifest.hashes[index]), checked, "application/octet-stream", provider, { maxBytes: size, signal });
    signal.throwIfAborted();
    if (await reauthorize() !== actor.id) throw new StudyUploadError("انتهت الجلسة قبل اعتماد الجزء.", 403);
    const [updated] = await tx.update(sessions).set({ receivedJson: JSON.stringify([...received, index].sort((a,b) => a-b)), updatedAt: new Date() }).where(eq(sessions.id, row.id)).returning();
    return receipt(tx, updated);
  });
}
async function* assembled(row: Session, signal: AbortSignal) {
  const { manifest, provider } = verified(row);
  for (let i = 0; i < manifest.hashes.length; i++) {
    signal.throwIfAborted();
    const object = await getObject(stagingKey(row.id, i, manifest.hashes[i]), undefined, provider, signal);
    if (!object) throw new StudyUploadError("أحد أجزاء الملف المخزن مفقود.", 409);
    const stream = Readable.fromWeb(object.body as import("node:stream/web").ReadableStream<Uint8Array>);
    const hash = createHash("sha256"); let bytes = 0;
    try {
      for await (const chunk of stream) { signal.throwIfAborted(); bytes += chunk.length; if (bytes > studyPartSize(row.sizeBytes, i)) throw new StudyUploadError("حجم جزء مخزن غير صالح.", 422); hash.update(chunk); yield chunk as Buffer; }
      if (bytes !== studyPartSize(row.sizeBytes, i) || hash.digest("hex") !== manifest.hashes[i]) throw new StudyUploadError("تغيّرت بصمة جزء مخزن؛ لم يعتمد الملف.", 422);
    } finally { stream.destroy(); }
  }
}
export async function completeStudyUpload(db: Database, actor: StudyUploadActor, id: string, reauthorize: StudyUploadReauthorize, callerSignal?: AbortSignal) {
  const signal = AbortSignal.any([...(callerSignal ? [callerSignal] : []), AbortSignal.timeout(120_000)]);
  return db.transaction(async tx => {
    // Start also takes quota before row: avoids deadlock during concurrent replay.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`ai-file-quota:${actor.id}`}))`);
    const row = await owned(tx, actor, id, reauthorize), { manifest, received, provider } = verified(row);
    if (row.status === "completed") return receipt(tx, row);
    if (received.length !== manifest.hashes.length) throw new StudyUploadError("لم تصل جميع أجزاء الملف.", 409);
    let slot = false;
    for (let index = 0; index < 2; index++) {
      const lock = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(hashtext(${`meras-study-upload-finalize:${index}`})) AS acquired`);
      if (lock.rows[0]?.acquired === true) { slot = true; break; }
    }
    if (!slot) throw new StudyUploadError("تجهيز ملفات أخرى جارٍ؛ أعد المحاولة بعد قليل دون إعادة رفع الأجزاء.", 429);
    let prefix = Buffer.alloc(0), total = 0;
    const checked = Readable.toWeb(Readable.from(assembled(row, signal))) as ReadableStream<Uint8Array>;
    const body = checked.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) { total += chunk.byteLength; if (prefix.length < 8192) prefix = Buffer.concat([prefix, Buffer.from(chunk.subarray(0, 8192-prefix.length))]); controller.enqueue(chunk); },
      flush() { if (total !== row.sizeBytes || !validAiFileSignature(row.contentType, prefix)) throw new StudyUploadError("محتوى الملف لا يطابق النوع المعلن.", 422); },
    }));
    await putObject(row.objectKey, body, row.contentType, provider, { signal, maxBytes: row.sizeBytes });
    signal.throwIfAborted();
    const scan = await scanStoredFile({ objectKey: row.objectKey, storageProvider: provider, originalName: row.originalName, contentType: row.contentType, sizeBytes: row.sizeBytes });
    signal.throwIfAborted();
    if (scan.status === "quarantined") throw new StudyUploadError("رُفض الملف بعد الفحص الأمني. ألغ جلسة الرفع لتنظيف الأجزاء.", 422, "AI_FILE_QUARANTINED");
    await authorized(tx, actor, row.conversationId, reauthorize);
    const now = new Date().toISOString();
    const [file] = await tx.insert(aiFiles).values({ userId: actor.id, conversationId: row.conversationId, objectKey: row.objectKey, storageProvider: provider, originalName: row.originalName, contentType: row.contentType, sizeBytes: row.sizeBytes, status: scan.status === "clean" ? "ready" : "pending_scan", ...scanColumns(scan), createdAt: now, updatedAt: now }).returning();
    await enqueueStorageCleanupTx(tx, [{ key: `private/resumable/${row.id}`, provider, source: "resumable-staging", recursive: true }]);
    const [updated] = await tx.update(sessions).set({ status: "completed", fileId: file.id, updatedAt: new Date() }).where(eq(sessions.id, row.id)).returning();
    return receipt(tx, updated);
  });
}
/** Owner tombstones keep cleanup recoverable even after an account is deleted. */
export async function expireStudyUploads(db: Database, actor?: StudyUploadActor, id?: string, reauthorize?: StudyUploadReauthorize) {
  if (id) studyUploadId(id);
  return db.transaction(async tx => {
    if (actor && id && reauthorize) await owned(tx, actor, id, reauthorize);
    const condition = actor && id ? and(eq(sessions.ownerId, actor.id), eq(sessions.id, id), eq(sessions.status, "open")) : and(eq(sessions.status, "open"), sql`(${sessions.expiresAt} <= clock_timestamp() OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ${sessions.ownerId} AND u.status = 'active'))`);
    const rows = await tx.select().from(sessions).where(condition).limit(10).for("update", { skipLocked: true });
    for (const row of rows) {
      try { verified(row); } catch { await tx.update(sessions).set({ status: "blocked", updatedAt: new Date() }).where(eq(sessions.id, row.id)); continue; }
      const [linked] = await tx.select({ id: aiFiles.id }).from(aiFiles).where(eq(aiFiles.objectKey, row.objectKey)).limit(1);
      if (linked) { await tx.update(sessions).set({ status: "blocked", updatedAt: new Date() }).where(eq(sessions.id, row.id)); continue; }
      await enqueueStorageCleanupTx(tx, [{ key: `private/resumable/${row.id}`, provider: row.provider as StorageProvider, source: "resumable-staging", recursive: true }, { key: row.objectKey, provider: row.provider as StorageProvider, source: "study-upload-source" }]);
      await tx.update(sessions).set({ status: "expired", updatedAt: new Date() }).where(eq(sessions.id, row.id));
    }
    return rows.length;
  });
}
