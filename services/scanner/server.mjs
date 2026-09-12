import { createServer } from "node:http";
import { connect } from "node:net";
import { createHash, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";

export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export function scanClamd(bytes, options = {}) {
  return new Promise((resolve, reject) => {
    const socket = connect(options.socketPath ? { path: options.socketPath } : { host: options.host || "127.0.0.1", port: options.port || 3310 });
    let response = "";
    let settled = false;
    const timer = setTimeout(() => finish(new Error("clamd_timeout")), options.timeoutMs || 35_000);
    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error); else resolve(result);
    }
    socket.on("error", () => finish(new Error("clamd_unavailable")));
    socket.on("end", () => { if (!settled) finish(new Error("clamd_incomplete_response")); });
    socket.on("data", chunk => {
      response += chunk.toString("utf8");
      if (Buffer.byteLength(response) > 8192) return finish(new Error("clamd_invalid_response"));
      if (!response.includes("\0")) return;
      const line = response.slice(0, response.indexOf("\0")).trim();
      if (line === "stream: OK") return finish(null, { status: "clean", clean: true, threat: null });
      const infected = /^stream: (.{1,500}) FOUND$/.exec(line);
      if (infected) return finish(null, { status: "quarantined", clean: false, threat: infected[1] });
      finish(new Error("clamd_scan_failed"));
    });
    socket.once("connect", () => {
      socket.write(Buffer.from("zINSTREAM\0"));
      let offset = 0;
      function writeNext() {
        if (settled) return;
        while (offset < bytes.length) {
          const end = Math.min(bytes.length, offset + 64 * 1024);
          const frame = Buffer.allocUnsafe(4 + end - offset);
          frame.writeUInt32BE(end - offset, 0);
          bytes.copy(frame, 4, offset, end);
          offset = end;
          if (!socket.write(frame)) { socket.once("drain", writeNext); return; }
        }
        socket.write(Buffer.alloc(4));
      }
      writeNext();
    });
  });
}

function authorized(header, token) {
  if (typeof header !== "string") return false;
  const supplied = createHash("sha256").update(header).digest();
  const expected = createHash("sha256").update("Bearer " + token).digest();
  return timingSafeEqual(supplied, expected);
}
function json(response, status, value) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(JSON.stringify(value));
}

export function createScannerServer({ token, scan = bytes => scanClamd(bytes, { socketPath: process.env.CLAMD_SOCKET, host: process.env.CLAMD_HOST, port: Number(process.env.CLAMD_PORT) || 3310 }), maxBytes = MAX_FILE_BYTES, concurrency = 2 } = {}) {
  if (typeof token !== "string" || token.length < 32 || /replace.?with|change.?me|example.?secret/i.test(token)) throw new Error("MALWARE_SCAN_TOKEN must be a strong secret of at least 32 characters");
  let active = 0;
  let readiness;
  let readinessExpiresAt = 0;
  const server = createServer(async (request, response) => {
    // Railway healthchecks cannot attach a bearer token. Only this bounded,
    // content-free probe is public; attachments still require the token.
    if (request.method === "GET" && request.url === "/ready") {
      if (!readiness || Date.now() >= readinessExpiresAt) {
        if (active >= concurrency) return json(response, 503, { ok: false });
        active += 1;
        readinessExpiresAt = Infinity;
        readiness = Promise.resolve().then(() => scan(Buffer.from("Meras scanner readiness probe")))
          .then(result => result.status === "clean" && result.clean === true && !result.threat)
          .catch(() => false)
          .finally(() => { active -= 1; readinessExpiresAt = Date.now() + 2000; });
      }
      const ok = await readiness;
      return json(response, ok ? 200 : 503, { ok });
    }
    if (!authorized(request.headers.authorization, token)) return json(response, 401, { error: "unauthorized" });
    if (request.method === "GET" && request.url === "/health") {
      if (active >= concurrency) return json(response, 503, { ok: false, error: "scanner_busy" });
      active += 1;
      try { const result = await scan(Buffer.from("Meras scanner readiness probe")); const ok = result.status === "clean" && result.clean === true && !result.threat; json(response, ok ? 200 : 503, { ok, engine: "clamav" }); }
      catch { json(response, 503, { ok: false, error: "clamd_unavailable" }); }
      finally { active -= 1; }
      return;
    }
    if (request.method !== "POST" || request.url !== "/scan") return json(response, 404, { error: "not_found" });
    if (active >= concurrency) return json(response, 503, { error: "scanner_busy" });
    const digest = request.headers["x-content-sha256"];
    if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) return json(response, 400, { error: "digest_required" });
    if (Number(request.headers["content-length"]) > maxBytes) return json(response, 413, { error: "file_too_large" });
    active += 1;
    const timer = setTimeout(() => request.destroy(), 30_000);
    try {
      const chunks = [];
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > maxBytes) { json(response, 413, { error: "file_too_large" }); request.destroy(); return; }
        chunks.push(chunk);
      }
      clearTimeout(timer);
      const bytes = Buffer.concat(chunks, length);
      const actual = createHash("sha256").update(bytes).digest("hex");
      if (!timingSafeEqual(Buffer.from(actual), Buffer.from(digest))) return json(response, 422, { error: "digest_mismatch" });
      const result = await scan(bytes);
      json(response, 200, { protocol: "meras-scan-v1", engine: "clamav", sha256: actual, ...result });
    } catch {
      if (!response.headersSent && !response.destroyed) json(response, 503, { error: "scan_failed" });
    } finally { clearTimeout(timer); active -= 1; }
  });
  server.requestTimeout = 60_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  return server;
}
export function listenScanner(server, port = Number(process.env.PORT) || 3001) {
  // Legacy Railway private networks resolve service names to IPv6 only.
  // IPv6 also accepts IPv4-mapped addresses on Railway/Linux and Windows.
  return server.listen({ port, host: "::", ipv6Only: false });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createScannerServer({ token: process.env.MALWARE_SCAN_TOKEN });
  listenScanner(server);
  process.once("SIGTERM", () => server.close(() => process.exit(0)));
}
