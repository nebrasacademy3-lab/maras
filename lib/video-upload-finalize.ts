export type VideoUploadReceipt = { asset?: { durationSeconds?: number | null }; reused?: boolean };
type Payload = { courseSlug: string; lessonId: string; objectKey: string; contentType: string; sizeBytes: number; durationSeconds: number };

/** Retry only the idempotent metadata finalization; never upload the video bytes twice. */
export async function finalizeVideoUpload(payload: Payload, signal: AbortSignal): Promise<VideoUploadReceipt> {
  let failure: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    let retry = true;
    try {
      const response = await fetch("/api/admin/videos/direct", {
        method: "POST", credentials: "same-origin", signal,
        headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      retry = response.status >= 500;
      const result = await response.json() as VideoUploadReceipt & { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر ربط الفيديو بالدرس");
      return result;
    } catch (error) {
      failure = error;
      if (signal.aborted || !retry || attempt === 2) throw error;
    }
    await new Promise<void>((resolve, reject) => {
      const done = () => { signal.removeEventListener("abort", aborted); resolve(); };
      const timer = setTimeout(done, 1000 * (attempt + 1));
      const aborted = () => { clearTimeout(timer); signal.removeEventListener("abort", aborted); reject(signal.reason); };
      signal.addEventListener("abort", aborted, { once: true });
      if (signal.aborted) aborted();
    });
  }
  throw failure;
}

/** Optional local metadata; object URL is always revoked and the server probes unsupported files. */
export function readBrowserVideoDuration(file: File, signal: AbortSignal): Promise<number> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(0); return; }
    const video = document.createElement("video"), objectUrl = URL.createObjectURL(file);
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(14_400, Math.round(video.duration)) : 0;
      clearTimeout(timer); signal.removeEventListener("abort", done);
      video.onloadedmetadata = null; video.onerror = null; video.removeAttribute("src"); video.load(); URL.revokeObjectURL(objectUrl);
      resolve(duration);
    };
    const timer = setTimeout(done, 8_000);
    video.preload = "metadata"; video.onloadedmetadata = done; video.onerror = done;
    signal.addEventListener("abort", done, { once: true }); video.src = objectUrl;
  });
}
