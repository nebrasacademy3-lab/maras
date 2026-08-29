import Constants from "expo-constants";

const configured = String(Constants.expoConfig?.extra?.apiUrl || "").replace(/\/$/, "");
const developmentFallback = "http://localhost:3000";
if (!__DEV__ && !/^https:\/\//i.test(configured)) {
  throw new Error("EXPO_PUBLIC_API_URL must be an HTTPS URL in production builds");
}
export const API_URL = configured || developmentFallback;
export const STORE_MODE = String(Constants.expoConfig?.extra?.storeMode || "reader");

let sessionToken = "";
export function setApiToken(token: string | null) { sessionToken = token || ""; }
export function getApiToken() { return sessionToken; }

export class ApiError extends Error {
  status: number;
  code?: string;
  newAttemptRequired: boolean;
  constructor(message: string, status: number, details?: { code?: string; newAttemptRequired?: boolean }) {
    super(message);
    this.status = status;
    this.code = details?.code;
    this.newAttemptRequired = details?.newAttemptRequired === true;
  }
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
  if (sessionToken) headers.set("authorization", `Bearer ${sessionToken}`);
  if (requestInit.body && !(requestInit.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  const controller = new AbortController();
  const safeTimeout = Math.max(1_000, Math.min(15 * 60_000, Math.floor(timeoutMs)));
  const timeout = setTimeout(() => controller.abort(), safeTimeout);
  const externalSignal = requestInit.signal;
  if (externalSignal?.aborted) controller.abort();
  else if (externalSignal) externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    const response = await fetch(absoluteUrl(path), { ...requestInit, headers, signal: controller.signal });
    const text = await response.text();
    let payload: unknown = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
    if (!response.ok) {
      const error = payload && typeof payload === "object" && "error" in payload ? String((payload as { error: unknown }).error) : "تعذر الاتصال بخدمة مراس";
      const details = payload && typeof payload === "object" ? payload as { code?: unknown; newAttemptRequired?: unknown } : {};
      throw new ApiError(error, response.status, { code: typeof details.code === "string" ? details.code : undefined, newAttemptRequired: details.newAttemptRequired === true });
    }
    return payload as T;
  } catch (reason) {
    if (reason instanceof ApiError) throw reason;
    if (reason instanceof Error && reason.name === "AbortError") throw new ApiError("انتهت مهلة الاتصال. تحقق من الشبكة وحاول مرة أخرى.", 408);
    throw new ApiError("تعذر الاتصال بخدمة مراس. حاول مرة أخرى.", 0);
  } finally {
    clearTimeout(timeout);
  }
}

export function jsonBody(value: unknown) { return JSON.stringify(value); }
