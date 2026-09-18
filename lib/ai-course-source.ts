import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiFiles, courseAccess, courseResources } from "@/db/schema";
import { activeCourseAccessWhere } from "@/lib/course-access";
import { AiPlatformError } from "@/lib/ai-platform";
import { activeStorageProvider } from "@/lib/storage";
import { contentViewModeError, getContentViewMode } from "@/lib/platform-settings";

export async function activeStudyResource(resourceId: number, user: { id: number; email: string }, client: "app" | "web") {
  const [resource] = await getDb().select().from(courseResources).where(and(eq(courseResources.id, resourceId), eq(courseResources.status, "active"), eq(courseResources.studentVisible, true), eq(courseResources.scanStatus, "clean"))).limit(1);
  if (!resource) throw new AiPlatformError("AI_SOURCE_UNAVAILABLE", "ملف الدرس غير متاح حاليًا.", 404);
  const policyError = contentViewModeError(await getContentViewMode(), client);
  if (policyError) throw new AiPlatformError("AI_SOURCE_POLICY", policyError, 403);
  const [access] = await getDb().select({ id: courseAccess.id }).from(courseAccess).where(activeCourseAccessWhere(user.id, resource.courseSlug)).limit(1);
  if (!access) throw new AiPlatformError("AI_SOURCE_ACCESS", "يلزم اشتراك نشط في المادة لاستخدام ملف هذا الدرس.", 403);
  return resource;
}

/** Virtual references never duplicate or own the course object's storage key. */
export async function resolveAiSource(file: typeof aiFiles.$inferSelect, user: { id: number; email: string }, client: "app" | "web") {
  if (file.userId !== user.id) throw new AiPlatformError("AI_FILE_MISSING", "الملف غير موجود.", 404);
  if (file.sourceResourceId !== null) {
    const resource = await activeStudyResource(file.sourceResourceId, user, client);
    const version = resource.scanSha256 || createHash("sha256").update(`${resource.objectKey}:${resource.sizeBytes}:${resource.scannedAt || resource.updatedAt}`).digest("hex");
    return { ...resource, storageProvider: activeStorageProvider(), cacheScope: `resource:${resource.id}`, cacheVersion: version };
  }
  if (file.storageProvider === "course-resource") throw new AiPlatformError("AI_SOURCE_UNAVAILABLE", "مرجع ملف الدرس غير صالح.", 404);
  if (file.scanStatus !== "clean" || file.status !== "ready") throw new AiPlatformError("AI_FILE_NOT_READY", "انتظر اكتمال الفحص الأمني للملف.", 423);
  return { ...file, cacheScope: `user:${user.id}:file:${file.id}`, cacheVersion: file.scanSha256 || file.objectKey };
}
