import assert from "node:assert/strict";
import test from "node:test";
import { pureSource } from "./helpers/pure-source.mjs";
const token = await pureSource("lib/video-token.ts");
const secret = "synthetic-stream-tests-not-a-real-secret";
const grant = { courseSlug: "qa-course", lessonId: "qa-lesson", email: "qa@example.test", client: "web", expiresAt: Date.now() + 60000 };
test("video grant grammar rejects appended segments, whitespace, padding and oversized input", async () => {
  const signed = await token.createVideoToken(grant, secret);
  assert.deepEqual(await token.verifyVideoToken(signed, secret), grant);
  for (const value of [signed + ".suffix", signed + "=", " " + signed, signed + "\n", "A".repeat(4097), null]) assert.equal(await token.verifyVideoToken(value, secret), null);
});
test("signed malformed video claims never become usable grants; legacy client omission remains compatible", async () => {
  for (const value of [null, [], { ...grant, email: "" }, { ...grant, email: [] }, { ...grant, courseSlug: {} }, { ...grant, lessonId: 123 }, { ...grant, client: "admin" }, { ...grant, expiresAt: 1 }, { ...grant, expiresAt: 123.5 }]) assert.equal(await token.verifyVideoToken(await token.createVideoToken(value, secret), secret), null);
  const legacy = { ...grant }; delete legacy.client;
  assert.deepEqual(await token.verifyVideoToken(await token.createVideoToken(legacy, secret), secret), legacy);
});
function dependencies() {
  let cancellations = 0;
  return { cancellations: () => cancellations, values: {
    process: {env:{VIDEO_SIGNING_SECRET:"synthetic-unit-tests-only"}},
    sessionMediaKey: () => Buffer.alloc(16),
    cleanText: value => String(value || "").trim(),
    jsonError: (message, status = 400) => Response.json({ error: message }, { status }),
    authorizeVideoRequest: async () => ({ ok: true, asset: { sizeBytes: 1024, contentType: "video/mp4", objectKey: "private.mp4", storageProvider: "local", thumbnailObjectKey: "private.jpg" } }),
    getObject: async () => ({ size: 1024, etag: '"fixture"', body: new ReadableStream({ cancel() { cancellations++; } }) }),
  } };
}
test("original MP4 HEAD is denied without opening the private storage object", async () => {
  const f = dependencies(), route = await pureSource("app/api/video/[lessonId]/route.ts", f.values);
  const response = await route.HEAD(new Request("https://qa.example/api/video/lesson?course=c&token=synthetic"), { params: Promise.resolve({ lessonId: "lesson" }) });
  assert.equal(response.status, 403);
  assert.equal((await response.arrayBuffer()).byteLength, 0); assert.equal(f.cancellations(), 0);
});
test("HLS HEAD cancels the otherwise unconsumed binary response", async () => {
  const f = dependencies(), route = await pureSource("app/api/video/[lessonId]/hls/[...path]/route.ts", f.values);
  const response = await route.HEAD(new Request("https://qa.example/api/video/lesson/hls/thumbnail.jpg?course=c&token=synthetic"), { params: Promise.resolve({ lessonId: "lesson", path: ["thumbnail.jpg"] }) });
  assert.equal(response.status, 200); assert.equal((await response.arrayBuffer()).byteLength, 0); assert.equal(f.cancellations(), 1);
});
