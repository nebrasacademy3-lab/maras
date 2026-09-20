import assert from "node:assert/strict";
import test from "node:test";
import { nativeSource } from "./helpers/native-source.mjs";
const storage = await nativeSource("lib/storage-policy.ts");
const policy = await nativeSource("lib/storage-cleanup-policy.ts", storage);
const target = { key: "private/video-derived/11/a55b3b39-2045-46e5-b52b-0f69187f9d32", provider: "s3", source: "video-derived", recursive: true, locationFingerprint: "a".repeat(64) };
test("recursive cleanup accepts only an immutable video processing attempt", () => {
  assert.deepEqual(policy.validateCleanupTarget(target), target);
  for (const key of ["private", "private/video-derived", "private/video-derived/11", "private/video-derived/0/a55b3b39-2045-46e5-b52b-0f69187f9d32", target.key + "/../sibling", target.key + "/nested", target.key + "%2f.."]) {
    assert.throws(() => policy.validateCleanupTarget({ ...target, key }), key);
  }
});
test("exact deletes preserve canonical keys and do not reinterpret unknown providers", () => {
  assert.equal(policy.validateCleanupTarget({ ...target, recursive: false, key: "support/a-file" }).key, "support/a-file");
  for (const change of [{ provider: "other" }, { locationFingerprint: "" }, { source: "../path" }, { key: "../outside" }]) {
    assert.throws(() => policy.validateCleanupTarget({ ...target, ...change }));
  }
});
test("retry delays are bounded and the operation deadline is shorter than the lease", () => {
  const values = Array.from({ length: 12 }, (_, index) => policy.cleanupRetrySeconds(index + 1));
  assert.equal(values[0], 5); assert.equal(values.at(-1), 3600);
  assert.ok(values.every((value, index) => value >= (values[index - 1] || 0) && value <= 3600));
  for (const value of [0, -1, 1.5, 13, Infinity, NaN]) assert.throws(() => policy.cleanupRetrySeconds(value));
  assert.ok(policy.CLEANUP_BATCH_TIMEOUT_MS < policy.CLEANUP_LEASE_SECONDS * 1000);
});
