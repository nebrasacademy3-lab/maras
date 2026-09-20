import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { auditLogs, lessonsDb, resumableVideoUploads as uploads, videoAssets, videoProcessingJobs } from "@/db/schema";
import { activeStorageProvider, getObject, putObject, storageLocationFingerprint, type StorageProvider } from "@/lib/storage";
import { enqueueStorageCleanupTx, processStorageCleanupBatch } from "@/lib/storage-cleanup";
import { collectVideoCleanup } from "@/lib/admin-deletion";
import type { CleanupTarget } from "@/lib/storage-cleanup-policy";
import { boundedRequestBody } from "@/lib/request-body";
import { normalizeStorageKey } from "@/lib/storage-policy";
import { RESUMABLE_CHUNK_BYTES, ResumableUploadError, resumablePartKey, uploadPartSize, validateUploadId, validateUploadManifest, validResumableVideoHeader, type UploadManifest } from "@/lib/resumable-upload-policy";

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Session = typeof uploads.$inferSelect;
export type ReauthorizeUpload = (courseSlug: string) => Promise<number>;
function assertLocation(row: Session): StorageProvider {
  if (row.provider !== "local" && row.provider !== "s3") throw new ResumableUploadError("مزود التخزين غير صالح", 409);
  if (row.locationFingerprint !== storageLocationFingerprint(row.provider)) throw new ResumableUploadError("تغيّر موقع التخزين؛ تحتاج العملية مراجعة", 409);
  return row.provider;
}
function manifest(row: Session): UploadManifest {
  validateUploadId(row.id);
  const data = validateUploadManifest({ ...row, hashes: JSON.parse(row.hashesJson) });
  if (row.objectKey !== `private/video-source/${data.courseSlug}/${data.lessonId}/${row.id}.upload`) throw new ResumableUploadError("مسار المصدر لا يتبع جلسة الرفع", 409);
  return data;
}
function received(row: Session): number[] {
  const value: unknown = JSON.parse(row.receivedJson);
  if (!Array.isArray(value) || value.some(index => !Number.isSafeInteger(index) || index < 0 || index >= Math.ceil(row.sizeBytes / RESUMABLE_CHUNK_BYTES))) throw new ResumableUploadError("سجل الأجزاء غير صالح", 409);
  return [...new Set(value as number[])].sort((a, b) => a - b);
}
function receipt(row: Session) { return { id: row.id, status: row.status, received: received(row), chunkBytes: RESUMABLE_CHUNK_BYTES, sizeBytes: row.sizeBytes, expiresAt: row.expiresAt.toISOString(), asset: row.assetId ? { id: row.assetId } : undefined }; }
async function ownedSession(tx: Transaction, ownerId: number, id: string, reauthorize: ReauthorizeUpload) {
  validateUploadId(id);
  const [row] = await tx.select().from(uploads).where(and(eq(uploads.id, id), eq(uploads.ownerId, ownerId))).for("update");
  if (!row) throw new ResumableUploadError("جلسة الرفع غير موجودة", 404);
  if (await reauthorize(row.courseSlug) !== row.ownerId) throw new ResumableUploadError("تغيّر الحساب أثناء الرفع", 403);
  if (row.status !== "completed" && (row.status !== "open" || row.expiresAt.getTime() <= Date.now())) throw new ResumableUploadError("انتهت صلاحية جلسة الرفع", 410);
  assertLocation(row); manifest(row); received(row);
  return row;
}

