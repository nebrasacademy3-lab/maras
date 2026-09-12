import test from "node:test";
import assert from "node:assert/strict";
import { createHash, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { createServer as createTcpServer } from "node:net";
import { isolated } from "./helpers/business-fixtures.mjs";
import { createScannerServer, scanClamd } from "../services/scanner/server.mjs";
const hash = value => createHash("sha256").update(value).digest("hex");
const bytes = Buffer.from("clean test attachment");
const token = "test-only-scanner-token-" + "x".repeat(32);
const cleanPayload = digest => ({ protocol: "meras-scan-v1", status: "clean", clean: true, threat: null, engine: "clamav", sha256: digest });
async function fileSecurity(overrides = {}) {
  return isolated("../lib/file-security.ts", { createHash, timingSafeEqual, process: { env: { MALWARE_SCAN_URL: "http://scanner/scan", MALWARE_SCAN_TOKEN: token } }, getObject: async () => ({ body: new Response(bytes).body, size: bytes.length }), fetch: async () => Response.json(cleanPayload(hash(bytes))), ...overrides });
}
test("files remain pending without an authenticated scanner, including development", async () => {
  const service = await fileSecurity({ process: { env: { NODE_ENV: "development" } } });
  const result = await service.scanStoredFile({ objectKey: "safe", originalName: "file.txt", contentType: "text/plain" });
  assert.equal(result.status, "pending"); assert.equal(result.error, "scanner_not_configured"); assert.equal(result.sha256, null);
});
test("only consistent complete ClamAV verdicts bound to identical bytes release a file", async () => {
  const service = await fileSecurity();
  const digest = hash(bytes);
  assert.equal(service.validateScanVerdict(cleanPayload(digest), digest).status, "clean");
  for (const invalid of [
    { ...cleanPayload(digest), sha256: hash("other content") },
    { ...cleanPayload(digest), clean: false },
    { ...cleanPayload(digest), threat: "Eicar" },
    { ...cleanPayload(digest), status: "quarantined" },
    { ...cleanPayload(digest), engine: "untrusted" },
    { status: "clean", clean: true }, null, [],
  ]) assert.equal(service.validateScanVerdict(invalid, digest).status, "pending");
  const infected = service.validateScanVerdict({ ...cleanPayload(digest), status: "quarantined", clean: false, threat: "Eicar-Test-Signature" }, digest);
  assert.equal(infected.status, "quarantined"); assert.equal(infected.sha256, digest);
});
test("scan request follows no redirects, binds digest, and rejects oversized or corrupt storage", async () => {
  let calls = 0;
  const service = await fileSecurity({ fetch: async (_url, init) => { calls++; assert.equal(init.redirect, "error"); assert.equal(init.headers["x-content-sha256"], hash(bytes)); assert.equal(init.headers.authorization, "Bearer " + token); return Response.json(cleanPayload(hash(bytes))); } });
  assert.equal((await service.scanStoredFile({ objectKey: "safe", originalName: "file.txt", contentType: "text/plain", sizeBytes: bytes.length })).status, "clean");
  assert.equal((await service.scanStoredFile({ objectKey: "safe", originalName: "file.txt", contentType: "text/plain", sizeBytes: 1 })).error, "stored_size_mismatch");
  assert.equal(calls, 1);
  await assert.rejects(service.readScanBytes(new Response(Buffer.alloc(10)).body, 9), /body_too_large/);
  const bad = await fileSecurity({ fetch: async () => Response.json({ error: "private-storage-secret" }, { status: 503 }) });
  const result = await bad.scanStoredFile({ objectKey: "safe", originalName: "file.txt", contentType: "text/plain" });
  assert.equal(result.status, "pending"); assert.equal(result.error, "scanner_http_503"); assert.doesNotMatch(JSON.stringify(result), /private-storage-secret/);
});
test("authenticated HTTP adapter verifies digest and size before invoking engine", async t => {
  let scanned = 0;
  const server = createScannerServer({ token, maxBytes: 100, scan: async content => { scanned++; return content.toString().includes("simulated-EICAR") ? { status: "quarantined", clean: false, threat: "Eicar-Test-Signature" } : { status: "clean", clean: true, threat: null }; } });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = "http://127.0.0.1:" + server.address().port + "/scan";
  const request = (body, headers = {}) => fetch(url, { method: "POST", body, headers: { authorization: "Bearer " + token, "x-content-sha256": hash(body), ...headers } });
  assert.equal((await request(bytes, { authorization: "wrong" })).status, 401);
  assert.equal((await request(bytes, { "x-content-sha256": hash("wrong") })).status, 422);
  assert.equal((await request(Buffer.alloc(101))).status, 413);
  assert.equal(scanned, 0);
  const clean = await (await request(bytes)).json();
  assert.deepEqual(clean, cleanPayload(hash(bytes)));
  const infected = await (await request("simulated-EICAR")).json();
  assert.equal(infected.status, "quarantined"); assert.equal(infected.clean, false);
});
test("ClamAV client sends framed INSTREAM bytes and rejects inconclusive daemon results", async t => {
  let reply = "stream: OK\0";
  const observed = [];
  const server = createTcpServer(socket => {
    let input = Buffer.alloc(0);
    socket.on("data", chunk => {
      input = Buffer.concat([input, chunk]);
      if (input.length < 10) return;
      assert.equal(input.subarray(0, 10).toString(), "zINSTREAM\0");
      let offset = 10;
      const chunks = [];
      while (offset + 4 <= input.length) {
        const size = input.readUInt32BE(offset); offset += 4;
        if (size === 0) { observed.push(Buffer.concat(chunks)); socket.end(reply); return; }
        if (offset + size > input.length) return;
        chunks.push(input.subarray(offset, offset + size)); offset += size;
      }
    });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening"); t.after(() => server.close());
  const options = { host: "127.0.0.1", port: server.address().port, timeoutMs: 1000 };
  assert.equal((await scanClamd(bytes, options)).status, "clean");
  assert.deepEqual(observed[0], bytes);
  reply = "stream: Eicar-Test-Signature FOUND\0";
  assert.equal((await scanClamd(bytes, options)).status, "quarantined");
  reply = "INSTREAM size limit exceeded. ERROR\0";
  await assert.rejects(scanClamd(bytes, options), /clamd_scan_failed/);
});
test("scan retry delay backs off with a bounded ceiling", async () => {
  const queue = await isolated("../lib/file-scan-queue.ts", { courseRequestFiles: {}, courseResources: {}, supportReplyFiles: {}, aiFiles: {} });
  assert.equal(queue.scanRetryDelayMs(1), 60_000);
  assert.equal(queue.scanRetryDelayMs(2), 120_000);
  assert.equal(queue.scanRetryDelayMs(100), 6 * 60 * 60_000);
});
