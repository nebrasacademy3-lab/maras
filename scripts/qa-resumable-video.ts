/** Real PostgreSQL and isolated local objects; no production or live providers. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { and, eq, inArray, sql } from "drizzle-orm";
const local = JSON.parse(readFileSync(".data/qa-database.json", "utf8")) as { url: string };
const url = new URL(local.url);
if (url.hostname !== "127.0.0.1" || url.pathname !== "/maras_qa" || process.env.DATABASE_URL !== local.url
    || resolve(process.env.UPLOAD_DIR || "") !== resolve(".data/uploads")) throw new Error("Dedicated loopback database and isolated files required");
for (const name of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "GEMINI_API_KEY", "GEMINI_API_KEYS", "RESEND_API_KEY", "TAP_SECRET_KEY", "RAILWAY_PROJECT_ID"]) if (process.env[name]) throw new Error("Live configuration prohibited");
const [{ getDb, closeDb }, s, service, storage, policy, queue] = await Promise.all([import("../db"), import("../db/schema"), import("../lib/resumable-video-upload"), import("../lib/storage"), import("../lib/resumable-upload-policy"), import("../lib/storage-cleanup")]);
const db = getDb(), hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const network = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("External transport prohibited"); };
const owner = 1900000001, foreign = 1900000002;
const part0 = Buffer.alloc(policy.RESUMABLE_CHUNK_BYTES, 1); part0.set([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
const tail = Buffer.from("synthetic-last-part");
const request = (bytes: Uint8Array, signal?: AbortSignal) => new Request("https://maras-qa.example/api/admin/videos/resumable", { method: "PUT", body: new Blob([new Uint8Array(bytes)]), signal });
if (process.env.QA_RESUMABLE_CHILD) {
  const id = policy.validateUploadId(process.env.QA_RESUMABLE_CHILD);
  await service.writeResumableVideoPart(db, owner, id, 0, request(part0), async () => owner);
  process.send?.({ written: true }, () => process.exit(84));
} else {
  const nonce = randomUUID().slice(0, 8), course = `qa-resume-${nonce}`, lesson = `qa-resume-lesson-${nonce}`;
  const ids: string[] = [], checks: string[] = [], sourceKeys: string[] = [];
  const pass = (text: string) => { checks.push(text); console.log("PASS RESUMABLE", text); };
  const authorize = async (slug: string) => { assert.equal(slug, course); return owner; };
  const spec = () => ({ courseSlug: course, lessonId: lesson, contentType: "video/mp4", sizeBytes: part0.length + tail.length, hashes: [hash(part0), hash(tail)], requestKey: randomUUID() });
  const one = () => ({ ...spec(), sizeBytes: 12, hashes: [hash(part0.subarray(0, 12))] });
  async function start(input = spec()) { const row = await service.startResumableVideo(db, owner, input, authorize); ids.push(row.id); sourceKeys.push(`private/video-source/${course}/${lesson}/${row.id}.upload`); return row; }
  async function exists(key: string) { const object = await storage.getObject(key, undefined, "local"); if (!object) return false; await object.body.cancel(); return true; }
  async function cancel(id: string) {
    await service.expireResumableVideos(db, owner, id);
    const jobs = await db.select({ id: s.storageCleanupJobs.id }).from(s.storageCleanupJobs).where(sql`${s.storageCleanupJobs.objectKey} LIKE ${`%${id}%`}`);
    if (jobs.length) await queue.processStorageCleanupBatch(db, { limit: 10, jobIds: jobs.map(row => row.id) });
  }
  try {
    await db.insert(s.catalogInstitutions).values({ slug: course, name: course, region: "qa", type: "university" });
    await db.insert(s.catalogSpecialties).values({ slug: course, name: course });
    await db.insert(s.institutionSpecialties).values({ institutionSlug: course, specialtySlug: course });
    await db.insert(s.catalogCourses).values({ slug: course, institutionSlug: course, specialtySlug: course, title: "Synthetic resumable upload", status: "draft" });
    const [unit] = await db.insert(s.courseUnitsDb).values({ courseSlug: course, title: "Synthetic unit" }).returning();
    await db.insert(s.lessonsDb).values({ id: lesson, courseSlug: course, unitId: unit.id, title: "Synthetic lesson" });
    const input = spec(), session = await start(input);
    assert.equal((await service.startResumableVideo(db, owner, input, authorize)).id, session.id);
    await assert.rejects(service.startResumableVideo(db, owner, { ...input, hashes: [hash(part0), "f".repeat(64)] }, authorize), { status: 409 });
    await assert.rejects(service.resumableVideoStatus(db, foreign, session.id, async () => foreign), { status: 404 });
    await assert.rejects(service.resumableVideoStatus(db, owner, session.id, async () => foreign), { status: 403 });
    await assert.rejects(service.completeResumableVideo(db, owner, session.id, authorize), { status: 409 });
    pass("admission is idempotent, owner-bound and rejects changed manifests, revoked authorization and incomplete finalization");

    await assert.rejects(service.writeResumableVideoPart(db, owner, session.id, 1, request(Buffer.alloc(tail.length, 0)), authorize), { status: 422 });
    await assert.rejects(service.writeResumableVideoPart(db, owner, session.id, 1, request(Buffer.alloc(tail.length + 1)), authorize));
    assert.deepEqual((await service.resumableVideoStatus(db, owner, session.id, authorize)).received, []);
    assert.equal(await exists(policy.resumablePartKey(session.id, 1, hash(tail))), false);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(service.writeResumableVideoPart(db, owner, session.id, 0, request(part0, controller.signal), authorize));
    pass("oversized, corrupt and cancelled chunks never become accepted parts or publish storage bytes");

    await new Promise<void>((resolveChild, reject) => {
      const child = spawn(process.execPath, ["--require", "./scripts/tsx-runtime-bootstrap.cjs", "--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", fileURLToPath(import.meta.url)],
        { env: { ...process.env, QA_RESUMABLE_CHILD: session.id }, stdio: ["ignore", "ignore", "pipe", "ipc"] });
      let error = "", written = false; child.stderr!.on("data", bytes => { error += bytes.toString().slice(0, 2000); });
      child.on("message", message => { written = Boolean((message as { written: boolean }).written); });
      child.once("error", reject); child.once("exit", code => code === 84 && written ? resolveChild() : reject(new Error(`Chunk process failed: ${code}: ${error}`)));
    });
    assert.deepEqual((await service.resumableVideoStatus(db, owner, session.id, authorize)).received, [0]);
    // A second process/tab can retry the accepted part but cannot change its contents.
    await service.writeResumableVideoPart(db, owner, session.id, 0, request(Buffer.from("ignored retry")), authorize);
    await service.writeResumableVideoPart(db, owner, session.id, 1, request(tail), authorize);
    const done = await service.completeResumableVideo(db, owner, session.id, authorize);
    const [asset] = await db.select().from(s.videoAssets).where(eq(s.videoAssets.id, done.asset!.id));
    const object = await storage.getObject(asset.objectKey, undefined, "local"); assert.ok(object);
    assert.equal(hash(new Uint8Array(await new Response(object.body).arrayBuffer())), hash(Buffer.concat([part0, tail])));
    assert.equal((await db.select().from(s.videoProcessingJobs).where(eq(s.videoProcessingJobs.assetId, asset.id))).length, 1);
    assert.equal((await db.select().from(s.lessonsDb).where(eq(s.lessonsDb.id, lesson)))[0].videoAssetId, asset.id);
    assert.equal(await exists(policy.resumablePartKey(session.id, 0, hash(part0))), false);
    assert.equal((await service.completeResumableVideo(db, owner, session.id, authorize)).asset!.id, asset.id);
    await assert.rejects(service.writeResumableVideoPart(db, owner, session.id, 0, request(part0), authorize), { status: 409 });
    pass("a process exits after committing part one; a new process resumes missing bytes, publishes one exact asset and processing job, and rejects later rewriting");

    const throttled = await start(one());
    await service.writeResumableVideoPart(db, owner, throttled.id, 0, request(part0.subarray(0, 12)), authorize);
    await db.transaction(async tx => {
      for (const slot of [0, 1]) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('meras-resumable-assembly'), ${slot})`);
      await assert.rejects(service.completeResumableVideo(db, owner, throttled.id, authorize), { status: 429 });
    });
    assert.equal((await service.resumableVideoStatus(db, owner, throttled.id, authorize)).status, "open");
    await cancel(throttled.id);
    pass("shared transaction locks bound final assembly concurrency without losing already uploaded parts");

    const corrupted = await start(one());
    await service.writeResumableVideoPart(db, owner, corrupted.id, 0, request(part0.subarray(0, 12)), authorize);
    await storage.putObject(policy.resumablePartKey(corrupted.id, 0, hash(part0.subarray(0, 12))), new Blob(["not-a-video!"]).stream(), "application/octet-stream", "local");
    await assert.rejects(service.completeResumableVideo(db, owner, corrupted.id, authorize), { status: 422 });
    assert.equal((await db.select().from(s.lessonsDb).where(eq(s.lessonsDb.id, lesson)))[0].videoAssetId, asset.id);
    await cancel(corrupted.id);
    pass("tampering with an accepted stored part is detected again before replacing the currently linked video");

    const rollback = await start(one());
    await service.writeResumableVideoPart(db, owner, rollback.id, 0, request(part0.subarray(0, 12)), authorize);
    let calls = 0;
    await assert.rejects(service.completeResumableVideo(db, owner, rollback.id, async () => ++calls === 1 ? owner : foreign), { status: 403 });
    assert.equal((await db.select().from(s.lessonsDb).where(eq(s.lessonsDb.id, lesson)))[0].videoAssetId, asset.id);
    assert.equal((await service.resumableVideoStatus(db, owner, rollback.id, authorize)).status, "open");
    await cancel(rollback.id);
    assert.equal(await exists(`private/video-source/${course}/${lesson}/${rollback.id}.upload`), false);
    assert.equal(await exists(asset.objectKey), true);
    pass("authorization loss after assembly rolls back publication; durable cancellation removes unpublished bytes without touching the prior video");

    const a = await start(one()), b = await start(one());
    await assert.rejects(start(one()), { status: 429 });
    await db.update(s.resumableVideoUploads).set({ expiresAt: new Date(0) }).where(eq(s.resumableVideoUploads.id, a.id));
    assert.equal(await service.expireResumableVideos(db), 1);
    await assert.rejects(service.resumableVideoStatus(db, owner, a.id, authorize), { status: 410 });
    // Admissions remain bounded until the expired session's queued cleanup completes.
    await assert.rejects(start(one()), { status: 429 });
    await cancel(a.id); await cancel(b.id);
    pass("per-account admission and expired staging stay bounded until durable cleanup completes");

    const drift = await start(one());
    await service.writeResumableVideoPart(db, owner, drift.id, 0, request(part0.subarray(0, 12)), authorize);
    await db.update(s.resumableVideoUploads).set({ locationFingerprint: "0".repeat(64) }).where(eq(s.resumableVideoUploads.id, drift.id));
    await assert.rejects(service.resumableVideoStatus(db, owner, drift.id, authorize), { status: 409 });
    await service.expireResumableVideos(db, owner, drift.id);
    assert.equal((await db.select().from(s.resumableVideoUploads).where(eq(s.resumableVideoUploads.id, drift.id)))[0].status, "blocked");
    assert.equal(await exists(policy.resumablePartKey(drift.id, 0, hash(part0.subarray(0, 12)))), true);
    pass("storage relocation blocks upload and cleanup rather than guessing which same-named object to remove");

    await db.update(s.resumableVideoUploads).set({ status: "open", locationFingerprint: storage.storageLocationFingerprint("local"), objectKey: asset.objectKey }).where(eq(s.resumableVideoUploads.id, drift.id));
    await service.expireResumableVideos(db, owner, drift.id);
    assert.equal((await db.select().from(s.resumableVideoUploads).where(eq(s.resumableVideoUploads.id, drift.id)))[0].status, "blocked");
    assert.equal(await exists(asset.objectKey), true);
    pass("corrupt session source metadata cannot turn expiration into deletion of another session's linked video");
    writeFileSync(".data/qa-resumable-video-report.json", JSON.stringify({ passed: checks.length, checks, providers: "isolated local storage only", protocol: "application-level 4MiB chunks, not native S3 multipart", physicalDevices: false }, null, 2));
  } finally {
    globalThis.fetch = network;
    for (const id of ids) await storage.deletePrefix(`private/resumable/${id}`, "local").catch(() => undefined);
    for (const key of sourceKeys) await storage.deleteObject(key, "local").catch(() => undefined);
    await db.delete(s.videoAssets).where(eq(s.videoAssets.courseSlug, course));
    await db.delete(s.lessonsDb).where(eq(s.lessonsDb.courseSlug, course));
    await db.delete(s.courseUnitsDb).where(eq(s.courseUnitsDb.courseSlug, course));
    await db.delete(s.catalogCourses).where(eq(s.catalogCourses.slug, course));
    await db.delete(s.institutionSpecialties).where(eq(s.institutionSpecialties.institutionSlug, course));
    await db.delete(s.catalogSpecialties).where(eq(s.catalogSpecialties.slug, course));
    await db.delete(s.catalogInstitutions).where(eq(s.catalogInstitutions.slug, course));
    if (ids.length) {
      await db.delete(s.resumableVideoUploads).where(inArray(s.resumableVideoUploads.id, ids));
      await db.execute(sql`DELETE FROM storage_cleanup_jobs WHERE source LIKE 'resumable-%' AND (${sql.join(ids.map(id => sql`object_key LIKE ${`%${id}%`}`), sql` OR `)})`);
      await db.delete(s.auditLogs).where(and(eq(s.auditLogs.actorEmail, `user-id:${owner}`), sql`${s.auditLogs.afterJson} LIKE ${`%${ids[0]}%`}`));
    }
    await closeDb();
  }
}
