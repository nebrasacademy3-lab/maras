import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { aiArtifacts, aiConversations, aiFileJobs, aiFiles, aiMessages, aiQuizzes, courseAccess, courseResources, platformSettings, users } from "@/db/schema";
import { activeAccessCondition } from "@/lib/course-access";
import { contentViewModeError, type ContentViewMode } from "@/lib/platform-settings";

/** One SQL authorization predicate for generation, cached reads and exports.
 * Private uploads and published course references are deliberately distinct.
 * The caller must also scope the parent result to the current user.
 */
export function readableStudyFileCondition(userId: number, client: "app" | "web", mode?: ContentViewMode) {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new TypeError("Invalid study owner");
  // Read the channel policy in the same statement as the protected content.
  const permitted = mode ? sql`${!contentViewModeError(mode, client)}` : sql`NOT EXISTS (
    SELECT 1 FROM ${platformSettings} WHERE ${platformSettings.key} = 'content_view_mode'
      AND ${platformSettings.value} = ${client === "web" ? "app_only" : "web_only"})`;
  const published = sql`(${permitted}) AND EXISTS (
    SELECT 1 FROM ${courseResources}
    WHERE ${courseResources.id} = ${aiFiles.sourceResourceId}
      AND ${courseResources.status} = 'active' AND ${courseResources.studentVisible} = true
      AND ${courseResources.scanStatus} = 'clean'
      AND EXISTS (SELECT 1 FROM ${courseAccess}
        WHERE ${courseAccess.userId} = ${userId} AND ${courseAccess.courseSlug} = ${courseResources.courseSlug}
          AND ${activeAccessCondition(sql`clock_timestamp()`)}))`;
  return and(sql`EXISTS (SELECT 1 FROM ${users} WHERE ${users.id} = ${userId} AND ${users.status} = 'active')`, eq(aiFiles.userId, userId), eq(aiFiles.status, "ready"), eq(aiFiles.scanStatus, "clean"), sql`(
    (${and(isNull(aiFiles.sourceResourceId), inArray(aiFiles.storageProvider, ["local", "s3"]))})
    OR (${aiFiles.sourceResourceId} IS NOT NULL AND ${published}))`)!;
}

export async function studyReadAccess(userId: number, client: "app" | "web") {
  const file = readableStudyFileCondition(userId, client);
  // Each correlated reference keeps using the same user-id/scan/entitlement predicate.
  const artifact = sql`EXISTS (SELECT 1 FROM ${aiFiles} WHERE ${aiFiles.id} = ${aiArtifacts.fileId} AND ${file})`;
  const quiz = sql`EXISTS (SELECT 1 FROM ${aiFiles} WHERE ${aiFiles.id} = ${aiQuizzes.fileId} AND ${file})`;
  const job = sql`EXISTS (SELECT 1 FROM ${aiFiles} WHERE ${aiFiles.id} = ${aiFileJobs.fileId} AND ${file})`;
  // A chat may quote earlier study output without a file_id of its own. Do not
  // leak it, its generated title, or its preview by filtering only attachments.
  // EXISTS runs in PostgreSQL before LIMIT/counts: old references cannot hide
  // behind a truncated history. Deleted-source assistant messages fail closed.
  const conversation = sql`NOT EXISTS (SELECT 1 FROM ${aiMessages}
      WHERE ${aiMessages.conversationId} = ${aiConversations.id} AND (
        (${aiMessages.fileId} IS NULL AND ${aiMessages.role} = 'assistant' AND ${aiMessages.service} <> 'chat')
        OR (${aiMessages.fileId} IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM ${aiFiles} WHERE ${aiFiles.id} = ${aiMessages.fileId} AND ${file}))))
    AND NOT EXISTS (SELECT 1 FROM ${aiArtifacts} WHERE ${aiArtifacts.conversationId} = ${aiConversations.id} AND NOT (${artifact}))
    AND NOT EXISTS (SELECT 1 FROM ${aiQuizzes} WHERE ${aiQuizzes.conversationId} = ${aiConversations.id} AND NOT (${quiz}))
    AND NOT EXISTS (SELECT 1 FROM ${aiFileJobs} WHERE ${aiFileJobs.conversationId} = ${aiConversations.id} AND NOT (${job}))`;
  return { file, artifact, quiz, job, conversation };
}
