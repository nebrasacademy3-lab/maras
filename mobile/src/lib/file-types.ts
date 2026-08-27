import type * as DocumentPicker from "expo-document-picker";

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
};

export function assetMimeType(asset: Pick<DocumentPicker.DocumentPickerAsset, "name" | "mimeType">, fallback: string) {
  const declared = asset.mimeType?.toLowerCase().trim();
  if (declared && declared !== "application/octet-stream") return declared;
  const extension = asset.name.split(".").pop()?.toLowerCase() || "";
  return MIME_BY_EXTENSION[extension] || fallback;
}
