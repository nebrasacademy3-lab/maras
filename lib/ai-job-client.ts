import { normalizeStudyProgress, type StudyProgress } from "@/lib/study-progress";
/** Browser-side job polling. Aborting stops observation, not a job already accepted by the server. */
export type StudyJob<T> = { id: string; status: string; result?: T; error?: string; code?: string; progress?: unknown; supportsControl?: boolean };
export class StudyRequestError extends Error {
  constructor(message: string, readonly status: number, readonly terminal = false) { super(message); this.name = "StudyRequestError"; }
}
export async function studyJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...init });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new StudyRequestError(payload.error || "تعذر إكمال الطلب. تحقق من الاتصال ثم حاول مجددًا.", response.status, [401, 403, 404, 410].includes(response.status));
  return payload;
}
function pause(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const finish = () => { signal?.removeEventListener("abort", abort); resolve(); };
    const timer = setTimeout(finish, ms);
    const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(new DOMException("Aborted", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
  });
}
export async function observeStudyJob<T>(initial: StudyJob<T>, options: { signal?: AbortSignal; onStatus?: (status: string) => void; onProgress?: (progress: StudyProgress | null) => void } = {}): Promise<T> {
  let job = initial;
  const started = Date.now();
  let failures = 0;
  while (true) {
    options.signal?.throwIfAborted();
    options.onStatus?.(job.status);
    options.onProgress?.(normalizeStudyProgress(job.progress,job.status));
    if (job.status === "succeeded" && job.result) return job.result;
    if (job.status === "paused") throw new StudyRequestError("الطلب متوقف مؤقتًا. استأنفه من الزر أدناه لإكمال الأجزاء المتبقية.", 409, false);
    if (job.status === "failed" || job.status === "cancelled") throw new StudyRequestError(job.error || "تعذر إكمال المعالجة.", 422, true);
    if (Date.now() - started > 31 * 60_000) throw new Error("توقفت المتابعة. يمكنك العودة إلى الطلب المحفوظ أو إعادة فتح الأداة.");
    await pause(typeof document !== "undefined" && document.hidden ? 15_000 : 5000 + Math.min(failures * 3000, 10_000), options.signal);
    try {
      const payload = await studyJson<{ job: StudyJob<T> }>(`/api/ai/jobs/${encodeURIComponent(job.id)}`, { signal: options.signal });
      job = payload.job;
      failures = 0;
    } catch (error) {
      if (options.signal?.aborted || error instanceof StudyRequestError && error.terminal) throw error;
      if (++failures > 5) throw error;
      options.onStatus?.("reconnecting");
    }
  }
}
export async function requestStudyAction<T>(fileId: number, payload: Record<string, unknown>, options: { signal?: AbortSignal; onJob?: (id: string) => void; onStatus?: (status: string) => void; onProgress?: (progress: StudyProgress | null) => void } = {}): Promise<T> {
  const response = await studyJson<{ job: StudyJob<T> }>(`/api/ai/files/${fileId}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, async: true, requestId: payload.requestId || crypto.randomUUID() }), signal: options.signal });
  if (!response.job?.id) throw new Error("لم يُرجع الخادم معرّف الطلب. حدّث الصفحة ثم حاول مجددًا.");
  options.signal?.throwIfAborted();
  options.onJob?.(response.job.id);
  return observeStudyJob(response.job, options);
}

export async function controlStudyJob<T>(id: string, action: "pause" | "resume" | "cancel", signal?: AbortSignal) {
  return studyJson<{job: StudyJob<T>}>(`/api/ai/jobs/${encodeURIComponent(id)}`, {method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action}),signal});
}
