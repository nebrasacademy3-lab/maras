import test from "node:test";
import assert from "node:assert/strict";
import { pureSource } from "./helpers/pure-source.mjs";
const { fetchStudyPdf, PDF_DOWNLOAD_LIMIT } = await pureSource("lib/study-pdf-download.ts");
const pdf = new Uint8Array(200); pdf.set(new TextEncoder().encode("%PDF-1.7")); pdf.set(new TextEncoder().encode("%%EOF\n"), 194);
const response = () => new Response(pdf, { headers: { "content-type": "application/pdf", "content-length": String(pdf.length) } });
test("PDF download is exact, bounded and rechecks identity on both sides of transport", async () => {
  let identity = 0, requests = 0;
  const result = await fetchStudyPdf(12, { assertIdentity: () => { identity++; }, request: async (path, init) => { requests++; assert.equal(path, "/api/ai/artifacts/12/download?format=pdf"); assert.equal(init.redirect, "error"); assert.ok(init.signal instanceof AbortSignal); return response(); } });
  assert.deepEqual(result, pdf); assert.equal(requests, 1); assert.equal(identity, 2);
});
test("HTTP errors and HTML/JSON/signature corruption cannot become downloaded documents", async () => {
  for (const bad of [new Response("private error", { status: 403 }), new Response("<html>login</html>", { headers: { "content-type": "text/html" } }), new Response(new Uint8Array(200), { headers: { "content-type": "application/pdf" } }), new Response(pdf, { headers: { "content-type": "application/pdf", "content-length": "201" } })])
    await assert.rejects(fetchStudyPdf(1, { assertIdentity: () => {}, request: async () => bad }), e => /^PDF_/.test(e.code));
});
test("declared and streaming overflows cancel the body before it can be stored", async () => {
  for (const declared of [true, false]) {
    let cancelled = 0;
    const stream = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled++; } });
    await assert.rejects(fetchStudyPdf(1, { assertIdentity: () => {}, request: async () => new Response(stream, { headers: { "content-type": "application/pdf", ...(declared ? { "content-length": String(PDF_DOWNLOAD_LIMIT + 1) } : {}) } }) }), { code: "PDF_DOWNLOAD_LIMIT" });
    assert.equal(cancelled, 1);
  }
});
test("a switch of account after network completion prevents releasing PDF bytes", async () => {
  let checks = 0;
  await assert.rejects(fetchStudyPdf(1, { assertIdentity: () => { if (++checks === 2) throw new Error("account changed"); }, request: async () => response() }), /account changed/);
});
test("202 is a bounded rendering wait, not a successful PDF or generation retry", async () => {
  let requests = 0, pending = 0;
  const result = await fetchStudyPdf(1, { assertIdentity: () => {}, onPending: () => pending++, request: async () => ++requests === 1 ? new Response("rendering", { status: 202, headers: { "retry-after": "1" } }) : response() });
  assert.deepEqual(result, pdf); assert.equal(requests, 2); assert.equal(pending, 1);
});
test("cancellation stops a pending body and no subsequent download request is made", async () => {
  const controller = new AbortController(); let requests = 0, cancelled = 0;
  const promise = fetchStudyPdf(1, { signal: controller.signal, assertIdentity: () => {}, request: async () => { requests++; return new Response(new ReadableStream({ start() { setTimeout(() => controller.abort(new Error("cancelled")), 5); }, cancel() { cancelled++; } }), { headers: { "content-type": "application/pdf" } }); } });
  await assert.rejects(promise, /cancelled/); assert.equal(cancelled, 1); assert.equal(requests, 1);
});
test("invalid artifact identifiers fail before identity lookup or network", async () => {
  for (const id of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(fetchStudyPdf(id, { assertIdentity: () => assert.fail(), request: () => assert.fail() }), { code: "PDF_ID_INVALID" });
});

test("automatic HTTP decompression still enforces decoded byte bounds without comparing compressed length", async () => {
  const result = await fetchStudyPdf(1, { assertIdentity: () => {}, request: async () => new Response(pdf, { headers: { "content-type": "application/pdf", "content-encoding": "gzip", "content-length": "100" } }) });
  assert.deepEqual(result, pdf);
});
