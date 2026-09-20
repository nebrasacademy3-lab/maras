import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";
import { apiRequestUrl, getApiToken } from "@/src/lib/api";
import { boundedDownloadBytes, fetchStudyPdf, PdfDownloadError } from "@/src/lib/study-pdf-download";
import type { ProtectedDownloadResult } from "@/src/lib/downloads";

/** Small, validated PDF export only. Large media keeps its streaming downloader. */
export async function downloadStudyPdf(options: { id: number; userId: number; signal: AbortSignal; onPending?: () => void }): Promise<ProtectedDownloadResult> {
  const token = getApiToken();
  const checkLocal = () => {
    options.signal.throwIfAborted();
    if (!token || token !== getApiToken()) throw new PdfDownloadError("PDF_SESSION_CHANGED", "تغيّر الحساب. أعد فتح النتيجة من الحساب الصحيح.");
  };
  const request = async (path: string, init: RequestInit) => {
    checkLocal(); const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`); headers.set("x-meras-client", "mobile-v1"); headers.set("x-meras-platform", Platform.OS);
    return expoFetch(apiRequestUrl(path).toString(), { ...init, credentials: "omit", headers });
  };
  const assertIdentity = async (signal: AbortSignal) => {
    checkLocal();
    const response = await request("/api/profile", { method: "GET", redirect: "error", cache: "no-store", signal });
    if (response.status !== 200) { await response.body?.cancel(); throw new PdfDownloadError("PDF_SESSION_CHANGED", "انتهت الجلسة. سجّل الدخول مجددًا."); }
    const payload = JSON.parse(new TextDecoder().decode(await boundedDownloadBytes(response, 64 * 1024, signal))) as { user?: { id?: unknown } };
    checkLocal(); if (payload.user?.id !== options.userId) throw new PdfDownloadError("PDF_SESSION_CHANGED");
  };
  const bytes = await fetchStudyPdf(options.id, { request, assertIdentity, signal: options.signal, onPending: options.onPending });
  checkLocal(); const name = `مراس-العلم-${options.id}.pdf`;
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" }));
    const link = document.createElement("a"); link.href = url; link.download = name; link.rel = "noopener";
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { action: "saved", uri: null };
  }
  // Dynamic native imports keep older installed clients from crashing at startup.
  const fs = await import("expo-file-system"); const crypto = await import("expo-crypto"); checkLocal();
  const directory = new fs.Directory(fs.Paths.cache, "meras-study-pdf");
  directory.create({ idempotent: true, intermediates: true });
  const file = new fs.File(directory, `${options.userId}-${crypto.randomUUID()}.pdf`);
  let destination: string | null = null;
  try {
    checkLocal(); file.create({ overwrite: false }); file.write(bytes);
    if (file.size !== bytes.length) throw new PdfDownloadError("PDF_DOWNLOAD_INCOMPLETE");
    if (Platform.OS === "android") {
      const legacy = await import("expo-file-system/legacy"); checkLocal();
      const permission = await legacy.StorageAccessFramework.requestDirectoryPermissionsAsync(); checkLocal();
      if (!permission.granted) return { action: "cancelled", uri: null };
      const verify = new AbortController(); const abort = () => verify.abort(); options.signal.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(abort, 15_000);
      try { await assertIdentity(verify.signal); } finally { clearTimeout(timer); options.signal.removeEventListener("abort", abort); }
      checkLocal(); destination = await legacy.StorageAccessFramework.createFileAsync(permission.directoryUri, name, "application/pdf"); checkLocal();
      await legacy.copyAsync({ from: file.uri, to: destination }); checkLocal();
      return { action: "saved", uri: destination };
    }
    const sharing = await import("expo-sharing"); checkLocal();
    if (!await sharing.isAvailableAsync()) throw new PdfDownloadError("PDF_SHARING_UNAVAILABLE", "المشاركة غير متاحة على هذا الجهاز. افتح النتيجة من الويب لتنزيلها.");
    checkLocal(); await sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: name });
    return { action: "shared", uri: null };
  } catch (error) {
    if (destination) { const legacy = await import("expo-file-system/legacy"); await legacy.deleteAsync(destination, { idempotent: true }).catch(() => undefined); }
    throw error;
  } finally { try { if (file.exists) file.delete(); } catch { /* OS cache cleanup remains available after a device failure. */ } }
}
