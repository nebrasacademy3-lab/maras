import { activeStorageProvider, getObject, type StorageProvider } from "@/lib/storage";
import { MAX_SCAN_BYTES, SCAN_TIMEOUT_MS, pendingVerdict, scanClamd, scanRemote, scannerConfig } from "@/lib/malware-scanner";

declare global { var __merasActiveFileScans: number | undefined; }
export const MAX_CONCURRENT_FILE_SCANS = 2;

export type FileScanResult = {
  status: "clean" | "quarantined" | "pending";
  provider: string;
  scannedAt: string | null;
  error: string | null;
  reason: string | null;
};

export function fileStorageProvider(value?: string | null): StorageProvider {
  return value === "s3" || value === "local" ? value : activeStorageProvider();
}

/** Upload validation already ran; only a real queue worker may mark this clean. */
export function queuedFileScan(): FileScanResult { return { status: "pending", provider: "queued", scannedAt: null, error: null, reason: null }; }

export async function scanStoredFile(input: { objectKey: string; originalName: string; contentType: string; storageProvider?: string | null }): Promise<FileScanResult> {
  const config = scannerConfig();
  const provider = config.mode === "clamd" ? "clamav" : config.mode;
  const pending = (error: string): FileScanResult => ({ ...pendingVerdict(provider, error), scannedAt: null });
  // Signature/MIME checks are not malware scans, even in development.
  if (config.mode === "unconfigured" || config.mode === "invalid") return pending(config.mode === "invalid" ? "scanner_invalid_configuration" : "scanner_not_configured");
  if ((globalThis.__merasActiveFileScans || 0) >= MAX_CONCURRENT_FILE_SCANS) return pending("scanner_busy");
  globalThis.__merasActiveFileScans = (globalThis.__merasActiveFileScans || 0) + 1;
  const signal = AbortSignal.timeout(SCAN_TIMEOUT_MS);
  try {
    const object = await getObject(input.objectKey, undefined, fileStorageProvider(input.storageProvider), signal);
    if (!object) return pending("stored_object_missing");
    if (object.size > MAX_SCAN_BYTES) { await object.body.cancel().catch(() => undefined); return pending("scanner_size_limit"); }
    const result = config.mode === "remote" ? await scanRemote(object.body, input, config, signal) : await scanClamd(object.body, config, signal);
    return { ...result, scannedAt: result.status === "pending" ? null : new Date().toISOString() };
  } catch (error) {
    // Persist only bounded internal codes, never an endpoint, token or document content.
    const known = new Set(["scanner_size_limit", "scanner_timeout", "scanner_response_limit", "scanner_connection_failed", "stored_object_empty"]);
    return pending(signal.aborted ? "scanner_timeout" : error instanceof Error && known.has(error.message) ? error.message : "scanner_connection_failed");
  } finally { globalThis.__merasActiveFileScans = Math.max(0, (globalThis.__merasActiveFileScans || 1) - 1); }
}

export function scanColumns(result: FileScanResult) {
  return { scanStatus: result.status, scanProvider: result.provider, scannedAt: result.scannedAt, scanError: result.error, quarantineReason: result.reason };
}
