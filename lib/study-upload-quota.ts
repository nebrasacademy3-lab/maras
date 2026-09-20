import "server-only";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiFiles } from "@/db/schema";
import { getAiUsageStatuses } from "@/lib/ai-platform";
import { StudyUploadError, STUDY_UPLOAD_MAX_BYTES } from "@/lib/study-upload-policy";
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
function setting(value: string | undefined, fallback: number, min: number, max: number) {
  const number = value?.trim() ? Number(value) : NaN;
  return Number.isSafeInteger(number) ? Math.max(min, Math.min(max, number)) : fallback;
}
export async function studyUploadLimits(user: { id: number; email: string }) {
  const { statuses } = await getAiUsageStatuses(user);
  const eligible = [statuses.summary, statuses.translation, statuses.quiz].filter(s => s.enabled && s.remaining > 0);
  if (!eligible.length) throw new StudyUploadError("خدمات الملفات غير متاحة أو اكتملت حصتك الحالية.", 429, "AI_UPLOAD_QUOTA");
  const maxFileBytes = Math.min(STUDY_UPLOAD_MAX_BYTES, Math.max(...eligible.map(s => s.maxFileBytes)));
  return { maxFileBytes, maxFiles: setting(process.env.AI_MAX_STORED_FILES_PER_USER, 30, 1, 200), maxBytes: setting(process.env.AI_MAX_STORED_BYTES_PER_USER, Math.max(200 * 1024 * 1024, maxFileBytes), maxFileBytes, 2_000_000_000) };
}
/** Call while holding ai-file-quota:<userId> for admission/publication. Legacy
 * multipart and resumable upload share the same reservations and quota lock. */
export async function studyStoredUsage(userId: number, tx: Transaction | ReturnType<typeof getDb> = getDb()) {
  const [files] = await tx.select({ fileCount: count(), totalBytes: sql<string>`COALESCE(SUM(${aiFiles.sizeBytes}),0)::text` }).from(aiFiles).where(and(eq(aiFiles.userId, userId), isNull(aiFiles.sourceResourceId)));
  const reserved = await tx.execute(sql`SELECT count(*)::int AS count, coalesce(sum(size_bytes),0)::text AS bytes FROM study_upload_sessions u WHERE owner_id = ${userId} AND status <> 'completed' AND
    (status IN ('open','blocked') OR EXISTS (SELECT 1 FROM storage_cleanup_jobs j WHERE j.object_key IN ('private/resumable/' || u.id, u.object_key) AND j.status <> 'completed'))`);
  return { fileCount: Number(files.fileCount) + Number(reserved.rows[0]?.count || 0), totalBytes: Number(files.totalBytes) + Number(reserved.rows[0]?.bytes || 0) };
}
