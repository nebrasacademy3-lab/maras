import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { supervisorAssignments, videoAssets } from "@/db/schema";
import { checkRateLimit, clientIp, getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";
import { getCourseCatalog } from "@/lib/catalog-store";
import { deleteObject, putObject } from "@/lib/storage";

const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-matroska", "video/x-msvideo"]);

function secretEquals(expected: string, actual: string) {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

function detectVideoType(bytes: Uint8Array) {
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "video/mp4";
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "video/webm";
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x41 && bytes[9] === 0x56 && bytes[10] === 0x49) return "video/x-msvideo";
  return "";
}

function extensionFor(type: string) {
  return ({ "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/x-matroska": "mkv", "video/x-msvideo": "avi" } as Record<string, string>)[type] || "bin";
}

export async function POST(request: Request) {
  const suppliedToken = request.headers.get("x-admin-upload-token")?.trim() || "";
  const uploadSecret = process.env.ADMIN_UPLOAD_TOKEN?.trim() || "";
  const tokenAuthorized = Boolean(uploadSecret && secretEquals(uploadSecret, suppliedToken));
  if (!tokenAuthorized && !sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);

  const user = tokenAuthorized ? null : await getSessionUser(request);
  if (!tokenAuthorized && !roleAllowed(user, ["admin", "supervisor"])) return jsonError("غير مصرح برفع الفيديو", 401);
  const identity = tokenAuthorized ? `upload-token:${clientIp(request)}` : `user:${user!.id}`;
  if (!await checkRateLimit("admin-video-upload", identity, 10, 60)) return jsonError("طلبات الرفع كثيرة. حاول بعد دقيقة.", 429);

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_VIDEO_BYTES + 2 * 1024 * 1024) return jsonError("حجم الطلب أكبر من المسموح", 413);

  let form: FormData;
  try { form = await request.formData(); } catch { return jsonError("تعذر قراءة ملف الفيديو", 400); }
  const file = form.get("file");
  const courseSlug = cleanText(form.get("courseSlug"), 120);
  const lessonId = cleanText(form.get("lessonId"), 120);
  if (!(file instanceof File)) return jsonError("اختر ملف فيديو صالحًا");
  if (file.size <= 0 || file.size > MAX_VIDEO_BYTES) return jsonError("حجم الفيديو يجب ألا يتجاوز 200 ميجابايت", 413);
  const declaredType = file.type.toLowerCase();
  if (declaredType && !ALLOWED_TYPES.has(declaredType)) return jsonError("صيغة الفيديو غير مسموحة");
  const headerBytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const detectedType = detectVideoType(headerBytes);
  const contentType = detectedType || declaredType;
  if (!ALLOWED_TYPES.has(contentType) || (declaredType && detectedType && declaredType !== detectedType && !(declaredType === "video/quicktime" && detectedType === "video/mp4"))) {
    return jsonError("محتوى الفيديو لا يطابق نوع الملف");
  }

  const course = await getCourseCatalog(courseSlug, true);
  if (!course?.units.some((unit) => unit.lessons.some((lesson) => lesson.id === lessonId))) return jsonError("تعذر مطابقة المادة أو الدرس");
  if (!tokenAuthorized && user?.role === "supervisor") {
    const assignments = await getDb().select().from(supervisorAssignments).where(and(eq(supervisorAssignments.supervisorId, user.id), eq(supervisorAssignments.active, true)));
    const mayEdit = assignments.some((assignment) => (!assignment.institutionSlug || assignment.institutionSlug === course.universitySlug) && (!assignment.specialty || assignment.specialty === course.specialty));
    if (!mayEdit) return jsonError("هذه المادة غير مسندة لهذا المشرف", 403);
  }

  const objectKey = `private/${courseSlug}/${lessonId}/${crypto.randomUUID()}.${extensionFor(contentType)}`;
  try {
    await putObject(objectKey, file.stream(), contentType);
    const now = new Date().toISOString();
    const [asset] = await getDb().insert(videoAssets).values({ courseSlug, lessonId, objectKey, contentType, sizeBytes: file.size, status: "ready", createdAt: now, updatedAt: now }).returning({ id: videoAssets.id, objectKey: videoAssets.objectKey, status: videoAssets.status });
    return Response.json({ ok: true, asset }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch {
    await deleteObject(objectKey).catch(() => undefined);
    return jsonError("تعذر حفظ الفيديو", 500);
  }
}
