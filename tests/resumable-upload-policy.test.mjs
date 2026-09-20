import assert from "node:assert/strict";
import test from "node:test";
import { nativeSource } from "./helpers/native-source.mjs";
const p = await nativeSource("lib/resumable-upload-policy.ts");
const id = "348c3c81-7c0b-44dc-8aef-bfe534909c24", hash = "a".repeat(64);
const base = { requestKey: id, courseSlug: "course-1", lessonId: "lesson-1", contentType: "video/mp4", sizeBytes: 10, hashes: [hash] };
test("resumable manifest binds an exact bounded size to every part digest", () => {
  assert.deepEqual(p.validateUploadManifest(base), base);
  for (const change of [{ hashes: [] }, { hashes: [hash, hash] }, { hashes: ["wrong"] }, { sizeBytes: 0 }, { sizeBytes: p.RESUMABLE_MAX_BYTES + 1 }, { sizeBytes: 1.5 }, { courseSlug: "../x" }, { lessonId: ".." }, { contentType: "text/plain" }, { requestKey: "../x" }]) assert.throws(() => p.validateUploadManifest({ ...base, ...change }));
  assert.equal(p.uploadPartSize(p.RESUMABLE_CHUNK_BYTES + 10, 0), p.RESUMABLE_CHUNK_BYTES);
  assert.equal(p.uploadPartSize(p.RESUMABLE_CHUNK_BYTES + 10, 1), 10);
  for (const index of [-1, 1.5, 2, Infinity]) assert.throws(() => p.uploadPartSize(10, index));
});
test("part paths cannot escape their random upload session or admit arbitrary hashes", () => {
  assert.equal(p.resumablePartKey(id, 0, hash), `private/resumable/${id}/0-${hash}`);
  for (const args of [["../elsewhere", 0, hash], [id, -1, hash], [id, 50, hash], [id, 0, "../key"]]) assert.throws(() => p.resumablePartKey(...args));
});
test("video assembly requires actual supported magic bytes", () => {
  const mp4 = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
  assert.equal(p.validResumableVideoHeader("video/mp4", mp4), true);
  assert.equal(p.validResumableVideoHeader("video/webm", mp4), false);
  assert.equal(p.validResumableVideoHeader("video/mp4", new TextEncoder().encode("not-a-video")), false);
});
test("resumable route denies invalid origin, identity and rate limits before opening the database", async () => {
  for (const scenario of [{ origin: false, role: "admin", status: 403 }, { origin: true, role: "student", status: 403 }, { origin: true, role: "admin", rate: false, status: 429 }]) {
    const route = await nativeSource("app/api/admin/videos/resumable/route.ts", {
      ...p, sameOriginRequest: () => scenario.origin, isNativeAppRequest: () => false,
      getSessionUser: async () => ({ id: 8, role: scenario.role }), roleAllowed: (user, roles) => roles.includes(user.role),
      checkRateLimit: async () => scenario.rate !== false, getDb: () => { assert.fail("database opened before rejection"); },
      RequestBodyTooLargeError: class extends Error {},
    });
    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      const response = await route[method](new Request("https://maras-qa.example/api/admin/videos/resumable", { method }));
      assert.equal(response.status, scenario.status); assert.match(response.headers.get("cache-control"), /no-store/);
    }
  }
});
