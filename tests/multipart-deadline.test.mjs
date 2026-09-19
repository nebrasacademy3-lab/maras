import assert from "node:assert/strict";
import test from "node:test";
import Busboy from "busboy";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pureSource } from "./helpers/pure-source.mjs";

const { boundedRequestBody } = await pureSource("lib/request-body.ts");
async function fixture() {
  const objects = new Map();
  const signals = [];
  const module = await pureSource("lib/multipart-upload.ts", {
    Busboy, Readable, Transform, pipeline, boundedRequestBody,
    deleteObject: async key => { objects.delete(key); },
    putObject: async (key, body, _type, _provider, options) => {
      assert.ok(options.signal instanceof AbortSignal);
      assert.ok(Number.isSafeInteger(options.maxBytes) && options.maxBytes > 0);
      signals.push(options.signal);
      const parts = [];
      await pipeline(Readable.fromWeb(body), new Writable({ write(chunk, _encoding, callback) {
        parts.push(Buffer.from(chunk)); callback();
      } }), { signal: options.signal });
      objects.set(key, Buffer.concat(parts));
    },
  });
  return { ...module, objects, signals };
}
const defaults = { maxFiles: 2, maxFileBytes: 128, maxTotalBytes: 256,
  objectPrefix: "synthetic-upload", allowedTypes: new Set(["text/plain"]), validSignature: () => true };
function completedRequest(contents) {
  const form = new FormData();
  form.append("files", new Blob([contents], { type: "text/plain" }), "file.txt");
  return new Request("https://maras-qa.example/upload", { method: "POST", body: form });
}
function stalledRequest(signal) {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('--upload\r\nContent-Disposition: form-data; name="files"; filename="partial.txt"\r\nContent-Type: text/plain\r\n\r\npartial')); },
    cancel() { cancelled = true; },
  });
  return { request: new Request("https://maras-qa.example/upload", { method: "POST", body, duplex: "half", signal,
    headers: { "content-type": "multipart/form-data; boundary=upload" } }), cancelled: () => cancelled };
}
async function bounded(work) {
  let timer;
  try { return await Promise.race([work, new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("multipart operation failed to settle")), 3000);
  })]); } finally { clearTimeout(timer); }
}

test("valid multipart uploads pass a bounded byte budget and cancellation signal to storage", async () => {
  const h = await fixture();
  const saved = await bounded(h.parseStoredMultipart(completedRequest("valid"), { ...defaults, timeoutMs: 1000 }));
  assert.equal(saved.files.length, 1);
  assert.equal(saved.files[0].sizeBytes, 5);
  assert.equal(h.objects.size, 1);
  await h.deleteStoredMultipartFiles(saved.files);
  assert.equal(h.objects.size, 0);
});

test("a stalled multipart request is aborted by its own deadline and keeps no completed objects", async () => {
  const h = await fixture();
  const request = stalledRequest();
  await assert.rejects(bounded(h.parseStoredMultipart(request.request, { ...defaults, timeoutMs: 50 })), { name: "AbortError" });
  assert.equal(request.cancelled(), true);
  assert.equal(h.objects.size, 0);
  assert.ok(h.signals.length > 0 && h.signals.every(signal => signal.aborted));
});

test("caller cancellation reaches multipart parsing and pending storage writes", async () => {
  const h = await fixture();
  const controller = new AbortController();
  const request = stalledRequest(controller.signal);
  const work = h.parseStoredMultipart(request.request, { ...defaults, timeoutMs: 1000 });
  const timer = setTimeout(() => controller.abort(), 30);
  try { await assert.rejects(bounded(work), { name: "AbortError" }); }
  finally { clearTimeout(timer); }
  assert.equal(request.cancelled(), true);
  assert.equal(h.objects.size, 0);
  assert.ok(h.signals.every(signal => signal.aborted));
});

test("aggregate excess aborts before an oversized file becomes a completed object", async () => {
  const h = await fixture();
  await assert.rejects(bounded(h.parseStoredMultipart(completedRequest("123456789"), { ...defaults, maxTotalBytes: 8, timeoutMs: 1000 })));
  assert.equal(h.objects.size, 0);
});
