import { nativeToast, requestNativeAdminMfa, requestNativeAiConsent } from "@/src/lib/interaction-events";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { resolveStoreMode, subscriptionAccessMessage } from "@/src/lib/store-commerce";

const defaultApiUrl = "https://marasalelm.com";
const configured = String(Constants.expoConfig?.extra?.apiUrl || defaultApiUrl).replace(/\/$/, "");
if (!/^https:\/\//i.test(configured)) {
  throw new Error("EXPO_PUBLIC_API_URL must be an HTTPS URL");
}
const apiOrigin = new URL(configured);
if (apiOrigin.username || apiOrigin.password || apiOrigin.search || apiOrigin.hash || !["", "/"].includes(apiOrigin.pathname)) {
  throw new Error("EXPO_PUBLIC_API_URL must be a clean HTTPS origin");
}
export const API_URL = apiOrigin.origin;
export const STORE_MODE = resolveStoreMode({
  platform: Platform.OS,
  executionEnvironment: Constants.executionEnvironment,
  development: typeof __DEV__ !== "undefined" && __DEV__,
  configuredMode: Constants.expoConfig?.extra?.storeMode,
  distribution: Constants.expoConfig?.extra?.storeDistribution,
  readerPreview: Constants.expoConfig?.extra?.readerPreview === true,
});
export const DIRECT_COMMERCE_ENABLED = STORE_MODE === "direct";
export const STORE_COMMERCE_ENABLED = DIRECT_COMMERCE_ENABLED;
export const SUBSCRIPTION_ACCESS_MESSAGE = subscriptionAccessMessage(Platform.OS, new URL(API_URL).hostname);

// OkHttp (Android) only accepts ASCII values in HTTP headers. Device names may
// contain Arabic/emoji and the UI label intentionally contains a middle dot, so
// encode it before placing it in a header. The backend decodes it safely.
function safeHeaderText(value: string) {
  const compact = Array.from(String(value || "").trim()).slice(0, 32).join("");
  return encodeURIComponent(compact);
}

let sessionToken = "";
let adminStepUpToken = "";
let sessionRevision = 0;
let aiConsentRevision = -1;
let aiConsent: { revision: number; promise: Promise<boolean> } | null = null;
function needsAiConsent(path: string, method: string) {
  return Platform.OS !== "web" && ["POST", "PUT", "PATCH"].includes(method.toUpperCase()) && (path.startsWith("/api/ai/") || path === "/api/assistant");
}
async function requireAiConsent(path: string, method: string) {
  if (!needsAiConsent(path, method)) return;
  const revision = sessionRevision;
  if (aiConsentRevision === revision) return;
  if (!aiConsent || aiConsent.revision !== revision) aiConsent = { revision, promise: requestNativeAiConsent() };
  const active = aiConsent;
  try {
    const allowed = await active.promise;
    assertApiSession(revision);
    if (!allowed) throw new ApiError("لم تُرسل بياناتك؛ أُلغيت معالجة الذكاء الاصطناعي.", 499, { code: "AI_CONSENT_REQUIRED" });
    aiConsentRevision = revision;
  } finally { if (aiConsent === active) aiConsent = null; }
}
const sessionListeners = new Set<() => void>();
export function getApiSessionRevision() { return sessionRevision; }
export function onApiSessionChange(listener: () => void) {
  sessionListeners.add(listener);
  return () => { sessionListeners.delete(listener); };
}
export function assertApiSession(revision: number) {
  if (revision !== sessionRevision) throw new ApiError("تغيّر الحساب. أعد فتح الصفحة من الحساب الصحيح.", 499, { code: "SESSION_CHANGED" });
}
let deviceIdentity: { id: string; label: string; platform: string } | null = null;
export function setApiToken(token: string | null) {
  const next = token || "";
  if (sessionToken === next) return;
  adminStepUpToken = "";
  sessionToken = next;
  sessionRevision++;
  for (const listener of sessionListeners) listener();
}
export function getApiToken() { return sessionToken; }
export function setAdminStepUpToken(token: string | null) { adminStepUpToken = token || ""; }
export function setApiDeviceIdentity(value: { id: string; label: string; platform: string } | null) { deviceIdentity = value; }

export class ApiError extends Error {
  status: number;
  code?: string;
  next?: string;
  retryAfterSeconds?: number;
  constructor(message: string, status: number, details?: { code?: string; next?: string; retryAfterSeconds?: number }) { super(message); this.status = status; this.code = details?.code; this.next = details?.next; this.retryAfterSeconds = details?.retryAfterSeconds; }
}

