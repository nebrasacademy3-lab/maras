/** Disposable PostgreSQL and local objects only; exercises the actual deletion service. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq, inArray, sql } from "drizzle-orm";

const local = JSON.parse(readFileSync(".data/qa-database.json", "utf8")) as { url: string };
const address = new URL(local.url);
if (address.hostname !== "127.0.0.1" || address.pathname !== "/maras_qa" || process.env.DATABASE_URL !== local.url) throw new Error("Dedicated loopback maras_qa required");
for (const key of ["GEMINI_API_KEY", "GEMINI_API_KEYS", "GEMINI_PAID_API_KEY", "GEMINI_PAID_API_KEYS", "RESEND_API_KEY", "TAP_SECRET_KEY", "S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "BUCKET", "RAILWAY_PROJECT_ID"]) {
  if (process.env[key]) throw new Error("Live services prohibited");
}
if (resolve(process.env.UPLOAD_DIR || "") !== resolve(".data/uploads")) throw new Error("Isolated upload directory required");
const [{ getDb, closeDb }, s, deletion, storage] = await Promise.all([
  import("../db"), import("../db/schema"), import("../lib/admin-deletion"), import("../lib/storage"),
]);
const db = getDb(), nonce = randomUUID().slice(0, 8);
const courses = [`qa-delete-media-${nonce}-a`, `qa-delete-media-${nonce}-b`];
const assetIds: number[] = [], objectKeys: string[] = [], prefixes: string[] = [], checks: string[] = [];
const network = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("External transport prohibited in media deletion QA"); };
function pass(value: string) { checks.push(value); console.log("PASS MEDIA DELETION", value); }
function command(entityType: import("../lib/admin-deletion").AdminDeletionType, entityId: string | number) {
  return { entityType, entityId: String(entityId), actor: `qa-media-${nonce}@example.test`, ipAddress: "127.0.0.1", confirmation: "حذف" };
}
async function put(key: string) {
  objectKeys.push(key);
  await storage.putObject(key, new Blob(["synthetic-private-media"]).stream(), "application/octet-stream", "local");
}
async function exists(key: string) {
  const object = await storage.getObject(key, undefined, "local");
  if (!object) return false;
  assert.equal(object.size, 23); await object.body.cancel(); return true;
}
async function derived(id: number) {
  const prefix = `private/video-derived/${id}/${randomUUID()}`; prefixes.push(prefix);
  const keys = ["master.m3u8", "thumbnail.jpg", "180p/index.m3u8", "180p/segment_000.ts"].map(suffix => `${prefix}/${suffix}`);
  for (const key of keys) await put(key);
  return { prefix, keys, master: keys[0], thumbnail: keys[1] };
}
async function media(course: string, lesson: string) {
  const key = `qa-media-delete/${nonce}/${randomUUID()}.mp4`; await put(key);
  const [asset] = await db.insert(s.videoAssets).values({ courseSlug: course, lessonId: lesson, objectKey: key,
    contentType: "video/mp4", sizeBytes: 23, storageProvider: "local", status: "ready", processingStatus: "ready" }).returning();
  assetIds.push(asset.id);
  const output = await derived(asset.id);
  await db.update(s.videoAssets).set({ derivativesPrefix: output.prefix, hlsMasterObjectKey: output.master, thumbnailObjectKey: output.thumbnail }).where(eq(s.videoAssets.id, asset.id));
  await db.insert(s.videoProcessingJobs).values({ assetId: asset.id, status: "completed" });
  await db.insert(s.videoRenditions).values({ assetId: asset.id, qualityLabel: "180p", width: 320, height: 180, bitrateKbps: 200,
    manifestObjectKey: output.keys[2], segmentPrefix: `${output.prefix}/180p`, status: "ready" });
  await db.update(s.lessonsDb).set({ videoAssetId: asset.id }).where(eq(s.lessonsDb.id, lesson));
  return { id: asset.id, source: key, output };
}
async function assertRemoved(asset: Awaited<ReturnType<typeof media>>) {
  assert.equal((await db.select().from(s.videoAssets).where(eq(s.videoAssets.id, asset.id))).length, 0);
  assert.equal((await db.select().from(s.videoProcessingJobs).where(eq(s.videoProcessingJobs.assetId, asset.id))).length, 0);
  assert.equal((await db.select().from(s.videoRenditions).where(eq(s.videoRenditions.assetId, asset.id))).length, 0);
  for (const key of [asset.source, ...asset.output.keys]) assert.equal(await exists(key), false, key);
}
try {
  await db.insert(s.catalogCourses).values(courses.map(slug => ({ slug, institutionSlug: "qa-university", title: "Synthetic media deletion", status: "draft" })));
  const units = await db.insert(s.courseUnitsDb).values([
    { courseSlug: courses[0], title: "Empty unit" }, { courseSlug: courses[0], title: "Selected unit" },
    { courseSlug: courses[0], title: "Sibling unit" }, { courseSlug: courses[1], title: "Other course" },
  ]).returning();
  const lessonIds = ["selected", "sibling", "other"].map(label => `qa-media-delete-${nonce}-${label}`);
  await db.insert(s.lessonsDb).values(lessonIds.map((id, index) => ({ id, unitId: units[index + 1].id, courseSlug: units[index + 1].courseSlug, title: "Synthetic lesson" })));
  const selected = await media(courses[0], lessonIds[0]);
  const sibling = await media(courses[0], lessonIds[1]);
  const foreign = await media(courses[1], lessonIds[2]);
  const before = await db.select().from(s.videoAssets).where(inArray(s.videoAssets.id, assetIds)).orderBy(s.videoAssets.id);
  const jobsBefore = await db.select().from(s.videoProcessingJobs).where(inArray(s.videoProcessingJobs.assetId, assetIds)).orderBy(s.videoProcessingJobs.id);
  const renditionsBefore = await db.select().from(s.videoRenditions).where(inArray(s.videoRenditions.assetId, assetIds)).orderBy(s.videoRenditions.id);
  await deletion.deleteAdminEntity(db, command("unit", units[0].id));
  assert.deepEqual(await db.select().from(s.videoAssets).where(inArray(s.videoAssets.id, assetIds)).orderBy(s.videoAssets.id), before);
  assert.deepEqual(await db.select().from(s.videoProcessingJobs).where(inArray(s.videoProcessingJobs.assetId, assetIds)).orderBy(s.videoProcessingJobs.id), jobsBefore);
  assert.deepEqual(await db.select().from(s.videoRenditions).where(inArray(s.videoRenditions.assetId, assetIds)).orderBy(s.videoRenditions.id), renditionsBefore);
  for (const key of objectKeys) assert.equal(await exists(key), true);
  pass("empty-unit deletion leaves every sibling and foreign-course asset, rendition, job and stored byte intact");

  const rollbackDb = new Proxy(db, { get(target, property, receiver) {
    if (property === "transaction") return (callback: Parameters<typeof db.transaction>[0]) => target.transaction(async tx => {
      await callback(tx); throw new Error("Synthetic post-delete rollback");
    });
    return Reflect.get(target, property, receiver);
  } });
  await assert.rejects(deletion.deleteAdminEntity(rollbackDb, command("unit", units[1].id)), /Synthetic post-delete rollback/);
  assert.equal((await db.select().from(s.lessonsDb).where(eq(s.lessonsDb.id, lessonIds[0]))).length, 1);
  assert.equal((await db.select().from(s.videoRenditions).where(eq(s.videoRenditions.assetId, selected.id))).length, 1);
  for (const key of [selected.source, ...selected.output.keys]) assert.equal(await exists(key), true);
  pass("real transaction rollback restores lesson, asset and cascaded child rows without removing any original or derivative object");

  await db.update(s.videoAssets).set({ derivativesPrefix: "private/video-derived" }).where(eq(s.videoAssets.id, selected.id));
  await assert.rejects(deletion.deleteAdminEntity(db, command("video", selected.id)), { name: "DeletionPolicyError" });
  assert.equal((await db.select().from(s.videoAssets).where(eq(s.videoAssets.id, selected.id))).length, 1);
  for (const key of objectKeys) assert.equal(await exists(key), true);
  await db.update(s.videoAssets).set({ derivativesPrefix: selected.output.prefix }).where(eq(s.videoAssets.id, selected.id));
  pass("a broad derivative prefix fails closed before row deletion or recursive storage cleanup");

  const removed = await deletion.deleteAdminEntity(db, command("unit", units[1].id));
  assert.deepEqual(removed.cleanupFailures, []); await assertRemoved(selected);
  assert.equal((await db.select().from(s.lessonsDb).where(eq(s.lessonsDb.id, lessonIds[0]))).length, 0);
  for (const key of [sibling.source, ...sibling.output.keys, foreign.source, ...foreign.output.keys]) assert.equal(await exists(key), true);
  pass("selected-unit deletion removes original, HLS, thumbnail and cascaded jobs/renditions while preserving the sibling unit");

  await deletion.deleteAdminEntity(db, command("video", sibling.id)); await assertRemoved(sibling);
  assert.equal((await db.select().from(s.lessonsDb).where(eq(s.lessonsDb.id, lessonIds[1])))[0].videoAssetId, null);
  const orphan = await media(courses[0], `removed-lesson-${nonce}`);
  await deletion.deleteAdminEntity(db, command("course", courses[0])); await assertRemoved(orphan);
  assert.equal(await exists(foreign.source), true);
  pass("single-video deletion clears its lesson link; whole-course deletion includes unlinked assets but never another course's media");

  // Publish a new worker attempt while deletion is waiting on the actual asset
  // lock. A pre-lock snapshot would clean the old prefix and leak the new one.
  const replacement = await derived(foreign.id);
  let release!: () => void, acquired!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { acquired = resolve; });
  const publishing = db.transaction(async tx => {
    await tx.select().from(s.videoAssets).where(eq(s.videoAssets.id, foreign.id)).for("update");
    await tx.update(s.videoAssets).set({ derivativesPrefix: replacement.prefix, hlsMasterObjectKey: replacement.master, thumbnailObjectKey: replacement.thumbnail }).where(eq(s.videoAssets.id, foreign.id));
    acquired(); await released;
  });
  void publishing.catch(() => acquired());
  await ready;
  const removing = deletion.deleteAdminEntity(db, command("video", foreign.id));
  void removing.catch(() => undefined);
  try {
    let blocked = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await db.execute(sql`SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
        AND pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query LIKE '%video_assets%' LIMIT 1`);
      if (result.rows.length) { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(blocked, true, "the test must actually overlap publication and deletion");
  } finally { release(); await publishing; }
  assert.deepEqual((await removing).cleanupFailures, []);
  for (const key of replacement.keys) assert.equal(await exists(key), false, "newly published derivative is cleaned");
  for (const key of foreign.output.keys) assert.equal(await exists(key), true, "cleanup did not guess an asset-wide prefix");
  assert.equal(await exists(foreign.source), false);
  pass("overlapping worker publication and deletion take a fresh locked snapshot and remove the newly committed prefix, not a stale one");

  writeFileSync(".data/qa-admin-media-deletion-report.json", JSON.stringify({ passed: checks.length, checks,
    database: "disposable loopback PostgreSQL", storage: "local synthetic objects", liveProviders: false,
    limits: "not an S3 integration test, resumable upload acceptance or automatic cleanup retry proof" }, null, 2));
} finally {
  globalThis.fetch = network;
  if (assetIds.length) await db.delete(s.videoAssets).where(inArray(s.videoAssets.id, assetIds));
  await db.delete(s.lessonsDb).where(inArray(s.lessonsDb.courseSlug, courses));
  await db.delete(s.courseUnitsDb).where(inArray(s.courseUnitsDb.courseSlug, courses));
  await db.delete(s.catalogCourses).where(inArray(s.catalogCourses.slug, courses));
  for (const prefix of prefixes) await storage.deletePrefix(prefix, "local");
  for (const key of objectKeys) await storage.deleteObject(key, "local");
  await closeDb();
}
