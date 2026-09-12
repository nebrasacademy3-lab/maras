import { getObject } from "@/lib/storage";

export type FileScanResult = {
  status: "clean" | "quarantined" | "pending";
  provider: string;
  scannedAt: string | null;
  error: string | null;
  reason: string | null;
};

function safeFileName(value: string) {
  return value.replace(/[\r\n]/g, " ").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 180) || "attachment";
}

export async function scanStoredFile(input: { objectKey: string; originalName: string; contentType: string; storageProvider?: string }): Promise<FileScanResult> {
  const endpoint = process.env.MALWARE_SCAN_URL?.trim();
  const now = new Date().toISOString();
  if (!endpoint) {
    if (process.env.NODE_ENV === "production") return { status: "pending", provider: "unconfigured", scannedAt: null, error: "scanner_not_configured", reason: null };
    return { status: "clean", provider: "development-signature-check", scannedAt: now, error: null, reason: null };
  }

  try {
    const provider = input.storageProvider === "s3" ? "s3" : input.storageProvider === "local" ? "local" : undefined;
    const object = await getObject(input.objectKey, undefined, provider);
    if (!object) return { status: "pending", provider: "remote", scannedAt: null, error: "stored_object_missing", reason: null };
    const bytes = await new Response(object.body).arrayBuffer();
    const headers: Record<string, string> = {
      "content-type": input.contentType,
      "x-file-name": encodeURIComponent(safeFileName(input.originalName)),
      "x-content-sha-required": "true",
    };
    const token = process.env.MALWARE_SCAN_TOKEN?.trim();
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(endpoint, { method: "POST", headers, body: bytes, signal: AbortSignal.timeout(45_000) });
    if (!response.ok) return { status: "pending", provider: "remote", scannedAt: null, error: `scanner_http_${response.status}`, reason: null };
    const payload = await response.json() as { clean?: boolean; status?: string; threat?: string; engine?: string };
    const clean = payload.clean === true || payload.status === "clean";
    const infected = payload.clean === false || ["infected", "malicious", "quarantined"].includes(String(payload.status || "").toLowerCase());
    if (clean) return { status: "clean", provider: String(payload.engine || "remote").slice(0, 80), scannedAt: now, error: null, reason: null };
    if (infected) return { status: "quarantined", provider: String(payload.engine || "remote").slice(0, 80), scannedAt: now, error: null, reason: String(payload.threat || "malware_detected").slice(0, 500) };
    return { status: "pending", provider: String(payload.engine || "remote").slice(0, 80), scannedAt: null, error: "scanner_indeterminate", reason: null };
  } catch (error) {
    return { status: "pending", provider: "remote", scannedAt: null, error: (error instanceof Error ? error.message : "scanner_failed").slice(0, 500), reason: null };
  }
}

export function scanColumns(result: FileScanResult) {
  return { scanStatus: result.status, scanProvider: result.provider, scannedAt: result.scannedAt, scanError: result.error, quarantineReason: result.reason };
}
