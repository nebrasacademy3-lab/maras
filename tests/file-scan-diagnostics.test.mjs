import test from "node:test";
import assert from "node:assert/strict";
import { createHash, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { isolated } from "./helpers/business-fixtures.mjs";
import { createScannerServer } from "../services/scanner/server.mjs";

const token = "diagnostic-test-token-" + "x".repeat(40);
const storedBytes = Buffer.from("synthetic student attachment; never send this during connection check");
const hash = value => createHash("sha256").update(value).digest("hex");
const clean = bytes => ({ protocol: "meras-scan-v1", status: "clean", clean: true, threat: null, engine: "clamav", sha256: hash(bytes) });
const file = { objectKey: "synthetic/private-file.pdf", originalName: "fixture.pdf", contentType: "application/pdf", sizeBytes: storedBytes.length };
const env = overrides => ({ MALWARE_SCAN_URL: "http://scanner:3001/scan", MALWARE_SCAN_TOKEN: token, ...overrides });

async function service(dependencies = {}) {
  return isolated("../lib/file-security.ts", {
    createHash, timingSafeEqual,
    process: { env: env() },
    getObject: async () => ({ body: new Response(storedBytes).body, size: storedBytes.length }),
    fetch: async (_url, init) => Response.json(clean(Buffer.from(init.body))),
    ...dependencies,
  });
}
async function messages() { return isolated("../lib/file-scan-messages.ts"); }
function assertPending(result, code) {
  assert.equal(result.status, "pending");
  assert.equal(result.error, code);
  assert.equal(result.sha256, null);
  assert.equal(result.scannedAt, null);
}
function syntheticConnectionError(code) {
  return new TypeError("private-host/path?token=secret-value", { cause: { code, message: "private credentials" } });
}

test("scanner configuration catches Docker service address on Railway before any network or storage work", async () => {
  let io = 0;
  const invalid = await service({
    process: { env: env({ RAILWAY_PROJECT_ID: "synthetic-railway-project" }) },
    fetch: async () => { io++; throw new Error("must not connect"); },
    getObject: async () => { io++; throw new Error("must not read storage"); },
  });
  assert.equal(invalid.scannerConfigured(), false);
  assert.equal(invalid.scannerConfigurationError(), "scanner_docker_address_on_railway");
  assertPending(await invalid.scanStoredFile(file), "scanner_docker_address_on_railway");
  const probe = await invalid.checkScannerConnection();
  assert.equal(probe.ok, false);
  assert.equal(probe.code, "scanner_docker_address_on_railway");
  assert.equal(io, 0);

  const railway = await service({ process: { env: env({
    RAILWAY_ENVIRONMENT_ID: "synthetic-environment",
    MALWARE_SCAN_URL: "http://scanner.railway.internal:3001/scan",
  }) } });
  assert.equal(railway.scannerConfigured(), true);
  assert.equal((await service()).scannerConfigured(), true);
});

test("incomplete or unsafe scanner settings explain the problem without echoing secret values", async t => {
  const cases = [
    [{ MALWARE_SCAN_URL: "", MALWARE_SCAN_TOKEN: "" }, "scanner_not_configured"],
    [{ MALWARE_SCAN_URL: "" }, "scanner_endpoint_missing"],
    [{ MALWARE_SCAN_TOKEN: "short" }, "scanner_token_invalid"],
    [{ MALWARE_SCAN_URL: "https://scanner.example.invalid/health" }, "scanner_endpoint_path"],
    [{ MALWARE_SCAN_URL: "https://private:secret-value@scanner.example.invalid/scan" }, "scanner_endpoint_invalid"],
    [{ MALWARE_SCAN_URL: "https://scanner.example.invalid/scan?token=secret-value" }, "scanner_endpoint_invalid"],
    [{ MALWARE_SCAN_URL: "http://scanner.example.invalid/scan" }, "scanner_endpoint_invalid"],
  ];
  for (const [values, code] of cases) await t.test(code + " " + Object.keys(values).join(","), async () => {
    const scanner = await service({ process: { env: env(values) } });
    const result = await scanner.checkScannerConnection();
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
    assert.doesNotMatch(JSON.stringify(result), /secret-value|private:/);
  });
});

test("DNS, refused connections, timeouts and TLS failures have distinct sanitized diagnostics", async t => {
  const cases = [
    ["ENOTFOUND", "scanner_dns_failed"],
    ["EAI_AGAIN", "scanner_dns_failed"],
    ["ECONNREFUSED", "scanner_connection_refused"],
    ["UND_ERR_CONNECT_TIMEOUT", "scanner_timeout"],
    ["CERT_HAS_EXPIRED", "scanner_tls_error"],
    ["ECONNRESET", "scanner_unavailable"],
  ];
  for (const [cause, expected] of cases) await t.test(cause, async () => {
    const scanner = await service({ fetch: async () => { throw syntheticConnectionError(cause); } });
    assertPending(await scanner.scanStoredFile(file), expected);
    const result = await scanner.checkScannerConnection();
    assert.equal(result.ok, false);
    assert.equal(result.code, expected);
    assert.doesNotMatch(JSON.stringify(result), /private-host|secret-value|credentials/);
  });
});

test("authentication, endpoint and unavailable-engine HTTP failures stay pending with safe specific codes", async t => {
  const cases = [
    [401, { error: "private-secret-body" }, "scanner_http_401"],
    [403, { error: "private-secret-body" }, "scanner_http_403"],
    [404, { error: "private-secret-body" }, "scanner_http_404"],
    [503, { error: "scan_failed", detail: "private-secret-body" }, "scanner_engine_unavailable"],
    [503, { error: "clamd_unavailable", detail: "private-secret-body" }, "scanner_engine_unavailable"],
    [503, { error: "scanner_busy", detail: "private-secret-body" }, "scanner_busy"],
    [503, { error: "private-secret-body" }, "scanner_http_503"],
  ];
  for (const [status, body, expected] of cases) await t.test(status + " " + body.error, async () => {
    const scanner = await service({ fetch: async () => Response.json(body, { status }) });
    const result = await scanner.scanStoredFile(file);
    assertPending(result, expected);
    assert.doesNotMatch(JSON.stringify(result), /private-secret-body/);
  });
});

test("connection check authenticates a harmless real HTTP scan without reading a student file", async t => {
  let storedReads = 0;
  const received = [];
  let engineFails = false;
  const server = createScannerServer({
    token,
    scan: async bytes => {
      received.push(Buffer.from(bytes));
      if (engineFails) throw new Error("synthetic engine unavailable");
      return { status: "clean", clean: true, threat: null };
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = "http://127.0.0.1:" + server.address().port;
  const scanner = await service({
    process: { env: env({ MALWARE_SCAN_URL: origin + "/scan" }) },
    fetch,
    getObject: async () => { storedReads++; throw new Error("connection test must not access attachments"); },
  });
  const result = await scanner.checkScannerConnection();
  assert.equal(result.ok, true);
  assert.equal(result.code, null);
  assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
  assert.equal(received.length, 1);
  assert.equal(received[0].toString(), "Meras scanner connection check\n");
  assert.notDeepEqual(received[0], storedBytes);
  assert.equal(storedReads, 0);

  const badToken = await service({
    process: { env: env({ MALWARE_SCAN_URL: origin + "/scan", MALWARE_SCAN_TOKEN: "incorrect-test-token-" + "y".repeat(40) }) },
    fetch,
  });
  assert.equal((await badToken.checkScannerConnection()).code, "scanner_http_401");
  assert.equal(received.length, 1, "unauthenticated probes must never reach the engine");

  const badPath = await service({ process: { env: env({ MALWARE_SCAN_URL: origin + "/wrong/scan" }) }, fetch });
  assert.equal((await badPath.checkScannerConnection()).code, "scanner_http_404");
  assert.equal(received.length, 1);

  engineFails = true;
  const unavailable = await scanner.checkScannerConnection();
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.code, "scanner_engine_unavailable");
  assert.equal(storedReads, 0);
});

test("storage failures are distinguished from scanner failures and never leak paths or credentials", async () => {
  let requests = 0;
  const scanner = await service({
    getObject: async () => { throw new Error("S3 GET failed (403): private-storage-key private-bucket/path"); },
    fetch: async () => { requests++; throw new Error("must not call scanner"); },
  });
  const result = await scanner.scanStoredFile(file);
  assertPending(result, "storage_read_failed");
  assert.equal(requests, 0);
  assert.doesNotMatch(JSON.stringify(result), /private-storage-key|private-bucket|403/);

  const missing = await service({
    getObject: async () => null,
    fetch: async () => { requests++; throw new Error("must not call scanner"); },
  });
  assertPending(await missing.scanStoredFile(file), "stored_object_missing");
  assert.equal(requests, 0);

  const timedOut = await service({
    AbortSignal: { timeout: () => AbortSignal.abort() },
    getObject: async (_key, _range, _provider, signal) => { signal.throwIfAborted(); },
  });
  assertPending(await timedOut.scanStoredFile(file), "storage_read_timeout");
});

test("wrong legacy size and mismatched scan digest remain blocked instead of being repaired or accepted", async () => {
  let requests = 0;
  const scanner = await service({
    fetch: async (_url, init) => { requests++; return Response.json(clean(Buffer.from(init.body))); },
  });
  assertPending(await scanner.scanStoredFile({ ...file, sizeBytes: storedBytes.length + 1 }), "stored_size_mismatch");
  assert.equal(requests, 0);
  const changedBody = await service({
    getObject: async () => ({ body: new Response(storedBytes.subarray(1)).body, size: storedBytes.length }),
  });
  assertPending(await changedBody.scanStoredFile(file), "stored_size_mismatch");
  const wrongDigest = await service({ fetch: async () => Response.json(clean(Buffer.from("a different file"))) });
  assertPending(await wrongDigest.scanStoredFile(file), "scanner_digest_mismatch");
});

test("UI summaries never describe pending or quarantined files as successfully available", async () => {
  const ui = await messages();
  const base = { configured: true, busy: false, scanned: 1, clean: 0, pending: 0, quarantined: 0 };
  for (const summary of [
    { ...base, pending: 1, results: [{ status: "pending", error: "scanner_http_401" }] },
    { ...base, pending: 1, clean: 1, scanned: 2, results: [{ status: "pending", error: "stored_object_missing" }] },
    { ...base, quarantined: 1 },
    { ...base, quarantined: 1, clean: 1, scanned: 2 },
  ]) {
    const result = ui.fileScanSummaryMessage(summary);
    assert.equal(result.failed, true);
    assert.doesNotMatch(result.message, /نجح فحص|أصبح التنزيل متاحًا/);
  }
  const cleanResult = ui.fileScanSummaryMessage({ ...base, clean: 1 });
  assert.equal(cleanResult.failed, false);
  assert.match(cleanResult.message, /نجح فحص/);
  const busyResult = ui.fileScanSummaryMessage({ ...base, scanned: 0, busy: true });
  assert.doesNotMatch(busyResult.message, /نجح فحص|أصبح التنزيل متاحًا/);
  const unconfigured = ui.fileScanSummaryMessage({ ...base, scanned: 0, configured: false, configurationError: "scanner_docker_address_on_railway" });
  assert.equal(unconfigured.failed, true);
  assert.match(unconfigured.message, /Railway/);
});

test("UI explains actionable credential, path and storage errors without reflecting unknown remote content", async () => {
  const ui = await messages();
  assert.match(ui.fileScanErrorMessage("scanner_http_401"), /MALWARE_SCAN_TOKEN/);
  assert.match(ui.fileScanErrorMessage("scanner_http_404"), /\/scan/);
  assert.match(ui.fileScanErrorMessage("stored_object_missing"), /التخزين|القرص/);
  assert.match(ui.fileScanErrorMessage("scanner_engine_unavailable"), /ClamAV/);
  assert.doesNotMatch(ui.fileScanErrorMessage("private-key=https://private-host/secret"), /private-key|private-host|secret/);
});
