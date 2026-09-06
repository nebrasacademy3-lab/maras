import { createServer } from "node:http";
import { connect } from "node:net";
import { createHash, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";

export function authenticate(value, token) {
  if (!token || token.length < 32 || typeof value !== "string") return false;
  return timingSafeEqual(createHash("sha256").update(value).digest(), createHash("sha256").update(`Bearer ${token}`).digest());
}
export function parseClamdReply(reply) {
  const value = reply.replace(/\0$/, "").trim();
  if (/^stream: .+ FOUND$/.test(value)) return { clean: false, status: "infected", engine: "clamav", threat: value.slice(8, -6).slice(0, 400) };
  if (value === "stream: OK") return { clean: true, status: "clean", engine: "clamav" };
  throw new Error("scanner_indeterminate");
}
export async function scanInput(input, { host = "clamav", port = 3310, maxBytes = 100 * 1024 * 1024, timeout = 18_000 } = {}) {
  const socket = connect({ host, port });
  let timer; let failed = false;
  const result = new Promise((resolve, reject) => {
    const fail = () => { if (failed) return; failed = true; reject(new Error("scanner_unavailable")); socket.destroy(); };
    let reply = "";
    timer = setTimeout(fail, timeout);
    socket.on("error", fail);
    input.once("aborted", fail);
    socket.on("data", data => {
      reply += data.toString("utf8");
      if (reply.length > 8192) return fail();
      if (reply.includes("\0")) { try { resolve(parseClamdReply(reply)); } catch { fail(); } socket.end(); }
    });
    socket.on("end", () => { if (!reply.includes("\0")) fail(); });
    socket.once("connect", async () => {
      try {
        const write = chunk => new Promise((done, bad) => socket.write(chunk, error => error ? bad(error) : done()));
        await write(Buffer.from("zINSTREAM\0"));
        let size = 0;
        for await (const chunk of input) {
          size += chunk.length;
          if (size > maxBytes) throw new Error("scan_size_limit");
          const header = Buffer.alloc(4); header.writeUInt32BE(chunk.length);
          await write(header); await write(chunk);
        }
        await write(Buffer.alloc(4));
      } catch { fail(); }
    });
  });
  try { return await result; } finally { clearTimeout(timer); socket.destroy(); }
}
export function scannerServer(env = process.env) {
  const token = env.MALWARE_SCAN_TOKEN?.trim();
  if (!token || token.length < 32) throw new Error("MALWARE_SCAN_TOKEN must contain at least 32 random characters");
  let active = 0;
  const server = createServer(async (request, response) => {
    const send = (status, value) => { response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" }); response.end(JSON.stringify(value)); };
    if (request.url === "/health" && request.method === "GET") return send(200, { ok: true, scannerVerified: false });
    if (request.url !== "/scan" || request.method !== "POST") return send(404, { error: "not_found" });
    if (!authenticate(request.headers.authorization, token)) return send(401, { error: "unauthorized" });
    if (active >= 2) return send(429, { error: "scanner_busy" });
    if (Number(request.headers["content-length"]) > 100 * 1024 * 1024) return send(413, { error: "file_too_large" });
    active += 1;
    try { send(200, await scanInput(request, { host: env.CLAMD_HOST || "clamav", port: Number(env.CLAMD_PORT || 3310) })); }
    catch { if (!response.headersSent) send(503, { error: "scanner_unavailable" }); }
    finally { active -= 1; }
  });
  server.requestTimeout = 25_000; server.headersTimeout = 10_000; server.keepAliveTimeout = 5_000;
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) scannerServer().listen(Number(process.env.PORT || 8080), "0.0.0.0");
