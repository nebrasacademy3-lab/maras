import Constants from "expo-constants";

const configured = String(Constants.expoConfig?.extra?.apiUrl || "").replace(/\/$/, "");
export const API_URL = configured || "https://meras-alelm.glossy-sun-8084.chatgpt.site";
export const STORE_MODE = String(Constants.expoConfig?.extra?.storeMode || "reader");

let sessionToken = "";
export function setApiToken(token: string | null) { sessionToken = token || ""; }

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export function absoluteUrl(path?: string | null) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  headers.set("x-meras-client", "mobile-v1");
  if (sessionToken) headers.set("authorization", `Bearer ${sessionToken}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(absoluteUrl(path), { ...init, headers });
  const text = await response.text();
  let payload: unknown = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (!response.ok) {
    const error = payload && typeof payload === "object" && "error" in payload ? String((payload as { error: unknown }).error) : "تعذر الاتصال بخدمة مراس";
    throw new ApiError(error, response.status);
  }
  return payload as T;
}

export function jsonBody(value: unknown) { return JSON.stringify(value); }

