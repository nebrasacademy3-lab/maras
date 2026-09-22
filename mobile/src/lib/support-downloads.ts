import { assertApiSession, getApiSessionRevision } from "@/src/lib/api";
import { downloadProtectedFile } from "@/src/lib/downloads";
import type { SupportFile } from "@/src/types";

type Attachment = Pick<SupportFile, "id" | "originalName" | "contentType">;
/** Support attachments use the same bounded, identity-bound, temporary transport as contracts. */
export function downloadSupportFile(file: Attachment) {
  return downloadProtectedFile({ path: `/api/support/files/${file.id}`, fileName: file.originalName, mimeType: file.contentType, saveToFiles: true });
}
/** Do not open concurrent system pickers or carry a queued batch into another account. */
export async function downloadSupportFiles(files: readonly Attachment[]) {
  const revision = getApiSessionRevision();
  const result = { saved: 0, shared: 0, cancelled: false };
  const visited = new Set<number>();
  for (const file of files) {
    assertApiSession(revision);
    if (visited.has(file.id)) continue;
    visited.add(file.id);
    const download = await downloadSupportFile(file);
    assertApiSession(revision);
    if (download.action === "cancelled") { result.cancelled = true; break; }
    if (download.action === "saved") result.saved++;
    else if (download.action === "shared") result.shared++;
  }
  return result;
}