export async function startResumableVideo(db: Database, ownerId: number, input: Record<string, unknown>, reauthorize: ReauthorizeUpload) {
  const data = validateUploadManifest(input);
  if (!Number.isSafeInteger(ownerId) || ownerId < 1 || await reauthorize(data.courseSlug) !== ownerId) throw new ResumableUploadError("غير مصرح", 403);
  return db.transaction(async tx => {
    // Shared admission lock bounds active staging space across all servers.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('meras-resumable-video-admission'))`);
    const [prior] = await tx.select().from(uploads).where(and(eq(uploads.ownerId, ownerId), eq(uploads.requestKey, data.requestKey))).for("update");
    if (prior) {
      if (JSON.stringify(manifest(prior)) !== JSON.stringify(data)) throw new ResumableUploadError("معرّف العملية مستخدم لملف آخر", 409);
      if (prior.status === "completed") {
        const [asset] = await tx.select({ id: videoAssets.id }).from(videoAssets).where(eq(videoAssets.id, prior.assetId || 0)).limit(1);
        if (!asset) throw new ResumableUploadError("الفيديو السابق محذوف؛ تحتاج جلسة رفع جديدة", 410);
      }
      return receipt(await ownedSession(tx, ownerId, prior.id, reauthorize));
    }
    const counts = await tx.execute(sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE owner_id = ${ownerId})::int AS owned
      FROM resumable_video_uploads u WHERE status IN ('open', 'blocked') OR EXISTS (SELECT 1 FROM storage_cleanup_jobs j
      WHERE j.source = 'resumable-staging' AND j.object_key = 'private/resumable/' || u.id AND j.status <> 'completed')`);
    if (Number(counts.rows[0].total) >= 16 || Number(counts.rows[0].owned) >= 2) throw new ResumableUploadError("أكمل عمليات الرفع المفتوحة أو ألغها قبل بدء ملف جديد", 429);
    const [lesson] = await tx.select({ id: lessonsDb.id }).from(lessonsDb).where(and(eq(lessonsDb.id, data.lessonId), eq(lessonsDb.courseSlug, data.courseSlug))).limit(1);
    if (!lesson) throw new ResumableUploadError("الدرس غير موجود في المادة", 404);
    const id = randomUUID(), provider = activeStorageProvider();
    const [row] = await tx.insert(uploads).values({ id, requestKey: data.requestKey, ownerId, courseSlug: data.courseSlug, lessonId: data.lessonId,
      objectKey: normalizeStorageKey(`private/video-source/${data.courseSlug}/${data.lessonId}/${id}.upload`),
      provider, locationFingerprint: storageLocationFingerprint(provider), contentType: data.contentType, sizeBytes: data.sizeBytes, hashesJson: JSON.stringify(data.hashes) }).returning();
    return receipt(row);
  });
}
export async function resumableVideoStatus(db: Database, ownerId: number, id: string, reauthorize: ReauthorizeUpload) {
  return db.transaction(async tx => receipt(await ownedSession(tx, ownerId, id, reauthorize)));
}

export async function writeResumableVideoPart(db: Database, ownerId: number, id: string, index: number, request: Request, reauthorize: ReauthorizeUpload) {
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]);
  return db.transaction(async tx => {
    const row = await ownedSession(tx, ownerId, id, reauthorize), size = uploadPartSize(row.sizeBytes, index);
    if (row.status !== "open") throw new ResumableUploadError("اكتمل الرفع ولا يقبل استبدال أجزائه", 409);
    const done = received(row);
    if (done.includes(index)) { await request.body?.cancel().catch(() => undefined); return receipt(row); }
    const data = manifest(row), digest = createHash("sha256"); let bytes = 0;
    const body = boundedRequestBody(request, size);
    if (!body) throw new ResumableUploadError("بيانات الجزء مفقودة");
    const checked = body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) { signal.throwIfAborted(); bytes += chunk.byteLength; digest.update(chunk); controller.enqueue(chunk); },
      flush() { if (bytes !== size || digest.digest("hex") !== data.hashes[index]) throw new ResumableUploadError("بصمة جزء الفيديو أو حجمه لا يطابق الملف", 422); },
    }));
    await putObject(resumablePartKey(row.id, index, data.hashes[index]), checked, "application/octet-stream", assertLocation(row), { signal, maxBytes: size });
    // Fixed content-addressed part keys make retries after a storage/SQL crash
    // harmless: only the bytes matching the precommitted digest can be written.
    const [updated] = await tx.update(uploads).set({ receivedJson: JSON.stringify([...done, index].sort((a, b) => a - b)), updatedAt: new Date() }).where(eq(uploads.id, row.id)).returning();
    return receipt(updated);
  });
}

async function* assembledParts(row: Session, signal: AbortSignal) {
  const data = manifest(row), provider = assertLocation(row);
  for (let index = 0; index < data.hashes.length; index++) {
    signal.throwIfAborted();
    const object = await getObject(resumablePartKey(row.id, index, data.hashes[index]), undefined, provider, signal);
    if (!object) throw new ResumableUploadError("جزء من الفيديو غير متاح؛ أعد الرفع", 409);
    const stream = Readable.fromWeb(object.body as import("node:stream/web").ReadableStream<Uint8Array>);
    const digest = createHash("sha256"); let bytes = 0;
    try {
      for await (const chunk of stream) {
        signal.throwIfAborted(); bytes += chunk.length;
        if (bytes > uploadPartSize(row.sizeBytes, index)) throw new ResumableUploadError("حجم الجزء المخزن غير صالح", 422);
        digest.update(chunk); yield chunk as Buffer;
      }
      if (bytes !== uploadPartSize(row.sizeBytes, index) || digest.digest("hex") !== data.hashes[index]) throw new ResumableUploadError("تغيّرت بصمة جزء مخزن؛ لن يعتمد الفيديو", 422);
    } finally { stream.destroy(); }
  }
}

export async function completeResumableVideo(db: Database, ownerId: number, id: string, reauthorize: ReauthorizeUpload, callerSignal?: AbortSignal, durationSeconds = 0) {
  if (!Number.isSafeInteger(durationSeconds) || durationSeconds < 0 || durationSeconds > 14_400) throw new ResumableUploadError("مدة الفيديو غير صالحة");
  const signal = AbortSignal.any([...(callerSignal ? [callerSignal] : []), AbortSignal.timeout(120_000)]);
  let cleanupIds: string[] = [];
  const result = await db.transaction(async tx => {
    const row = await ownedSession(tx, ownerId, id, reauthorize), data = manifest(row), provider = assertLocation(row);
    if (row.status === "completed") {
      const [asset] = await tx.select({ id: videoAssets.id }).from(videoAssets).where(eq(videoAssets.id, row.assetId || 0)).limit(1);
      if (!asset) throw new ResumableUploadError("حُذف الفيديو المكتمل؛ ابدأ عملية جديدة", 409);
      return { ...receipt(row), reused: true };
    }
    if (received(row).length !== data.hashes.length) throw new ResumableUploadError("لم تكتمل جميع أجزاء الفيديو", 409);
    // Across the deployment, at most two final assemblies can consume temporary
    // disk/network simultaneously. Transaction-scoped locks recover on crashes.
    let admitted = false;
    for (const slot of [0, 1]) {
      const result = await tx.execute(sql`SELECT pg_try_advisory_xact_lock(hashtext('meras-resumable-assembly'), ${slot}) AS admitted`);
      if (result.rows[0].admitted) { admitted = true; break; }
    }
    if (!admitted) throw new ResumableUploadError("تجهيز فيديوهات أخرى جارٍ؛ استأنف اعتماد الفيديو بعد قليل", 429);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`video-upload:${row.courseSlug}:${row.lessonId}`}))`);
    const [lesson] = await tx.select({ id: lessonsDb.id }).from(lessonsDb).where(and(eq(lessonsDb.id, row.lessonId), eq(lessonsDb.courseSlug, row.courseSlug))).for("update");
    if (!lesson) throw new ResumableUploadError("حُذف الدرس؛ لن يعتمد الفيديو", 409);
    const first = await getObject(resumablePartKey(row.id, 0, data.hashes[0]), { offset: 0, length: Math.min(64, row.sizeBytes) }, provider, signal);
    if (!first || !validResumableVideoHeader(row.contentType, new Uint8Array(await new Response(first.body).arrayBuffer()))) throw new ResumableUploadError("محتوى الفيديو لا يطابق نوعه", 422);
    await putObject(row.objectKey, Readable.toWeb(Readable.from(assembledParts(row, signal))) as ReadableStream<Uint8Array>, row.contentType, provider, { signal, maxBytes: row.sizeBytes });
    if (await reauthorize(row.courseSlug) !== ownerId) throw new ResumableUploadError("انتهى التفويض أثناء الرفع", 403);
    const previous = await tx.select().from(videoAssets).where(and(eq(videoAssets.courseSlug, row.courseSlug), eq(videoAssets.lessonId, row.lessonId))).for("update");
    const cleanup: CleanupTarget[] = [{ key: `private/resumable/${row.id}`, provider, source: "resumable-staging", recursive: true }];
    for (const asset of previous) collectVideoCleanup(asset, cleanup);
    const now = new Date().toISOString();
    const [asset] = await tx.insert(videoAssets).values({ courseSlug: row.courseSlug, lessonId: row.lessonId, objectKey: row.objectKey, storageProvider: provider,
      contentType: row.contentType, sizeBytes: row.sizeBytes, durationSeconds: durationSeconds || null, status: "ready", processingStatus: "queued", processingProgress: 0, createdAt: now, updatedAt: now }).returning({ id: videoAssets.id });
    await tx.update(lessonsDb).set({ videoAssetId: asset.id, durationSeconds, updatedAt: now }).where(eq(lessonsDb.id, row.lessonId));
    if (previous.length) await tx.delete(videoAssets).where(inArray(videoAssets.id, previous.map(item => item.id)));
    // Processing admission is atomic too; a crash cannot leave the asset without a job.
    await tx.insert(videoProcessingJobs).values({ assetId: asset.id, status: "queued", nextAttemptAt: now });
    cleanupIds = await enqueueStorageCleanupTx(tx, cleanup);
    const [updated] = await tx.update(uploads).set({ status: "completed", assetId: asset.id, updatedAt: new Date() }).where(eq(uploads.id, row.id)).returning();
    await tx.insert(auditLogs).values({ actorEmail: `user-id:${ownerId}`, action: "upload", entityType: "video_asset", entityId: String(asset.id), afterJson: JSON.stringify({ uploadId: row.id, ownerId, resumable: true }), createdAt: now });
    return { ...receipt(updated), reused: false };
  });
  if (cleanupIds.length) await processStorageCleanupBatch(db, { jobIds: cleanupIds.slice(0, 10), limit: 10 }).catch(() => undefined);
  return result;
}