export const ADMIN_STEP_UP_STATUS = 428;
export const ADMIN_STEP_UP_MESSAGE = "هذا الإجراء يتطلب التحقق الإداري الإضافي (MFA). فعّل التحقق بخطوتين أو أدخل رمز التحقق من تبويب الأمان ثم أعد المحاولة.";
export function isAdminStepUpError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === ADMIN_STEP_UP_STATUS;
}

export function absoluteUrl(path?: string | null) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Never forward session, device or administrative credentials to another origin. */
export function apiRequestUrl(path: string) {
  const url = new URL(absoluteUrl(path));
  if (url.protocol !== "https:" || url.origin !== new URL(API_URL).origin || url.username || url.password) {
    throw new ApiError("عنوان الخدمة غير موثوق.", 400);
  }
  return url;
}

/** Shared by JSON, upload and binary clients; MFA proof is never omitted from private downloads. */
export function authenticatedRequestHeaders(path: string, initial?: HeadersInit) {
  const url = apiRequestUrl(path);
  const headers = new Headers(initial);
  headers.delete("authorization");
  headers.delete("x-meras-admin-stepup");
  headers.set("x-meras-client", "mobile-v1");
  headers.set("x-meras-platform", Platform.OS);
  if (deviceIdentity) {
    headers.set("x-meras-device-id", deviceIdentity.id);
    headers.set("x-meras-device-label", safeHeaderText(deviceIdentity.label));
  }
  if (sessionToken) headers.set("authorization", `Bearer ${sessionToken}`);
  if (adminStepUpToken && url.pathname.startsWith("/api/admin/")) headers.set("x-meras-admin-stepup", adminStepUpToken);
  return headers;
}
function assertCommerceAllowed(url: URL, method = "GET") {
  const path = url.pathname.replace(/\/+$/, "");
  if (!DIRECT_COMMERCE_ENABLED && (["/api/checkout", "/api/ai/subscription/checkout"].includes(path) || path === "/api/cart" && !["GET", "HEAD"].includes(method.toUpperCase()))) {
    throw new ApiError("هذه النسخة مخصصة لاستخدام الاشتراكات المفعلة في حسابك ولا تنفذ عمليات شراء.", 403, { code: "NATIVE_READER_ONLY" });
  }
}
export type ApiRequestInit = RequestInit & { timeoutMs?: number };

export async function api<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const startedToken = sessionToken;
  const startedRevision = sessionRevision;
  const pathname = apiRequestUrl(path).pathname;
  const managed = pathname.startsWith("/api/admin/") && !pathname.startsWith("/api/admin/security/");
  assertCommerceAllowed(apiRequestUrl(path), init.method);
  if (needsAiConsent(pathname, init.method || "GET")) await requireAiConsent(pathname, init.method || "GET");
  const mutation = managed && !["GET", "HEAD"].includes((init.method || "GET").toUpperCase()) && !pathname.includes("/videos");
  try { const result = await apiOnce<T>(path, init); if (mutation) nativeToast("تم تنفيذ العملية بنجاح", "success"); return result; }
  catch (error) {
    if (managed && !(typeof ReadableStream !== "undefined" && init.body instanceof ReadableStream) && error instanceof ApiError && error.status === 428 && ["MFA_STEP_UP_REQUIRED", "MFA_SETUP_REQUIRED"].includes(error.code || "")) {
      if (await requestNativeAdminMfa(error.code === "MFA_SETUP_REQUIRED") && sessionToken === startedToken && sessionRevision === startedRevision && !init.signal?.aborted) {
        const result = await apiOnce<T>(path, init);
        nativeToast("تم تنفيذ العملية بنجاح", "success");
        return result;
      }
    }
    if (mutation && error instanceof ApiError && error.status !== 428) nativeToast(error.message, "error");
    throw error;
  }
}
async function apiOnce<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const url = apiRequestUrl(path);
  assertCommerceAllowed(url, init.method);
  const revision = sessionRevision;
  // Logout must finish revoking the old server session after local state is cleared.
  const revoking = url.pathname === "/api/mobile/auth/logout";
  const { timeoutMs = 15_000, ...requestInit } = init;
  const headers = authenticatedRequestHeaders(path, requestInit.headers);
  headers.set("accept", "application/json");
  if (requestInit.body && !(requestInit.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  const controller = new AbortController();
  const safeTimeout = Math.max(1_000, Math.min(15 * 60_000, Math.floor(Number.isFinite(timeoutMs) ? timeoutMs : 15_000)));
  const timeout = setTimeout(() => controller.abort(), safeTimeout);
  const externalSignal = requestInit.signal;
  const abort = () => controller.abort();
  const stopSessionWatch = revoking ? () => {} : onApiSessionChange(abort);
  if (externalSignal?.aborted) abort();
  else externalSignal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url.toString(), { ...requestInit, credentials: Platform.OS === "web" ? "include" : "omit", redirect: "error", headers, signal: controller.signal });
    if (!revoking) assertApiSession(revision);
    if (response.redirected || response.url && new URL(response.url).origin !== url.origin) throw new ApiError("رفض تحويل الطلب إلى عنوان آخر.", 502, { code: "REDIRECT_BLOCKED" });
    const text = await response.text();
    if (!revoking) assertApiSession(revision);
    if (controller.signal.aborted) throw new ApiError("تم إلغاء الطلب.", 499);
    let payload: unknown = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { if (response.ok) throw new ApiError("استجابة الخدمة غير مكتملة. حاول مرة أخرى.", 502); }
    if (!response.ok) {
      const error = payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `تعذر إكمال الطلب من خدمة مراس (HTTP ${response.status}).`;
      const details = payload && typeof payload === "object" ? payload as { code?: unknown; next?: unknown; retryAfterSeconds?: unknown } : {};
      throw new ApiError(error, response.status, { code: typeof details.code === "string" ? details.code : undefined, next: typeof details.next === "string" ? details.next : undefined, retryAfterSeconds: typeof details.retryAfterSeconds === "number" ? details.retryAfterSeconds : undefined });
    }
    return payload as T;
  } catch (reason) {
    if (!revoking) assertApiSession(revision);
    if (externalSignal?.aborted) throw new ApiError("تم إلغاء الطلب.", 499);
    if (reason instanceof ApiError) throw reason;
    if (reason instanceof Error && reason.name === "AbortError") throw new ApiError("انتهت مهلة الاتصال. تحقق من الشبكة وحاول مرة أخرى.", 408);
    throw new ApiError("تعذر الاتصال بخدمة مراس. تحقق من الشبكة وحاول مرة أخرى.", 0);
  } finally {
    stopSessionWatch();
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abort);
  }
}

