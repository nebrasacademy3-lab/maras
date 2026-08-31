import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { absoluteUrl, ApiError, getApiToken } from "@/src/lib/api";

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
};

function safeFileName(value: string) {
  const clean = value
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "-")
    .replace(/[. ]+$/g, "")
    .trim();
  const candidate = clean || `meras-${Date.now()}`;
  const extension = candidate.match(/\.[\p{L}\p{N}]{1,16}$/u)?.[0] || "";
  const stem = extension ? candidate.slice(0, -extension.length) : candidate;
  const extensionLength = Array.from(extension).length;
  return `${Array.from(stem).slice(0, Math.max(1, 120 - extensionLength)).join("")}${extension}`;
}

function authHeaders(): Record<string, string> {
  const token = getApiToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function downloadInBrowser(path: string, fileName: string): Promise<ProtectedDownloadResult> {
  const response = await fetch(absoluteUrl(path), { credentials: "include", headers: authHeaders() });
  if (!response.ok) {
    let message = `تعذر تنزيل الملف من الخادم (HTTP ${response.status}).`;
    try {
      const payload = await response.json() as { error?: string };
      if (payload.error) message = payload.error;
    } catch { /* Keep the HTTP error when the response is not JSON. */ }
    throw new ApiError(message, response.status);
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  return { action: "saved", uri: objectUrl };
}

async function copyToAndroidDirectory(sourceUri: string, directoryUri: string, fileName: string, mimeType: string) {
  const destinationUri = await FileSystem.StorageAccessFramework.createFileAsync(directoryUri, fileName, mimeType);
  await FileSystem.copyAsync({ from: sourceUri, to: destinationUri });
  return destinationUri;
}

async function shareDownloadedFile(uri: string, mimeType: string, fileName: string) {
  try {
    // Keep the native module out of the administration route's startup path.
    // This also lets older installed builds download the file without crashing
    // before a binary containing expo-sharing is distributed.
    const Sharing = await import("expo-sharing");
    if (!await Sharing.isAvailableAsync()) return false;
    await Sharing.shareAsync(uri, { mimeType, dialogTitle: `Meras · ${fileName}` });
    return true;
  } catch {
    return false;
  }
}

export async function downloadProtectedFile({
  path,
  fileName,
  mimeType = "application/octet-stream",
  saveToFiles = false,
  openAfterDownload = true,
}: ProtectedDownloadOptions): Promise<ProtectedDownloadResult> {
  const safeName = safeFileName(fileName);
  if (Platform.OS === "web") return downloadInBrowser(path, safeName);
  let androidDirectoryUri: string | null = null;

  if (Platform.OS === "android" && saveToFiles) {
    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) return { action: "cancelled", uri: null };
    androidDirectoryUri = permission.directoryUri;
  }

  const baseDirectory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!baseDirectory) throw new ApiError("تعذر الوصول إلى مساحة تخزين التطبيق.", 0);
  const downloadDirectory = `${baseDirectory}meras-downloads/`;
  await FileSystem.makeDirectoryAsync(downloadDirectory, { intermediates: true }).catch(() => undefined);

  const result = await FileSystem.downloadAsync(
    absoluteUrl(path),
    `${downloadDirectory}${encodeURIComponent(safeName)}`,
    { headers: authHeaders() },
  );
  if (result.status < 200 || result.status >= 300) {
    throw new ApiError(`تعذر تنزيل الملف من الخادم (HTTP ${result.status}).`, result.status);
  }

  if (androidDirectoryUri) {
    try {
      const destinationUri = await copyToAndroidDirectory(result.uri, androidDirectoryUri, safeName, mimeType);
      return { action: "saved", uri: destinationUri };
    } catch {
      // A few Android document providers reject direct copies. Falling back
      // to the native share sheet avoids loading a potentially 100 MB ZIP in JS memory.
      if (await shareDownloadedFile(result.uri, mimeType, safeName)) {
        return { action: "shared", uri: result.uri };
      }
      throw new ApiError("تعذر الحفظ في المجلد المختار. اختر مجلدًا آخر وحاول مجددًا.", 0);
    }
  }

  if ((Platform.OS === "ios" || Platform.OS === "android") && (saveToFiles || openAfterDownload) && await shareDownloadedFile(result.uri, mimeType, safeName)) {
    return { action: "shared", uri: result.uri };
  }

  return { action: "stored", uri: result.uri };
}