/** No broad storage listing: only prefixes owned by durable, expired sessions. */
export async function expireResumableVideos(db: Database, ownerId?: number, id?: string) {
  if (id) validateUploadId(id);
  return db.transaction(async tx => {
    const condition = id && ownerId ? and(eq(uploads.id, id), eq(uploads.ownerId, ownerId), eq(uploads.status, "open")) : and(eq(uploads.status, "open"), sql`${uploads.expiresAt} <= clock_timestamp()`);
    const rows = await tx.select().from(uploads).where(condition).limit(10).for("update", { skipLocked: true });
    let expired = 0;
    for (const row of rows) {
      let provider: StorageProvider;
      try { provider = assertLocation(row); manifest(row); } catch { await tx.update(uploads).set({ status: "blocked", updatedAt: new Date() }).where(eq(uploads.id, row.id)); continue; }
      const [linked] = await tx.select({ id: videoAssets.id }).from(videoAssets).where(eq(videoAssets.objectKey, row.objectKey)).limit(1);
      if (linked) { await tx.update(uploads).set({ status: "blocked", updatedAt: new Date() }).where(eq(uploads.id, row.id)); continue; }
      await enqueueStorageCleanupTx(tx, [
        { key: `private/resumable/${row.id}`, provider, source: "resumable-staging", recursive: true },
        { key: normalizeStorageKey(row.objectKey), provider, source: "resumable-source" },
      ]);
      await tx.update(uploads).set({ status: "expired", updatedAt: new Date() }).where(eq(uploads.id, row.id)); expired++;
    }
    return expired;
  });
}
