"use client";
import { boundedDownloadBytes } from "@/lib/study-pdf-download";
import { resumeStudyUpload, type StudyUploadTransport } from "@/lib/study-upload-client";
import { StudyUploadError } from "@/lib/study-upload-policy";
const hash = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer))].map(b => b.toString(16).padStart(2,"0")).join("");
export async function uploadStudyFile(file: File, signal: AbortSignal, onProgress?: StudyUploadTransport["onProgress"], conversationId?: number) {
  let userId: number | null = null;
  async function json(path: string, init: RequestInit) {
    const response = await fetch(path, { credentials: "same-origin", cache: "no-store", redirect: "error", ...init });
    const bytes = await boundedDownloadBytes(response, 65536, init.signal as AbortSignal);
    let value: Record<string, unknown>;
    try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new StudyUploadError("استجابة الرفع غير مكتملة.", 502); }
    if (!response.ok) throw new StudyUploadError(typeof value.error === "string" ? value.error : "تعذر الرفع؛ أعد اختيار الملف نفسه لاستئنافه.", response.status);
    return value;
  }
  async function identity() {
    const value = await json("/api/profile", { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) }) as { user?: { id?: number } };
    const id = value.user?.id;
    if (!Number.isSafeInteger(id) || Number(id) < 1 || userId !== null && id !== userId) throw new StudyUploadError("تغيّر الحساب؛ أعد فتح الأداة بالحساب الصحيح.", 409);
    userId = id!;
  }
  await identity();
  const receipt = await resumeStudyUpload({ originalName: file.name, contentType: file.type || (/\.md$/i.test(file.name) ? "text/markdown" : /\.txt$/i.test(file.name) ? "text/plain" : "application/octet-stream"), sizeBytes: file.size, conversationId, read: async (offset,length) => new Uint8Array(await file.slice(offset,offset+length).arrayBuffer()) }, {
    userId: userId!, signal, hash, uuid: () => crypto.randomUUID(), onProgress,
    saved: async (key,value) => { try { if (value === null) localStorage.removeItem(key); else if (value !== undefined) localStorage.setItem(key,value); else return localStorage.getItem(key); } catch { /* The open tab works without durable browser storage. */ } return null; },
    request: async (path,method,body) => {
      await identity();
      const result = await json(path, { method, signal: AbortSignal.any([signal,AbortSignal.timeout(method === "POST" ? 135000 : 90000)]), headers: { "x-meras-acting-user": String(userId), "content-type": typeof body === "string" ? "application/json" : "application/octet-stream" }, body: body instanceof Uint8Array ? body.slice().buffer as ArrayBuffer : body });
      await identity(); return result;
    },
  });
  return receipt.file!;
}
