import Constants from "expo-constants";
import { Platform } from "react-native";

const defaultApiUrl = "https://marase.up.railway.app";
const configured = String(Constants.expoConfig?.extra?.apiUrl || defaultApiUrl).replace(/\/$/, "");
if (!/^https:\/\//i.test(configured)) {
  throw new Error("EXPO_PUBLIC_API_URL must be an HTTPS URL");
}
export const API_URL = configured;
export const STORE_MODE = String(Constants.expoConfig?.extra?.storeMode || "reader");

// OkHttp (Android) only accepts ASCII values in HTTP headers. Device names may
// contain Arabic/emoji and the UI label intentionally contains a middle dot, so
// encode it before placing it in a header. The backend decodes it safely.
function safeHeaderText(value: string) {
  const compact = Array.from(String(value || "").trim()).slice(0, 32).join("");
  return encodeURIComponent(compact);
}

let sessionToken = "";
let deviceIdentity: { id: string; label: string; platform: string } | null = null;
export function setApiToken(token: string | null) { sessionToken = token || ""; }
export function getApiToken() { return sessionToken; }
export function setApiDeviceIdentity(value: { id: string; label: string; platform: string } | null) { deviceIdentity = value; }

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export function absoluteUrl(path?: string | null) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export type ApiRequestInit = RequestInit & { timeoutMs?: number };

export async function api<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { timeoutMs = 15_000, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  headers.set("accept", "application/json");
  headers.set("x-meras-client", "mobile-v1");
  headers.set("x-meras-platform", Platform.OS);
  if (deviceIdentity) {
    headers.set("x-meras-device-id", deviceIdentity.id);
    headers.set("x-meras-device-label", safeHeaderText(deviceIdentity.label));
    headers.set("x-meras-platform", deviceIdentity.platform);
  }
  if (sessionToken) headers.set("authorization", `Bearer ${sessionToken}`);
  if (requestInit.body && !(requestInit.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  const controller = new AbortController();
  const safeTimeout = Math.max(1_000, Math.min(15 * 60_000, Math.floor(timeoutMs)));
  const timeout = setTimeout(() => controller.abort(), safeTimeout);
  const externalSignal = requestInit.signal;
  if (externalSignal?.aborted) controller.abort();
  else if (externalSignal) externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    const response = await fetch(absoluteUrl(path), { credentials: Platform.OS === "web" ? "include" : "omit", ...requestInit, headers, signal: controller.signal });
    const text = await response.text();
    let payload: unknown = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
    if (!response.ok) {
      const error = payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `تعذر إكمال الطلب من خدمة مراس (HTTP ${response.status}).`;
      throw new ApiError(error, response.status);
    }
    return payload as T;
  } catch (reason) {
    if (reason instanceof ApiError) throw reason;
    if (reason instanceof Error && reason.name === "AbortError") throw new ApiError("انتهت مهلة الاتصال. تحقق من الشبكة وحاول مرة أخرى.", 408);
    const detail = reason instanceof Error && reason.message ? ` (${reason.message})` : "";
    throw new ApiError(`تعذر الاتصال بخدمة مراس${detail}. حاول مرة أخرى.`, 0);
  } finally {
    clearTimeout(timeout);
  }
}

export type ApiUploadProgress = { loaded: number; total: number; percent: number; bytesPerSecond: number; remainingSeconds: number | null };
export type ApiUploadOptions = { timeoutMs?: number; signal?: AbortSignal; onProgress?: (progress: ApiUploadProgress) => void };

export function apiUpload<T>(path: string, body: FormData | Blob, options: ApiUploadOptions = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startedAt = Date.now();
    xhr.open("POST", absoluteUrl(path), true);
    xhr.withCredentials = Platform.OS === "web";
    xhr.timeout = Math.max(15_000, Math.min(options.timeoutMs || 15 * 60_000, 30 * 60_000));
    xhr.setRequestHeader("accept", "application/json");
    xhr.setRequestHeader("x-meras-client", "mobile-v1");
    xhr.setRequestHeader("x-meras-platform", Platform.OS);
    if (deviceIdentity) {
      xhr.setRequestHeader("x-meras-device-id", deviceIdentity.id);
      xhr.setRequestHeader("x-meras-device-label", safeHeaderText(deviceIdentity.label));
      xhr.setRequestHeader("x-meras-platform", deviceIdentity.platform);
    }
    if (sessionToken) xhr.setRequestHeader("authorization", `Bearer ${sessionToken}`);
    const abort = () => xhr.abort();
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener("abort", abort, { once: true });
    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : 0;
      const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.1);
      const bytesPerSecond = event.loaded / elapsedSeconds;
      options.onProgress?.({
        loaded: event.loaded,
        total,
        percent: total > 0 ? Math.min(100, Math.round(event.loaded / total * 100)) : 0,
        bytesPerSecond,
        remainingSeconds: total > event.loaded && bytesPerSecond > 0 ? Math.ceil((total - event.loaded) / bytesPerSecond) : null,
      });
    };
    const cleanup = () => options.signal?.removeEventListener("abort", abort);
    xhr.onerror = () => { cleanup(); reject(new ApiError("تعذر الاتصال بالخادم أثناء الرفع. تحقق من الشبكة وحاول مرة أخرى.", 0)); };
    xhr.ontimeout = () => { cleanup(); reject(new ApiError("استغرق الرفع وقتًا أطول من المتوقع. احتفظ بالتطبيق مفتوحًا ثم أعد المحاولة.", 408)); };
    xhr.onabort = () => { cleanup(); reject(new ApiError("تم إلغاء الرفع.", 499)); };
    xhr.onload = () => {
      cleanup();
      let payload: unknown = {};
      try { payload = xhr.responseText ? JSON.parse(xhr.responseText) : {}; } catch { payload = {}; }
      if (xhr.status < 200 || xhr.status >= 300) {
        const message = payload && typeof payload === "object" && "error" in payload ? String((payload as { error: unknown }).error) : "تعذر إكمال الرفع.";
        reject(new ApiError(message, xhr.status));
        return;
      }
      resolve(payload as T);
    };
    xhr.send(body);
  });
}

export function formatUploadProgress(progress: ApiUploadProgress) {
  const mb = (value: number) => `${(value / 1024 / 1024).toFixed(1)} م.ب`;
  const speed = progress.bytesPerSecond > 0 ? `${mb(progress.bytesPerSecond)}/ث` : "جارٍ حساب السرعة";
  const remaining = progress.remainingSeconds == null ? "" : progress.remainingSeconds < 60 ? ` · متبقٍ ${progress.remainingSeconds} ث` : ` · متبقٍ نحو ${Math.ceil(progress.remainingSeconds / 60)} د`;
  return `${progress.percent}% · ${mb(progress.loaded)}${progress.total ? ` من ${mb(progress.total)}` : ""} · ${speed}${remaining}`;
}

export function jsonBody(value: unknown) { return JSON.stringify(value); }
