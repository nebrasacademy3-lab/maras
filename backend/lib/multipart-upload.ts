import Busboy from "busboy";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { deleteObject, putObject } from "@/lib/storage";

export type StoredMultipartFile = {
  objectKey: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
};

type MultipartOptions = {
  fieldName?: string;
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  objectPrefix: string;
  allowedTypes: ReadonlySet<string>;
  validSignature: (contentType: string, header: Uint8Array) => boolean;
};

function safeOriginalName(value: string) {
  return (value.split(/[\\/]/).pop() || "attachment").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180) || "attachment";
}

function safeObjectName(value: string) {
  return safeOriginalName(value).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100) || "attachment";
}

export async function deleteStoredMultipartFiles(files: StoredMultipartFile[]) {
  await Promise.all(files.map((file) => deleteObject(file.objectKey).catch(() => undefined)));
}

export async function parseStoredMultipart(request: Request, options: MultipartOptions) {
  if (!request.body) throw new Error("الطلب لا يحتوي بيانات");
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) throw new Error("صيغة الرفع غير صالحة");
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > options.maxTotalBytes + 2 * 1024 * 1024) throw new Error("إجمالي حجم المرفقات أكبر من المسموح");

  const fields: Record<string, string> = {};
  const files: StoredMultipartFile[] = [];
  const uploadTasks: Array<Promise<void>> = [];
  const parser = Busboy({
    headers: Object.fromEntries(request.headers),
    limits: { files: options.maxFiles, fileSize: options.maxFileBytes, fields: 20, fieldSize: 16 * 1024, parts: options.maxFiles + 20 },
  });
  let failure = "";
  let totalBytes = 0;

  parser.on("field", (name, value, info) => {
    if (info.valueTruncated) failure ||= "أحد الحقول النصية أكبر من المسموح";
    fields[name] = value;
  });
  parser.on("file", (fieldName, file, info) => {
    if (fieldName !== (options.fieldName || "files")) {
      failure ||= "اسم حقل الملف غير صالح";
      file.resume();
      return;
    }
    const originalName = safeOriginalName(info.filename);
    const mimeType = info.mimeType.toLowerCase();
    if (!options.allowedTypes.has(mimeType)) {
      failure ||= `نوع الملف ${originalName} غير مدعوم`;
      file.resume();
      return;
    }

    const objectKey = `${options.objectPrefix.replace(/\/$/, "")}/${crypto.randomUUID()}-${safeObjectName(originalName)}`;
    const headerChunks: Buffer[] = [];
    let headerBytes = 0;
    let fileBytes = 0;
    let truncated = false;
    let totalExceeded = false;
    file.once("limit", () => { truncated = true; });
    const validator = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        fileBytes += chunk.byteLength;
        totalBytes += chunk.byteLength;
        if (totalBytes > options.maxTotalBytes) totalExceeded = true;
        if (headerBytes < 64) {
          const needed = Math.min(64 - headerBytes, chunk.byteLength);
          headerChunks.push(chunk.subarray(0, needed));
          headerBytes += needed;
        }
        callback(null, chunk);
      },
      flush(callback) {
        if (truncated || fileBytes > options.maxFileBytes) return callback(new Error(`الملف ${originalName} أكبر من المسموح`));
        if (totalExceeded) return callback(new Error("إجمالي حجم المرفقات أكبر من المسموح"));
        if (fileBytes <= 0) return callback(new Error(`الملف ${originalName} فارغ`));
        const header = new Uint8Array(Buffer.concat(headerChunks).subarray(0, 64));
        if (!options.validSignature(mimeType, header)) return callback(new Error(`محتوى الملف ${originalName} لا يطابق نوعه`));
        callback();
      },
    });
    const webStream = Readable.toWeb(file.pipe(validator)) as ReadableStream<Uint8Array>;
    uploadTasks.push(putObject(objectKey, webStream, mimeType).then(() => {
      files.push({ objectKey, originalName, contentType: mimeType, sizeBytes: fileBytes });
    }).catch((error) => {
      failure ||= error instanceof Error ? error.message : `تعذر رفع ${originalName}`;
    }));
  });
  parser.once("filesLimit", () => { failure ||= `الحد الأقصى ${options.maxFiles} مرفقات`; });
  parser.once("fieldsLimit", () => { failure ||= "عدد الحقول أكبر من المسموح"; });
  parser.once("partsLimit", () => { failure ||= "عدد أجزاء الطلب أكبر من المسموح"; });

  try {
    await pipeline(Readable.fromWeb(request.body as import("node:stream/web").ReadableStream<Uint8Array>), parser);
    await Promise.all(uploadTasks);
    if (failure) throw new Error(failure);
    return { fields, files };
  } catch (error) {
    await deleteStoredMultipartFiles(files);
    throw error;
  }
}
