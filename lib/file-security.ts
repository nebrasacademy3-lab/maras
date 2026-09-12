import { createHash, timingSafeEqual } from "node:crypto";
import { getObject } from "@/lib/storage";

export type FileScanResult = {
  status: "clean" | "quarantined" | "pending";
  provider: string;
  scannedAt: string | null;
  error: string | null;
  reason: string | null;
  sha256: string | null;
};

const MAX_SCAN_BYTES = 100 * 1024 * 1024;
const SCAN_TIMEOUT_MS = 45_000;

function pending(error: string): FileScanResult {
  return { status: "pending", provider: "clamav-http", scannedAt: null, error, reason: null, sha256: null };
}

export function scannerConfigurationError(): string | null {
  const token = process.env.MALWARE_SCAN_TOKEN?.trim() || "";
  const raw = process.env.MALWARE_SCAN_URL?.trim() || "";
  if (!raw && !token) return "scanner_not_configured";
  if (!raw) return "scanner_endpoint_missing";
  if (token.length < 32 || /replace.?with|change.?me|example.?secret/i.test(token)) return "scanner_token_invalid";
  try {
    const endpoint = new URL(raw);
    const host = endpoint.hostname.toLowerCase();
    if ((process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_ENVIRONMENT_ID) && host === "scanner") return "scanner_docker_address_on_railway";
    const privateHost = host === "localhost" || host === "[::1]" || host === "127.0.0.1" || host.endsWith(".railway.internal") || /^[a-z][a-z0-9-]*$/.test(host) || /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host);
    if ((endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && privateHost)) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return "scanner_endpoint_invalid";
    if (!endpoint.pathname.endsWith("/scan")) return "scanner_endpoint_path";
    return null;
  } catch { return "scanner_endpoint_invalid"; }
}

export function scannerConfigured() { return scannerConfigurationError() === null; }

function connectionError(error: unknown, aborted: boolean) {
  if (aborted) return "scanner_timeout";
  const value = error as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = value?.cause?.code || value?.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "scanner_dns_failed";
  if (code === "ECONNREFUSED") return "scanner_connection_refused";
  if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT") return "scanner_timeout";
  if (code === "CERT_HAS_EXPIRED" || code === "DEPTH_ZERO_SELF_SIGNED_CERT" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || code === "ERR_TLS_CERT_ALTNAME_INVALID") return "scanner_tls_error";
  return "scanner_unavailable";
}

export async function readScanBytes(body: ReadableStream<Uint8Array> | null, limit: number, signal?: AbortSignal) {
  if (!body) throw new Error("empty_body");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const next = await reader.read();
      signal?.throwIfAborted();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > limit) { await reader.cancel(); throw new Error("body_too_large"); }
      chunks.push(next.value);
    }
    return Buffer.concat(chunks, length);
  } finally {
    signal?.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

/** Only a complete, consistent verdict bound to the exact bytes can release a file. */
export function validateScanVerdict(payload: unknown, digest: string): FileScanResult {
  if (!/^[a-f0-9]{64}$/.test(digest) || !payload || typeof payload !== "object" || Array.isArray(payload)) return pending("scanner_invalid_response");
  const value = payload as Record<string, unknown>;
  if (value.protocol !== "meras-scan-v1" || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256)) return pending("scanner_invalid_response");
  if (!timingSafeEqual(Buffer.from(value.sha256), Buffer.from(digest))) return pending("scanner_digest_mismatch");
  if (value.engine !== "clamav") return pending("scanner_unknown_engine");
  const clean = value.status === "clean" && value.clean === true && value.threat === null;
  const quarantined = value.status === "quarantined" && value.clean === false && typeof value.threat === "string" && value.threat.length > 0 && value.threat.length <= 500;
  if (!clean && !quarantined) return pending("scanner_indeterminate");
  return { status: clean ? "clean" : "quarantined", provider: "clamav", scannedAt: new Date().toISOString(), error: null, reason: quarantined ? String(value.threat) : null, sha256: digest };
}

async function scanBytes(bytes: Buffer, signal: AbortSignal): Promise<FileScanResult> {
  const digest = createHash("sha256").update(bytes).digest("hex");
  try {
    const response = await fetch(process.env.MALWARE_SCAN_URL!.trim(), {
      method: "POST", redirect: "error", cache: "no-store", signal,
      headers: { "content-type": "application/octet-stream", authorization: "Bearer " + process.env.MALWARE_SCAN_TOKEN!.trim(), "x-content-sha256": digest },
      body: new Uint8Array(bytes),
    });
    if (!response.ok) {
      let code = "scanner_http_" + response.status;
      // Read only bounded, allowlisted error codes; never surface remote bodies or headers.
      if (response.status === 503 && response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
        try {
          const payload = JSON.parse((await readScanBytes(response.body, 4096, signal)).toString("utf8"));
          if (payload?.error === "scanner_busy") code = "scanner_busy";
          else if (payload?.error === "clamd_unavailable" || payload?.error === "scan_failed") code = "scanner_engine_unavailable";
        } catch { /* Retain the safe HTTP status. */ }
      } else await response.body?.cancel();
      return pending(code);
    }
    if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) { await response.body?.cancel(); return pending("scanner_invalid_response"); }
    const result = await readScanBytes(response.body, 4096, signal);
    let payload: unknown;
    try { payload = JSON.parse(result.toString("utf8")); } catch { return pending("scanner_invalid_response"); }
    return validateScanVerdict(payload, digest);
  } catch (error) { return pending(connectionError(error, signal.aborted)); }
}

/** A real authenticated scan of fixed harmless bytes; no student attachment is sent. */
export async function checkScannerConnection() {
  const configurationError = scannerConfigurationError();
  const result = configurationError ? pending(configurationError) : await scanBytes(Buffer.from("Meras scanner connection check\n", "utf8"), AbortSignal.timeout(12_000));
  return { ok: result.status === "clean", code: result.status === "clean" ? null : result.error || "scanner_probe_rejected", checkedAt: new Date().toISOString() };
}

export async function scanStoredFile(input: { objectKey: string; originalName: string; contentType: string; storageProvider?: string; sizeBytes?: number }): Promise<FileScanResult> {
  const configurationError = scannerConfigurationError();
  if (configurationError) return { ...pending(configurationError), provider: "unconfigured" };
  const signal = AbortSignal.timeout(SCAN_TIMEOUT_MS);
  let bytes: Buffer;
  try {
    const provider = input.storageProvider === "s3" ? "s3" : input.storageProvider === "local" ? "local" : undefined;
    const object = await getObject(input.objectKey, undefined, provider, signal);
    if (!object) return pending("stored_object_missing");
    if (object.size > MAX_SCAN_BYTES || (input.sizeBytes !== undefined && object.size !== input.sizeBytes)) {
      await object.body.cancel();
      return pending(object.size > MAX_SCAN_BYTES ? "file_exceeds_scan_limit" : "stored_size_mismatch");
    }
    bytes = await readScanBytes(object.body, MAX_SCAN_BYTES, signal);
    if (bytes.length !== object.size) return pending("stored_size_mismatch");
  } catch {
    return pending(signal.aborted ? "storage_read_timeout" : "storage_read_failed");
  }
  return scanBytes(bytes, signal);
}

export function scanColumns(result: FileScanResult) {
  return { scanStatus: result.status, scanProvider: result.provider, scannedAt: result.scannedAt, scanError: result.error, quarantineReason: result.reason, scanSha256: result.sha256 };
}