export type ApiUploadProgress = { loaded: number; total: number; percent: number; bytesPerSecond: number; remainingSeconds: number | null };
export type ApiUploadOptions = { timeoutMs?: number; signal?: AbortSignal; onProgress?: (progress: ApiUploadProgress) => void };

export async function apiUpload<T>(path: string, body: FormData | Blob, options: ApiUploadOptions = {}): Promise<T> {
  const allowedUrl = apiRequestUrl(path);
  assertCommerceAllowed(allowedUrl, "POST");
  const uploadRevision = sessionRevision;
  await requireAiConsent(allowedUrl.pathname, "POST");
  assertApiSession(uploadRevision);
  return new Promise((resolve, reject) => {
    const url = apiRequestUrl(path);
    assertCommerceAllowed(url, "POST");
    const revision = sessionRevision;
    if (options.signal?.aborted) { reject(new ApiError("تم إلغاء الرفع.", 499)); return; }
    const xhr = new XMLHttpRequest();
    const startedAt = Date.now();
    xhr.open("POST", url.toString(), true);
    xhr.withCredentials = Platform.OS === "web";
    xhr.timeout = Math.max(15_000, Math.min(options.timeoutMs || 15 * 60_000, 30 * 60_000));
    const headers = authenticatedRequestHeaders(path, { accept: "application/json" });
    headers.forEach((value, key) => xhr.setRequestHeader(key, value));
    const abort = () => xhr.abort();
    const stopSessionWatch = onApiSessionChange(abort);
    options.signal?.addEventListener("abort", abort, { once: true });
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
    const cleanup = () => { stopSessionWatch(); options.signal?.removeEventListener("abort", abort); };
    xhr.onerror = () => { cleanup(); reject(new ApiError("تعذر الاتصال بالخادم أثناء الرفع. تحقق من الشبكة وحاول مرة أخرى.", 0)); };
    xhr.ontimeout = () => { cleanup(); reject(new ApiError("استغرق الرفع وقتًا أطول من المتوقع. احتفظ بالتطبيق مفتوحًا ثم أعد المحاولة.", 408)); };
    xhr.onabort = () => { cleanup(); reject(new ApiError("تم إلغاء الرفع.", 499)); };
    xhr.onload = () => {
      cleanup();
      try { assertApiSession(revision); if (xhr.responseURL) apiRequestUrl(xhr.responseURL); }
      catch (error) { reject(error); return; }
      let payload: unknown = {};
      try { payload = xhr.responseText ? JSON.parse(xhr.responseText) : {}; } catch { reject(new ApiError("استجابة الرفع غير مكتملة.", 502)); return; }
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
