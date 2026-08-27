import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, catalogCourses } from "@/db/schema";
import { checkRateLimit, clientIp, getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { cleanText, isAdminRequest, jsonError } from "@/lib/api";
import { getCourseCatalog, invalidateCatalogCache } from "@/lib/catalog-store";
import { syncCatalogTemplates } from "@/lib/catalog-sync";
import { deleteObject, putObject } from "@/lib/storage";

const MAX_COVER_BYTES = 6 * 1024 * 1024;
const allowedTypes = new Map([["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"]]);

function detectImageType(bytes: Uint8Array) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return "";
}

export async function POST(request: Request) {
  const machineAuthorized = isAdminRequest(request);
  if (!machineAuthorized && !sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = machineAuthorized ? null : await getSessionUser(request);
  if (!machineAuthorized && !roleAllowed(user, ["admin"])) return jsonError("غير مصرح", 403);
  const identity = machineAuthorized ? `machine:${clientIp(request)}` : `user:${user!.id}`;
  if (!await checkRateLimit("admin-cover-upload", identity, 20, 60)) return jsonError("طلبات الرفع كثيرة. حاول بعد دقيقة.", 429);
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_COVER_BYTES + 1 * 1024 * 1024) return jsonError("حجم الطلب أكبر من المسموح", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return jsonError("تعذر قراءة الغلاف", 400); }
  const slug = cleanText(form.get("courseSlug"), 80).toLowerCase();
  const file = form.get("file");
  if (!await getCourseCatalog(slug, true)) return jsonError("المادة غير موجودة", 404);
  if (!(file instanceof File) || !allowedTypes.has(file.type.toLowerCase())) return jsonError("ارفع غلاف PNG أو JPG أو WebP");
  if (file.size <= 0 || file.size > MAX_COVER_BYTES) return jsonError("حجم الغلاف يجب ألا يتجاوز 6 ميجابايت", 413);
  const declaredType = file.type.toLowerCase();
  const detectedType = detectImageType(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
  if (detectedType !== declaredType) return jsonError("محتوى الغلاف لا يطابق نوع الملف");
  const extension = allowedTypes.get(detectedType)!;
  const objectKey = `covers/${slug}/${crypto.randomUUID()}.${extension}`;
  try {
    const db = getDb();
    let [existing] = await db.select({ coverImageUrl: catalogCourses.coverImageUrl }).from(catalogCourses).where(eq(catalogCourses.slug, slug)).limit(1);
    if (!existing) {
      await syncCatalogTemplates(49, "core");
      [existing] = await db.select({ coverImageUrl: catalogCourses.coverImageUrl }).from(catalogCourses).where(eq(catalogCourses.slug, slug)).limit(1);
    }
    if (!existing) return jsonError("حوّل المادة إلى سجل قابل للإدارة قبل رفع الغلاف", 409);
    await putObject(objectKey, file.stream(), detectedType);
    const coverImageUrl = `r2:${objectKey}`;
    const updated = await db.update(catalogCourses).set({ coverImageUrl, updatedAt: new Date().toISOString() }).where(eq(catalogCourses.slug, slug)).returning({ slug: catalogCourses.slug });
    if (!updated.length) throw new Error("course-update-failed");
    if (existing?.coverImageUrl?.startsWith("r2:")) await deleteObject(existing.coverImageUrl.slice(3)).catch(() => undefined);
    await db.insert(auditLogs).values({ actorEmail: user?.email || "admin-api-token", action: "upload", entityType: "course_cover", entityId: slug, beforeJson: existing?.coverImageUrl || null, afterJson: JSON.stringify({ objectKey, contentType: detectedType, sizeBytes: file.size }), ipAddress: clientIp(request) });
    invalidateCatalogCache();
    return Response.json({ ok: true, coverImageUrl: `/api/covers/${slug}` }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch {
    await deleteObject(objectKey).catch(() => undefined);
    return jsonError("تعذر حفظ غلاف المادة", 500);
  }
}
