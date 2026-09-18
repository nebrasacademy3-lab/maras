import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { pureSource } from "./helpers/pure-source.mjs";

const policy = await pureSource("lib/storage-policy.ts");

test("storage keys reject traversal, ambiguous separators, controls and URL delimiters", () => {
  assert.equal(policy.normalizeStorageKey("private/video-source/course/lesson/file.mp4"), "private/video-source/course/lesson/file.mp4");
  for (const value of ["", "/root", "root/", "a//b", "a/../b", "a/./b", "a\\b", "a?b", "a#b", "a%b", " a/b", "a/b\n"]) {
    assert.throws(() => policy.normalizeStorageKey(value), /storage key/i, value);
  }
  assert.throws(() => policy.normalizeStorageKey("a".repeat(1025)), /too long/i);
});

test("S3 endpoint policy blocks credentials, private networks, redirects-by-configuration and insecure public HTTP", () => {
  assert.equal(policy.storageEndpointUrl("https://fly.storage.tigris.dev").origin, "https://fly.storage.tigris.dev");
  for (const value of [
    "http://storage.example.com",
    "https://127.0.0.1",
    "https://169.254.169.254",
    "https://10.0.0.1",
    "https://localhost",
    "https://bucket.internal",
    "https://user:secret@storage.example.com",
    "https://storage.example.com?target=https://evil.example",
  ]) assert.throws(() => policy.storageEndpointUrl(value), /S3 endpoint|Unsafe/i, value);
  assert.equal(policy.storageEndpointUrl("http://127.0.0.1:9000", { allowLoopbackHttp: true }).origin, "http://127.0.0.1:9000");
});

test("bucket, upload limit, transfer timeout and signed lifetime are bounded", () => {
  assert.equal(policy.normalizeStorageBucket("marasvideos"), "marasvideos");
  for (const bucket of ["../bucket", "UPPERCASE", "192.168.1.1", "a..b", "-bucket", "bucket-"]) assert.throws(() => policy.normalizeStorageBucket(bucket));
  assert.equal(policy.signedUploadTtlSeconds(99999), 900);
  assert.equal(policy.signedUploadTtlSeconds(1), 60);
  assert.ok(policy.storageUploadLimitBytes("99999999999") <= 2_000_000_000);
  assert.ok(policy.storageTransferTimeoutMs("999999999") <= 30 * 60_000);
});

test("storage transport fails closed on redirects and bounds object uploads", async () => {
  const source = await readFile(new URL("../lib/storage.ts", import.meta.url), "utf8");
  assert.match(source, /redirect:\s*"error"/);
  assert.match(source, /credentials:\s*"omit"/);
  assert.match(source, /STORAGE_MAX_UPLOAD_BYTES/);
  assert.match(source, /S3 prefix listing exceeded the safety page limit/);
  assert.match(source, /responseSnippet\(response, 2 \* 1024 \* 1024\)/);
});

test("presigned direct uploads validate key, destination, lifetime and HEAD deadline", async () => {
  const source = await readFile(new URL("../lib/railway-direct-upload.ts", import.meta.url), "utf8");
  assert.match(source, /normalizeStorageKey\(key\)/);
  assert.match(source, /Unexpected signed upload destination/);
  assert.match(source, /Invalid signed upload lifetime/);
  assert.match(source, /AbortSignal\.timeout\(10_000\)/);
  assert.match(source, /signableHeaders:\s*new Set\(\["content-type"\]\)/);
});
