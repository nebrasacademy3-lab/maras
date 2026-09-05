import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { courseResources } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { checkRateLimit } from "@/lib/auth";
import { authorizeCourseResourceRequest, safeAttachmentDisposition } from "@/lib/course-resource-access";
import { getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return jsonError("معرّف الملف غير صالح");
  const [resource] = await getDb().select().from(courseResources).where(and(
    eq(courseResources.id, id),
    eq(courseResources.status, "active"),
    eq(courseResources.studentVisible, true),
    eq(courseResources.scanStatus, "clean"),
  )).limit(1);
  if (!resource) return jsonError("الملف غير متاح", 404);
  const authorization = await authorizeCourseResourceRequest(request, resource.courseSlug);
  if (!authorization.ok) return authorization.response;
  if (!await checkRateLimit("course-resource-download", `user:${authorization.user.id}`, 40, 60)) return jsonError("طلبات تنزيل كثيرة. حاول بعد دقيقة.", 429);
  const object = await getObject(resource.objectKey);
  if (!object) return jsonError("تعذر العثور على الملف المخزن", 404);
  return new Response(object.body, {
    headers: {
      "cache-control": "private, no-store, max-age=0",
      "content-disposition": safeAttachmentDisposition(resource.originalName),
      "content-length": String(object.size || resource.sizeBytes),
      "content-security-policy": "sandbox",
      "content-type": resource.contentType,
      "cross-origin-resource-policy": "same-origin",
      etag: object.etag,
      pragma: "no-cache",
      vary: "Authorization, Cookie",
      "x-content-type-options": "nosniff",
      "x-download-options": "noopen",
      "x-robots-tag": "noindex, noarchive",
    },
  });
}
