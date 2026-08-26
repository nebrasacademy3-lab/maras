import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import { supervisorAssignments, videoAssets } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";
import { getCourseCatalog } from "@/lib/catalog-store";

type PrivateBucket = {
  put(key: string, value: ReadableStream, options: { httpMetadata: { contentType: string }; customMetadata: Record<string, string> }): Promise<unknown>;
};

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const configuredToken = (process.env.ADMIN_UPLOAD_TOKEN || process.env.ADMIN_API_TOKEN)?.trim();
  const suppliedToken = request.headers.get("x-admin-upload-token")?.trim();
  const user = await getSessionUser(request);
  const hasToken = Boolean(configuredToken && suppliedToken === configuredToken);
  if (!hasToken && !roleAllowed(user, ["admin", "supervisor"])) return jsonError("غير مصرح برفع الفيديو", 401);
  const bucket = (env as unknown as { BUCKET?: PrivateBucket }).BUCKET;
  if (!bucket) return jsonError("مخزن الفيديو غير متاح", 503);

  const form = await request.formData();
  const file = form.get("file");
  const courseSlug = cleanText(form.get("courseSlug"), 120);
  const lessonId = cleanText(form.get("lessonId"), 120);
  if (!(file instanceof File) || !file.type.startsWith("video/")) return jsonError("اختر ملف فيديو صالحًا");
  if (file.size <= 0 || file.size > 200 * 1024 * 1024) return jsonError("حجم الفيديو يجب ألا يتجاوز 200 ميجابايت", 413);
  const course = await getCourseCatalog(courseSlug, true);
  if (!course?.units.some((unit) => unit.lessons.some((lesson) => lesson.id === lessonId))) return jsonError("تعذر مطابقة المادة أو الدرس");
  if (!hasToken && user?.role === "supervisor") {
    const assignments = await getDb().select().from(supervisorAssignments).where(and(eq(supervisorAssignments.supervisorId, user.id), eq(supervisorAssignments.active, true)));
    const mayEdit = assignments.some((assignment) => (!assignment.institutionSlug || assignment.institutionSlug === course.universitySlug) && (!assignment.specialty || assignment.specialty === course.specialty));
    if (!mayEdit) return jsonError("هذه المادة غير مسندة لهذا المشرف", 403);
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100) || "lesson.mp4";
  const objectKey = `private/${courseSlug}/${lessonId}/${crypto.randomUUID()}-${safeName}`;
  await bucket.put(objectKey, file.stream(), {
    httpMetadata: { contentType: file.type || "video/mp4" },
    customMetadata: { courseSlug, lessonId, visibility: "private" },
  });
  const now = new Date().toISOString();
  const [asset] = await getDb().insert(videoAssets).values({
    courseSlug,
    lessonId,
    objectKey,
    contentType: file.type || "video/mp4",
    sizeBytes: file.size,
    status: "ready",
    createdAt: now,
    updatedAt: now,
  }).returning({ id: videoAssets.id, objectKey: videoAssets.objectKey, status: videoAssets.status });
  return Response.json({ ok: true, asset }, { status: 201 });
}
