import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { cleanupFixture } from "./helpers/storage-cleanup-fixture.mjs";
import { nativeSource } from "./helpers/native-source.mjs";
import { ownershipDatabase, sql, eq, and, inArray } from "./helpers/ownership-database.mjs";

const source = await readFile(new URL("../lib/admin-deletion.ts", import.meta.url), "utf8");
const names = source.match(/import\s*\{[^}]*\}\s*from\s*["']@\/db\/schema["']/g)
  .flatMap(declaration => declaration.split("{")[1].split("}")[0].split(",").map(name => name.trim()).filter(Boolean));
names.push("storageCleanupJobs");
const policy = await nativeSource("lib/storage-policy.ts");
const attempt = "a55b3b39-2045-46e5-b52b-0f69187f9d32";
function asset(id, lessonId = "lesson-a", overrides = {}) {
  const prefix = `private/video-derived/${id}/${attempt}`;
  return { id, courseSlug: "course-a", lessonId, objectKey: `private/video-source/${id}.mp4`, storageProvider: "local",
    derivativesPrefix: prefix, hlsMasterObjectKey: `${prefix}/master.m3u8`, thumbnailObjectKey: `${prefix}/thumbnail.jpg`, ...overrides };
}
const initial = () => ({
  catalogCourses: [{ slug: "course-a" }, { slug: "course-b" }],
  courseUnitsDb: [{ id: 1, courseSlug: "course-a" }, { id: 2, courseSlug: "course-a" }, { id: 3, courseSlug: "course-b" }],
  lessonsDb: [{ id: "lesson-a", unitId: 2, courseSlug: "course-a", videoAssetId: 11 }, { id: "lesson-b", unitId: 3, courseSlug: "course-b", videoAssetId: 22 }],
  videoAssets: [asset(11), asset(22, "lesson-b", { courseSlug: "course-b", storageProvider: "s3" })],
  lessonNotes: [{ id: 1, lessonId: "lesson-a" }, { id: 2, lessonId: "lesson-b" }],
  lessonProgress: [{ id: 1, lessonId: "lesson-a", courseSlug: "course-a" }, { id: 2, lessonId: "lesson-b", courseSlug: "course-b" }],
});
const command = (entityType, entityId) => ({ entityType, entityId: String(entityId), confirmation: "حذف", actor: "admin@example.test", ipAddress: "127.0.0.1" });
async function fixture(data = initial(), { failCleanup = false, rollback = false } = {}) {
  const h = ownershipDatabase(names, data), cleanup = [];
  let inflight = 0, peak = 0;
  async function remove(kind, key, provider) {
    assert.equal(h.inTransaction(), false, "storage must not run inside an uncommitted transaction");
    assert.equal(h.committed(), true, "storage must follow a successful commit");
    inflight++; peak = Math.max(peak, inflight);
    try { await new Promise(resolve => setImmediate(resolve)); cleanup.push({ kind, key, provider }); if (failCleanup) throw new Error("Synthetic storage outage"); }
    finally { inflight--; }
  }
  if (rollback) {
    const transaction = h.db.transaction;
    h.db.transaction = callback => transaction(async tx => { await callback(tx); throw new Error("Synthetic rollback"); });
  }
  const deletion = await nativeSource("lib/admin-deletion.ts", { ...h.tables, sql, eq, and, inArray, ...policy, ...cleanupFixture(h, remove),
    deleteObject: (key, provider) => remove("object", key, provider), deletePrefix: (key, provider) => remove("prefix", key, provider) });
  return { ...h, ...deletion, cleanup, peak: () => peak };
}

test("deleting an empty unit never widens its empty lesson set to every video in the course", async () => {
  const data = initial(), h = await fixture(data);
  await h.deleteAdminEntity(h.db, command("unit", 1));
  assert.deepEqual(h.rows.videoAssets, data.videoAssets);
  assert.deepEqual(h.rows.lessonsDb, data.lessonsDb);
  assert.deepEqual(h.rows.lessonProgress, data.lessonProgress);
  assert.deepEqual(h.cleanup, []);
  assert.deepEqual(h.rows.courseUnitsDb.map(row => row.id), [2, 3]);
});

test("unit deletion removes only same-course lessons and their media, never a malformed foreign-course association", async () => {
  const data = initial(); data.lessonsDb[1].unitId = 2;
  const h = await fixture(data);
  await h.deleteAdminEntity(h.db, command("unit", 2));
  assert.deepEqual(h.rows.lessonsDb, [data.lessonsDb[1]]);
  assert.deepEqual(h.rows.videoAssets, [data.videoAssets[1]]);
  assert.deepEqual(h.rows.lessonNotes, [data.lessonNotes[1]]);
  assert.deepEqual(h.cleanup, [{ kind: "object", key: data.videoAssets[0].objectKey, provider: "local" },
    { kind: "prefix", key: data.videoAssets[0].derivativesPrefix, provider: "local" }]);
});

test("course deletion intentionally includes unlinked media but cannot delete another course's files", async () => {
  const data = initial(); data.videoAssets.push(asset(33, "removed-lesson"));
  const h = await fixture(data);
  await h.deleteAdminEntity(h.db, command("course", "course-a"));
  assert.deepEqual(h.rows.videoAssets, [data.videoAssets[1]]);
  assert.deepEqual(h.rows.lessonsDb, [data.lessonsDb[1]]);
  assert.equal(h.cleanup.length, 4);
  assert.equal(h.cleanup.some(item => item.key.includes("/22")), false);
});

for (const provider of ["local", "s3"]) test(`video deletion uses persisted ${provider} storage for both original and generated files`, async () => {
  const data = initial(); data.videoAssets[0].storageProvider = provider;
  const h = await fixture(data);
  await h.deleteAdminEntity(h.db, command("video", 11));
  assert.equal(h.rows.lessonsDb[0].videoAssetId, null);
  assert.equal(h.rows.lessonsDb[1].videoAssetId, 22);
  assert.deepEqual(h.cleanup, [{ kind: "object", key: data.videoAssets[0].objectKey, provider },
    { kind: "prefix", key: data.videoAssets[0].derivativesPrefix, provider }]);
});

test("source-only and legacy exact derivative keys remain deletable without inventing a broad prefix", async () => {
  const data = initial(); data.videoAssets[0].derivativesPrefix = null;
  const h = await fixture(data);
  await h.deleteAdminEntity(h.db, command("lesson", "lesson-a"));
  assert.deepEqual(h.cleanup, [data.videoAssets[0].objectKey, data.videoAssets[0].hlsMasterObjectKey, data.videoAssets[0].thumbnailObjectKey]
    .map(key => ({ kind: "object", key, provider: "local" })));
  const plain = initial(); Object.assign(plain.videoAssets[0], { derivativesPrefix: null, hlsMasterObjectKey: null, thumbnailObjectKey: null });
  const p = await fixture(plain); await p.deleteAdminEntity(p.db, command("video", 11));
  assert.equal(p.cleanup.length, 1);
});

for (const prefix of ["private", "private/video-derived", "private/video-derived/11", `private/video-derived/22/${attempt}`,
  `private/video-derived/11/${attempt}/../other`, `private/video-derived/11/${attempt}/extra`, `private/video-derived/11/%2e%2e`]) {
  test(`unsafe or foreign derivative prefix fails before any database or storage deletion: ${prefix}`, async () => {
    const data = initial(); data.videoAssets[0].derivativesPrefix = prefix;
    const h = await fixture(data);
    await assert.rejects(h.deleteAdminEntity(h.db, command("video", 11)), { name: "DeletionPolicyError" });
    assert.deepEqual(h.rows.videoAssets, data.videoAssets); assert.deepEqual(h.cleanup, []); assert.equal(h.rows.auditLogs.length, 0);
  });
}

test("foreign derivative object and unknown storage provider cannot be interpreted as local cleanup", async () => {
  for (const changes of [{ storageProvider: "unknown" }, { derivativesPrefix: null, thumbnailObjectKey: `private/video-derived/22/${attempt}/thumbnail.jpg` }]) {
    const data = initial(); Object.assign(data.videoAssets[0], changes);
    const h = await fixture(data);
    await assert.rejects(h.deleteAdminEntity(h.db, command("video", 11)), { name: "DeletionPolicyError" });
    assert.deepEqual(h.rows.videoAssets, data.videoAssets); assert.deepEqual(h.cleanup, []);
  }
});

test("transaction rollback preserves original, HLS, thumbnails and links without touching storage", async () => {
  const data = initial(), h = await fixture(data, { rollback: true });
  await assert.rejects(h.deleteAdminEntity(h.db, command("unit", 2)), /Synthetic rollback/);
  assert.deepEqual(h.rows.videoAssets, data.videoAssets); assert.deepEqual(h.rows.lessonsDb, data.lessonsDb); assert.deepEqual(h.cleanup, []);
});

test("post-commit cleanup failures keep exact provider and operation in the audit, without reversing deletion", async () => {
  const h = await fixture(initial(), { failCleanup: true });
  const result = await h.deleteAdminEntity(h.db, command("video", 22));
  assert.equal(result.deleted, true); assert.equal(result.cleanupFailures.length, 2);
  assert.equal(h.rows.videoAssets.some(row => row.id === 22), false);
  const warning = JSON.parse(h.rows.auditLogs.find(row => row.action === "cleanup_warning").beforeJson);
  assert.equal(warning.cleanupTargets.length, 2);
  assert.ok(warning.cleanupTargets.every(item => item.provider === "s3"));
  assert.equal(warning.cleanupTargets.filter(item => item.recursive).length, 1);
});

test("large media deletions bound simultaneous storage cleanup work", async () => {
  const data = initial(); data.videoAssets = Array.from({ length: 28 }, (_, index) => asset(index + 40, "lesson-a"));
  const h = await fixture(data);
  await h.deleteAdminEntity(h.db, command("unit", 2));
  assert.equal(h.cleanup.length, 56); assert.ok(h.peak() <= 10, `cleanup concurrency ${h.peak()}`);
});
