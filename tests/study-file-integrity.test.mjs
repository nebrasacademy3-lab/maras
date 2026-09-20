import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { pureSource } from "./helpers/pure-source.mjs";
class AiPlatformError extends Error { constructor(code, message, status) { super(message); this.code = code; this.status = status; } }
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
async function fixture(content = "Scanned study source.", options = {}) {
  const bytes = Buffer.from(content); const requests = [];
  const sourceModule = await pureSource("lib/ai-files.ts", { createHash, DOCX_MIME: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", PPTX_MIME: "application/vnd.openxmlformats-officedocument.presentationml.presentation", AiPlatformError,
    getObject: async (...args) => { requests.push(args); return options.object ?? { size: bytes.length, body: new Response(bytes).body }; } });
  const file = { objectKey: "private/qa/study.txt", storageProvider: "s3", sizeBytes: bytes.length, contentType: "text/plain", scanSha256: hash(bytes) };
  return { ...sourceModule, requests, file, bytes };
}
test("study reads the pinned provider and verifies the exact scanned bytes", async () => {
  const f = await fixture(); assert.deepEqual(await f.readAiFileBytes(f.file, 4096), f.bytes);
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0][2], "s3"); assert.ok(f.requests[0][3] instanceof AbortSignal);
});
test("same-length storage replacement is rejected against the scanner fingerprint", async () => {
  const f = await fixture("altered source value");
  await assert.rejects(f.readAiFileBytes({ ...f.file, scanSha256: hash(Buffer.from("original exact value")) }, 4096), { code: "AI_FILE_INTEGRITY", status: 422 });
});
test("unknown providers and malformed integrity metadata cannot cause a storage call", async () => {
  const f = await fixture();
  for (const storageProvider of ["course-resource", "missing", "", "LOCAL"]) await assert.rejects(f.readAiFileBytes({ ...f.file, storageProvider }, 4096), { code: "AI_STORAGE_UNVERIFIED" });
  for (const scanSha256 of ["bad", "A".repeat(64), "0".repeat(63), " "]) await assert.rejects(f.readAiFileBytes({ ...f.file, scanSha256 }, 4096), { code: "AI_FILE_INTEGRITY" });
  assert.equal(f.requests.length, 0);
});
test("non-integral, unsafe, zero and over-limit sizes fail before reading bytes", async () => {
  const f = await fixture();
  for (const sizeBytes of [-1, 0, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, 4097]) await assert.rejects(f.readAiFileBytes({ ...f.file, sizeBytes }, 4096), { code: "AI_FILE_TOO_LARGE" });
  for (const max of [NaN, Infinity, 0, 1.5]) await assert.rejects(f.readAiFileBytes(f.file, max), { code: "AI_FILE_TOO_LARGE" });
  assert.equal(f.requests.length, 0);
});
test("legacy files without a recorded fingerprint keep bounded, exact-size and signature checks", async () => {
  const f = await fixture(); assert.deepEqual(await f.readAiFileBytes({ ...f.file, scanSha256: null, storageProvider: "local" }, 4096), f.bytes);
  await assert.rejects(f.readAiFileBytes({ ...f.file, sizeBytes: f.bytes.length + 1 }, 4096), { code: "AI_FILE_INCOMPLETE" });
  await assert.rejects(f.readAiFileBytes({ ...f.file, contentType: "application/pdf" }, 4096), { code: "AI_FILE_INVALID" });
});
test("a stream exceeding the accepted bound is cancelled rather than accumulated", async () => {
  let cancelled = 0;
  const f = await fixture("short", { object: { size: 5, body: new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(40)); }, cancel() { cancelled++; } }) } });
  await assert.rejects(f.readAiFileBytes(f.file, 32), { code: "AI_FILE_TOO_LARGE" }); assert.equal(cancelled, 1);
});
