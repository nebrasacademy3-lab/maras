import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { courseResources } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { checkRateLimit } from "@/lib/auth";
import { authorizeCourseResourceRequest } from "@/lib/course-resource-access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const courseSlug = cleanText(new URL(request.url).searchParams.get("course"), 120).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(courseSlug)) return jsonError("معرّف المادة غير صالح");
  const authorization = await authorizeCourseResourceRequest(request, courseSlug);
  if (!authorization.ok) return authorization.response;
  if (!await checkRateLimit("course-resources-list", `user:${authorization.user.id}`, 90, 60)) return jsonError("طلبات كثيرة. حاول بعد دقيقة.", 429);
  const rows = await getDb().select({
    id: courseResources.id,
    title: courseResources.title,
    description: courseResources.description,
    originalName: courseResources.originalName,
    contentType: courseResources.contentType,
    sizeBytes: courseResources.sizeBytes,
    sortOrder: courseResources.sortOrder,
    updatedAt: courseResources.updatedAt,
  }).from(courseResources).where(and(
    eq(courseResources.courseSlug, courseSlug),
    eq(courseResources.status, "active"),
    eq(courseResources.studentVisible, true),
    eq(courseResources.scanStatus, "clean"),
  )).orderBy(asc(courseResources.sortOrder), asc(courseResources.title), asc(courseResources.id));
  return Response.json({
    ok: true,
    courseSlug,
    resources: rows.map((row) => ({ ...row, downloadUrl: `/api/course-resources/${row.id}` })),
  }, { headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff", vary: "Authorization, Cookie" } });
}
