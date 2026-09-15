import { DOCX_MIME, PPTX_MIME } from "@/lib/study-document";
import { getObject } from "@/lib/storage";
import { AiPlatformError } from "@/lib/ai-platform";

export const AI_FILE_TYPES = new Set([
  DOCX_MIME, PPTX_MIME,
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
  "text/markdown",
]);

export const AI_SUPPORTED_FILES = [
  { mimeType: DOCX_MIME, extensions: ["docx"] },
  { mimeType: PPTX_MIME, extensions: ["pptx"] },
  { mimeType: "application/pdf", extensions: ["pdf"] },
  { mimeType: "image/png", extensions: ["png"] },
  { mimeType: "image/jpeg", extensions: ["jpg", "jpeg"] },
  { mimeType: "text/plain", extensions: ["txt"] },
  { mimeType: "text/markdown", extensions: ["md"] },
] as const;

// Export Office documents to PDF for the best visual fidelity before AI processing.
export const AI_DOCUMENT_GUIDANCE = {
  recommendedMimeType: "application/pdf",
  message: "ندعم Word (DOCX) وPowerPoint (PPTX) باستخراج النص والجداول. للمخططات والصور والمعادلات المصوّرة، صدّر إلى PDF للحفاظ على المحتوى البصري. الملفات القديمة DOC وPPT تحتاج تحويلًا.",
} as const;

export function validAiFileSignature(type: string, bytes: Uint8Array) {
  if (type === DOCX_MIME || type === PPTX_MIME) return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
  if (type === "application/pdf") return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  if (type === "image/png") return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "text/plain" || type === "text/markdown") return bytes.length > 0 && !bytes.slice(0, 64).some((byte) => byte === 0);
  return false;
}

type AiFileActionState = { active: number; users: Set<number> };
const actionStateKey = Symbol.for("meras.ai.file-action-state");

function fileActionState() {
  const root = globalThis as typeof globalThis & { [actionStateKey]?: AiFileActionState };
  if (!root[actionStateKey]) root[actionStateKey] = { active: 0, users: new Set<number>() };
  return root[actionStateKey];
}

export function tryAcquireAiFileAction(userId: number) {
  const state = fileActionState();
  const configured = Number(process.env.AI_MAX_CONCURRENT_FILE_ACTIONS);
  const maxConcurrent = Number.isFinite(configured) ? Math.max(1, Math.min(16, Math.floor(configured))) : 4;
  if (state.active >= maxConcurrent || state.users.has(userId)) return null;
  state.active += 1;
  state.users.add(userId);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.active = Math.max(0, state.active - 1);
    state.users.delete(userId);
  };
}

export async function readAiFileBytes(file: { objectKey: string; storageProvider: string; sizeBytes: number; contentType: string }, maxBytes: number) {
  if (file.sizeBytes <= 0 || file.sizeBytes > maxBytes) throw new AiPlatformError("AI_FILE_TOO_LARGE", "حجم الملف أكبر من الحد المسموح لهذه الخدمة.", 413);
  const provider = file.storageProvider === "s3" ? "s3" : "local";
  const object = await getObject(file.objectKey, undefined, provider, AbortSignal.timeout(20_000));
  if (!object) throw new AiPlatformError("AI_FILE_MISSING", "تعذر العثور على الملف المرفوع.", 404);
  const reader = object.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => undefined); }, 30_000);
  try {
    if (object.size > maxBytes) throw new AiPlatformError("AI_FILE_TOO_LARGE", "حجم الملف أكبر من الحد المسموح لهذه الخدمة.", 413);
    while (true) {
      const part = await reader.read();
      if (timedOut) throw new AiPlatformError("AI_FILE_READ_TIMEOUT", "انتهت مهلة قراءة الملف. حاول مرة أخرى.", 503);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) throw new AiPlatformError("AI_FILE_TOO_LARGE", "حجم الملف أكبر من الحد المسموح.", 413);
      parts.push(part.value);
    }
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (size !== file.sizeBytes) throw new AiPlatformError("AI_FILE_INCOMPLETE", "حجم الملف لا يطابق النسخة المحفوظة. أعد رفعه.", 422);
  const bytes = Buffer.concat(parts);
  if (!bytes.length || bytes.length > maxBytes) throw new AiPlatformError("AI_FILE_TOO_LARGE", "تعذر قراءة الملف ضمن الحد المسموح.", 413);
  if (!validAiFileSignature(file.contentType, new Uint8Array(bytes.subarray(0, 64)))) throw new AiPlatformError("AI_FILE_INVALID", "توقيع الملف لا يطابق نوعه.", 422);
  return bytes;
}
