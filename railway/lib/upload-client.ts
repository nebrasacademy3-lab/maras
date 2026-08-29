export type UploadProgress = {
  loaded: number;
  total: number;
  percent: number;
  bytesPerSecond: number;
  remainingSeconds: number | null;
};

type UploadOptions = {
  url: string;
  method?: "POST" | "PUT" | "PATCH";
  body: FormData | Blob | File;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
};

export class UploadError extends Error {
  status: number;
  constructor(message: string, status = 0) { super(message); this.status = status; }
}

function responsePayload(text: string) {
  try { return text ? JSON.parse(text) as Record<string, unknown> : {}; }
  catch { return {}; }
}

export function uploadWithProgress<T>({ url, method = "POST", body, headers = {}, timeoutMs = 15 * 60_000, signal, onProgress }: UploadOptions) {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startedAt = performance.now();
    xhr.open(method, url, true);
    xhr.withCredentials = true;
    xhr.timeout = Math.max(15_000, Math.min(timeoutMs, 30 * 60_000));
    xhr.setRequestHeader("accept", "application/json");
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));

    const abort = () => xhr.abort();
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });

    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : body instanceof FormData ? 0 : body.size;
      const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.1);
      const bytesPerSecond = event.loaded / elapsedSeconds;
      const percent = total > 0 ? Math.min(100, Math.round(event.loaded / total * 100)) : 0;
      const remainingSeconds = total > event.loaded && bytesPerSecond > 0 ? Math.ceil((total - event.loaded) / bytesPerSecond) : null;
      onProgress?.({ loaded: event.loaded, total, percent, bytesPerSecond, remainingSeconds });
    };
    xhr.onerror = () => reject(new UploadError("تعذر الاتصال بالخادم أثناء الرفع. تحقق من الشبكة وحاول مرة أخرى."));
    xhr.ontimeout = () => reject(new UploadError("استغرق الرفع وقتًا أطول من المتوقع. احتفظ بالصفحة مفتوحة ثم أعد المحاولة.", 408));
    xhr.onabort = () => reject(new UploadError("تم إلغاء الرفع.", 499));
    xhr.onload = () => {
      const payload = responsePayload(xhr.responseText);
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new UploadError(typeof payload.error === "string" ? payload.error : "تعذر إكمال الرفع.", xhr.status));
        return;
      }
      resolve(payload as T);
    };
    xhr.onloadend = () => signal?.removeEventListener("abort", abort);
    xhr.send(body);
  });
}

export function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function uploadProgressLabel(progress: UploadProgress) {
  const speed = progress.bytesPerSecond > 0 ? `${formatBytes(progress.bytesPerSecond)}/ث` : "جارٍ حساب السرعة";
  const remaining = progress.remainingSeconds == null ? "" : progress.remainingSeconds < 60 ? ` · متبقٍ نحو ${progress.remainingSeconds} ث` : ` · متبقٍ نحو ${Math.ceil(progress.remainingSeconds / 60)} د`;
  return `${progress.percent}% · ${formatBytes(progress.loaded)}${progress.total ? ` من ${formatBytes(progress.total)}` : ""} · ${speed}${remaining}`;
}
