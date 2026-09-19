/** Shared web/native transport: no HTML/error body is ever saved as a PDF. */
export const PDF_DOWNLOAD_LIMIT = 8 * 1024 * 1024;
export class PdfDownloadError extends Error {
  constructor(public readonly code: string, message = "تعذر تنزيل PDF. النتيجة النصية محفوظة؛ أعد محاولة التصدير دون إعادة التوليد.") { super(message); this.name = "PdfDownloadError"; }
}
export async function boundedDownloadBytes(response: Response, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  const rawLength = response.headers.get("content-length");
  if (rawLength !== null && (!/^\d+$/.test(rawLength) || !Number.isSafeInteger(Number(rawLength)) || Number(rawLength) > limit)) {
    await response.body?.cancel(); throw new PdfDownloadError("PDF_DOWNLOAD_LIMIT");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new PdfDownloadError("PDF_BODY_MISSING");
  const parts: Uint8Array[] = []; let size = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted(); const { value, done } = await reader.read(); signal.throwIfAborted();
      if (done) break;
      size += value.byteLength; if (size > limit) throw new PdfDownloadError("PDF_DOWNLOAD_LIMIT");
      parts.push(value);
    }
    if (rawLength !== null && !response.headers.get("content-encoding") && size !== Number(rawLength)) throw new PdfDownloadError("PDF_DOWNLOAD_INCOMPLETE");
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.length; }
    return bytes;
  } finally { signal.removeEventListener("abort", abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export async function fetchStudyPdf(artifactId: number, options: {
  request: (path: string, init: RequestInit) => Promise<Response>;
  assertIdentity: (signal: AbortSignal) => Promise<void> | void;
  signal?: AbortSignal;
  onPending?: () => void;
}): Promise<Uint8Array> {
  if (!Number.isSafeInteger(artifactId) || artifactId < 1) throw new PdfDownloadError("PDF_ID_INVALID");
  const controller = new AbortController(), signal = controller.signal;
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const timer = setTimeout(() => controller.abort(new PdfDownloadError("PDF_DOWNLOAD_TIMEOUT")), 90_000);
  try {
    for (let attempt = 0; attempt < 30; attempt++) {
      signal.throwIfAborted(); await options.assertIdentity(signal); signal.throwIfAborted();
      const response = await options.request(`/api/ai/artifacts/${artifactId}/download?format=pdf`, { method: "GET", redirect: "error", cache: "no-store", signal, headers: { accept: "application/pdf" } });
      if (response.status === 202) {
        await response.body?.cancel(); await options.assertIdentity(signal); options.onPending?.();
        const retry = Number(response.headers.get("retry-after"));
        await pause(Number.isFinite(retry) && retry >= 1 ? Math.min(retry, 8) * 1000 : 2000, signal); continue;
      }
      if (response.status !== 200) {
        await response.body?.cancel();
        throw new PdfDownloadError(`PDF_HTTP_${response.status}`, response.status === 401 ? "انتهت الجلسة. سجّل الدخول مجددًا." : response.status === 403 || response.status === 404 ? "لم يعد المصدر أو الناتج متاحًا لهذا الحساب." : undefined);
      }
      if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/pdf") {
        await response.body?.cancel(); throw new PdfDownloadError("PDF_CONTENT_TYPE_INVALID");
      }
      const bytes = await boundedDownloadBytes(response, PDF_DOWNLOAD_LIMIT, signal);
      if (bytes.length < 100 || !/^%PDF-[12]\.\d/.test(new TextDecoder().decode(bytes.subarray(0, 8))) || !/%%EOF\s*$/.test(new TextDecoder().decode(bytes.subarray(-1024)))) throw new PdfDownloadError("PDF_SIGNATURE_INVALID");
      await options.assertIdentity(signal); signal.throwIfAborted(); return bytes;
    }
    throw new PdfDownloadError("PDF_DOWNLOAD_TIMEOUT");
  } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
}
