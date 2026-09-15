import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import { api, ApiError, jsonBody } from "@/src/lib/api";

export type StudyJob<T> = { id: string; status: string; result?: T; error?: string; code?: string };
export class StudyJobError extends Error { constructor(message: string, readonly terminal = false) { super(message); } }
export async function savedStudyJob(scope: string, value?: string | null) {
  const key = `meras.study.${scope.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return null;
      if (value === null) window.sessionStorage.removeItem(key);
      else if (value !== undefined) window.sessionStorage.setItem(key, value);
      else return window.sessionStorage.getItem(key);
    } else if (value === null) await SecureStore.deleteItemAsync(key);
    else if (value !== undefined) await SecureStore.setItemAsync(key, value);
    else return await SecureStore.getItemAsync(key);
  } catch { /* Storage permission must not prevent the current job from completing. */ }
  return null;
}
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new StudyJobError("توقفت متابعة الطلب")); return; }
    const finish = () => { signal.removeEventListener("abort", abort); resolve(); };
    const timer = setTimeout(finish, ms);
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(new StudyJobError("توقفت متابعة الطلب")); };
    signal.addEventListener("abort", abort, { once: true });
  });
}
export async function observeStudyJob<T>(initial: StudyJob<T>, signal: AbortSignal, onStatus: (phase: string) => void): Promise<T> {
  let job = initial, failures = 0;
  const started = Date.now();
  while (!signal.aborted) {
    onStatus(job.status);
    if (job.status === "succeeded" && job.result) return job.result;
    if (job.status === "failed") throw new StudyJobError(job.error || "تعذر إكمال المعالجة.", true);
    if (Date.now() - started > 31 * 60_000) throw new StudyJobError("توقفت المتابعة. أعد فتح الأداة لمتابعة الطلب المحفوظ.");
    await wait(AppState.currentState === "background" ? 30_000 : 5000 + Math.min(failures * 3000, 15_000), signal);
    try {
      job = (await api<{ job: StudyJob<T> }>(`/api/ai/jobs/${encodeURIComponent(job.id)}`, { signal })).job;
      failures = 0;
    } catch (error) {
      if (signal.aborted) throw error;
      if (error instanceof ApiError && [401, 403, 404, 410].includes(error.status)) throw new StudyJobError(error.message, true);
      if (++failures > 5) throw error;
      onStatus("reconnecting");
      if (error instanceof ApiError && error.retryAfterSeconds) await wait(Math.min(60, error.retryAfterSeconds) * 1000, signal);
    }
  }
  throw new StudyJobError("توقفت متابعة الطلب");
}
export async function requestStudyAction<T>(fileId: number, payload: Record<string, unknown>, options: { signal: AbortSignal; onJob: (id: string) => Promise<unknown>; onStatus: (phase: string) => void }) {
  const response = await api<{ job: StudyJob<T> }>(`/api/ai/files/${fileId}/actions`, { method: "POST", body: jsonBody({ ...payload, async: true, requestId: payload.requestId || Crypto.randomUUID() }), signal: options.signal });
  if (!response.job?.id) throw new StudyJobError("لم يُرجع الخادم معرّف الطلب.");
  await options.onJob(response.job.id);
  return observeStudyJob(response.job, options.signal, options.onStatus);
}
