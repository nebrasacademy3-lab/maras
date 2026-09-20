import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import type { DocumentPickerAsset } from "expo-document-picker";
import { Platform } from "react-native";
import { api, ApiError, getApiToken } from "@/src/lib/api";
import { savedStudyJob } from "@/src/lib/study-jobs";
import { assetMimeType } from "@/src/lib/file-types";
import { resumeStudyUpload, type StudyUploadTransport } from "@/src/lib/study-upload-client";
import { StudyUploadError } from "@/src/lib/study-upload-policy";
const hash = async (bytes: Uint8Array) => [...new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes.slice().buffer as ArrayBuffer))].map(b => b.toString(16).padStart(2,"0")).join("");
export async function uploadNativeStudyFile(asset: DocumentPickerAsset, userId: number, signal: AbortSignal, onProgress?: StudyUploadTransport["onProgress"], conversationId?: number) {
  const token = getApiToken();
  const localFile = Platform.OS === "web" ? null : new File(asset.uri);
  const sizeBytes = localFile ? localFile.size : asset.file?.size || asset.size || 0;
  if (localFile && !localFile.exists) throw new StudyUploadError("الملف المحلي غير متاح. أعد اختياره.", 409);
  const result = await resumeStudyUpload({ originalName: asset.name, contentType: assetMimeType(asset, "application/octet-stream"), sizeBytes, conversationId,
    read: async (offset,length) => {
      signal.throwIfAborted();
      if (!localFile) { if (!asset.file) throw new StudyUploadError("أعد اختيار الملف المحلي.", 409); return new Uint8Array(await asset.file.slice(offset,offset+length).arrayBuffer()); }
      if (!localFile.exists || localFile.size !== sizeBytes) throw new StudyUploadError("تغيّر الملف المحلي؛ أعد اختيار النسخة المطابقة.", 409);
      const handle = localFile.open();
      try { handle.offset = offset; return handle.readBytes(length); } finally { handle.close(); }
    },
  }, { userId, signal, hash, uuid: () => Crypto.randomUUID(), saved: savedStudyJob, onProgress,
    request: async (path, method, body) => {
      signal.throwIfAborted();
      if (token !== getApiToken()) throw new StudyUploadError("تغيّر الحساب أو الجلسة أثناء الرفع.", 409);
      try {
        const value = await api<unknown>(path, { method, body: body instanceof Uint8Array ? body.slice().buffer as ArrayBuffer : body, signal, timeoutMs: method === "POST" ? 135000 : 90000, headers: { "x-meras-acting-user": String(userId), "content-type": typeof body === "string" ? "application/json" : "application/octet-stream" } });
        if (token !== getApiToken()) throw new StudyUploadError("تغيّر الحساب أو الجلسة أثناء الرفع.", 409);
        signal.throwIfAborted(); return value;
      } catch (error) { if (error instanceof ApiError) throw new StudyUploadError(error.message,error.status,error.code); throw error; }
    },
  });
  return result.file!;
}
