import { Platform } from "react-native";
import { apiRequestUrl, ApiError, assertApiSession, authenticatedRequestHeaders, getApiSessionRevision, onApiSessionChange } from "@/src/lib/api";
import { requestNativeAdminMfa } from "@/src/lib/interaction-events";

export type ProtectedDownloadResult = {
  action: "opened" | "saved" | "shared" | "stored" | "cancelled";
  uri: string | null;
};
type ProtectedDownloadOptions = {
  path: string;
  fileName: string;
  mimeType?: string;
  saveToFiles?: boolean;
  openAfterDownload?: boolean;
  signal?: AbortSignal;
};
export const PROTECTED_DOWNLOAD_LIMIT = 128 * 1024 * 1024;
function safeFileName(value: string) {
  const clean = value.normalize("NFC").replace(/[<>:"/\\|?*\u0000-\u001F\u007f\u202a-\u202e\u2066-\u2069]+/g, "-").replace(/[. ]+$/g, "").trim();
  const candidate = clean || `meras-${Date.now()}`;
  const extension = candidate.match(/\.[\p{L}\p{N}]{1,16}$/u)?.[0] || "";
  const stem = extension ? candidate.slice(0, -extension.length) : candidate;
  return `${Array.from(stem).slice(0, Math.max(1, 120 - Array.from(extension).length)).join("")}${extension}`;
}

/** Constant-memory native transport. Never save an error page as a contract. */
export async function readProtectedDownload(response: Response, mimeType: string, write: (bytes: Uint8Array) => void, check: () => void) {
  const actual = (response.headers.get("content-type") || "").split(";", 1)[0]?.trim().toLowerCase() || "";
  const expected = mimeType.split(";", 1)[0]?.trim().toLowerCase() || "application/octet-stream";
  if (!actual || actual === "application/json" || actual === "text/html" && expected !== "text/html" || expected !== "application/octet-stream" && actual !== expected) {
    await response.body?.cancel(); throw new ApiError("نوع الملف المستلم غير صحيح. أعد المحاولة.", 502, { code: "DOWNLOAD_TYPE_INVALID" });
  }
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > PROTECTED_DOWNLOAD_LIMIT)) {
    await response.body?.cancel(); throw new ApiError("حجم الملف يتجاوز حد التنزيل.", 413);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ApiError("محتوى الملف غير متاح.", 502);
  let size = 0, prefix = new Uint8Array(0), tail = new Uint8Array(0);
  try {
    while (true) {
      check(); const { value, done } = await reader.read(); check();
      if (done) break;
      size += value.byteLength;
      if (size > PROTECTED_DOWNLOAD_LIMIT) throw new ApiError("حجم الملف يتجاوز حد التنزيل.", 413);
      if (prefix.length < 8) { const next = new Uint8Array(Math.min(8, prefix.length + value.length)); next.set(prefix); next.set(value.subarray(0, 8 - prefix.length), prefix.length); prefix = next; }
      const nextTail = new Uint8Array(Math.min(1024, tail.length + value.length));
      const combined = tail.length + value.length;
      if (value.length >= nextTail.length) nextTail.set(value.subarray(-nextTail.length));
      else { nextTail.set(tail.subarray(Math.max(0, combined - nextTail.length))); nextTail.set(value, nextTail.length - value.length); }
      tail = nextTail;
      write(value);
    }
    if (!size || length !== null && !response.headers.get("content-encoding") && size !== Number(length)) throw new ApiError("لم يكتمل تنزيل الملف. أعد المحاولة.", 502);
    if (actual === "application/pdf" && (size < 100 || !/^%PDF-[12]\.\d/.test(new TextDecoder().decode(prefix)) || !/%%EOF\s*$/.test(new TextDecoder().decode(tail)))) throw new ApiError("تعذر التحقق من سلامة ملف PDF.", 502, { code: "DOWNLOAD_PDF_INVALID" });
    return size;
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
async function errorPayload(response: Response): Promise<{ error?: string; code?: string }> {
  const reader = response.body?.getReader();
  if (!reader) return {};
  try {
    let text = "", size = 0;
    const decoder = new TextDecoder();
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 8192) return {}; text += decoder.decode(value, { stream: true }); }
    const value = JSON.parse(text + decoder.decode());
    return { error: typeof value?.error === "string" ? value.error.slice(0, 400) : undefined, code: typeof value?.code === "string" ? value.code : undefined };
  } catch { return {}; }
  finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

export async function downloadProtectedFile({ path, fileName, mimeType = "application/octet-stream", saveToFiles = false, openAfterDownload = true, signal: externalSignal }: ProtectedDownloadOptions): Promise<ProtectedDownloadResult> {
  const url = apiRequestUrl(path); // Validate before loading native modules or touching credentials.
  const revision = getApiSessionRevision(), name = safeFileName(fileName);
  const controller = new AbortController(), abort = () => controller.abort();
  const check = () => { assertApiSession(revision); if (controller.signal.aborted) throw new ApiError("تم إلغاء التنزيل أو انتهت مهلته.", 499); };
  const stopSessionWatch = onApiSessionChange(abort);
  externalSignal?.addEventListener("abort", abort, { once: true });
  if (externalSignal?.aborted) abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let file: import("expo-file-system").File | undefined;
  let destination: string | null = null;
  let retained = false;
  try {
    check();
    const request = Platform.OS === "web" ? fetch : (await import("expo/fetch")).fetch;
    let response: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      check(); timer = setTimeout(abort, 120_000);
      response = await request(url.toString(), { method: "GET", redirect: "error", cache: "no-store", credentials: Platform.OS === "web" ? "include" : "omit", headers: authenticatedRequestHeaders(path, { accept: mimeType }), signal: controller.signal });
      check();
      if (response.redirected || response.url && new URL(response.url).origin !== url.origin) { await response.body?.cancel(); throw new ApiError("رفض تحويل تنزيل الملف إلى موقع آخر.", 502); }
      if (response.status === 200) break;
      const payload = await errorPayload(response); check();
      clearTimeout(timer);
      const needsProof = response.status === 428 && ["MFA_STEP_UP_REQUIRED", "MFA_SETUP_REQUIRED"].includes(payload.code || "");
      if (attempt === 0 && url.pathname.startsWith("/api/admin/") && needsProof && await requestNativeAdminMfa(payload.code === "MFA_SETUP_REQUIRED")) { check(); continue; }
      throw new ApiError(payload.error || `تعذر تنزيل الملف (HTTP ${response.status}).`, response.status, { code: payload.code });
    }
    if (!response || response.status !== 200) throw new ApiError("تعذر تجهيز الملف.", 502);
    if (Platform.OS === "web") {
      const chunks: Uint8Array[] = [];
      await readProtectedDownload(response, mimeType, bytes => chunks.push(bytes.slice()), check);
      clearTimeout(timer); check();
      const objectUrl = URL.createObjectURL(new Blob(chunks.map(bytes => bytes.buffer as ArrayBuffer), { type: mimeType }));
      const link = document.createElement("a"); link.href = objectUrl; link.download = name; link.rel = "noopener";
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      return { action: "saved", uri: null };
    }
    const fs = await import("expo-file-system"), crypto = await import("expo-crypto"); check();
    const directory = new fs.Directory(fs.Paths.cache, "meras-private-downloads"); directory.create({ idempotent: true, intermediates: true });
    file = new fs.File(directory, `${crypto.randomUUID()}-${name}`); file.create({ overwrite: false });
    const handle = file.open();
    let size: number;
    try { size = await readProtectedDownload(response, mimeType, bytes => handle.writeBytes(bytes), check); }
    finally { handle.close(); }
    clearTimeout(timer); check();
    if (file.size !== size) throw new ApiError("لم يكتمل حفظ الملف.", 502);
    if (Platform.OS === "android" && saveToFiles) {
      const legacy = await import("expo-file-system/legacy"); check();
      const permission = await legacy.StorageAccessFramework.requestDirectoryPermissionsAsync(); check();
      if (!permission.granted) return { action: "cancelled", uri: null };
      destination = await legacy.StorageAccessFramework.createFileAsync(permission.directoryUri, name, mimeType); check();
      await legacy.copyAsync({ from: file.uri, to: destination }); check();
      return { action: "saved", uri: destination };
    }
    if (saveToFiles || openAfterDownload) {
      const sharing = await import("expo-sharing"); check();
      if (!await sharing.isAvailableAsync()) throw new ApiError("المشاركة غير متاحة على هذا الجهاز.", 503);
      check(); await sharing.shareAsync(file.uri, { mimeType, dialogTitle: name, ...(mimeType === "application/pdf" ? { UTI: "com.adobe.pdf" } : {}) });
      return { action: "shared", uri: null };
    }
    retained = true; return { action: "stored", uri: file.uri };
  } catch (error) {
    if (destination) { const legacy = await import("expo-file-system/legacy"); await legacy.deleteAsync(destination, { idempotent: true }).catch(() => undefined); }
    check();
    if (error instanceof ApiError) throw error;
    throw new ApiError("تعذر تنزيل الملف أو حفظه. تحقق من الشبكة ومساحة التخزين وأعد المحاولة.", 0);
  } finally {
    clearTimeout(timer); stopSessionWatch(); externalSignal?.removeEventListener("abort", abort);
    if (!retained) { try { if (file?.exists) file.delete(); } catch { /* Best effort after OS storage failures. */ } }
  }
}
