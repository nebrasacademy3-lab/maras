/** Never let a conflicting "clean" flag override a threat verdict. */
export function scanVerdict(payload: unknown, scannedAt: string) {
  const value = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const status = typeof value.status === "string" ? value.status.toLowerCase().trim() : "";
  const provider = typeof value.engine === "string" ? value.engine.replace(/[\r\n]/g, " ").slice(0, 80) : "remote";
  const threat = typeof value.threat === "string" ? value.threat.trim().slice(0, 500) : "";
  if (value.clean === false || ["infected", "malicious", "quarantined"].includes(status) || threat) return { status: "quarantined" as const, provider, scannedAt, error: null, reason: threat || "malware_detected" };
  if ((value.clean === true || status === "clean") && (!status || status === "clean")) return { status: "clean" as const, provider, scannedAt, error: null, reason: null };
  return { status: "pending" as const, provider, scannedAt: null, error: "scanner_indeterminate", reason: null };
}

/** Bounded streaming: untrusted Content-Length is never the only size check. */
export function limitByteStream(input: ReadableStream<Uint8Array>, maxBytes: number) {
  let total = 0;
  return input.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
    total += chunk.byteLength;
    if (total > maxBytes) { controller.error(new Error("scan_size_limit")); return; }
    controller.enqueue(chunk);
  } }));
}
