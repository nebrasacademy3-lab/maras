import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, catalogInstitutions } from "@/db/schema";
import { checkRateLimit, clientIp, getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { cleanText, isAdminRequest, jsonError } from "@/lib/api";
import { getInstitutionCatalog } from "@/lib/catalog-store";
import { deleteObject, putObject } from "@/lib/storage";

const MAX_LOGO_BYTES = 4 * 1024 * 1024;
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
  if (!await checkRateLimit("admin-logo-upload", identity, 20, 60)) return jsonError("طلبات الرفع كثيرة. حاول بعد دقيقة.", 429);
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_LOGO_BYTES + 1 * 1024 * 1024) return jsonError("حجم الطلب أكبر من المسموح", 413);

  let form: FormData;
  try { form = await request.formData(); } catch { return jsonError("تعذر قراءة الشعار", 400); }
  const slug = cleanText(form.get("slug"), 80).toLowerCase();
  const file = form.get("file");
  const institution = await getInstitutionCatalog(slug, true);
  if (!institution) return jsonError("الجهة غير موجودة", 404);
  if (!(file instanceof File) || !allowedTypes.has(file.type.toLowerCase())) return jsonError("ارفع شعار PNG أو JPG أو WebP");
  if (file.size <= 0 || file.size > MAX_LOGO_BYTES) return jsonError("حجم الشعار يجب ألا يتجاوز 4 ميجابايت", 413);
  const declaredType = file.type.toLowerCase();
  const detectedType = detectImageType(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
  if (detectedType !== declaredType) return jsonError("محتوى الشعار لا يطابق نوع الملف");
  const extension = allowedTypes.get(detectedType)!;
  const objectKey = `logos/${slug}/${crypto.randomUUID()}.${extension}`;

  try {
    await putObject(objectKey, file.stream(), detectedType);
    const db = getDb();
    const [existing] = await db.select().from(catalogInstitutions).where(eq(catalogInstitutions.slug, slug)).limit(1);
    const now = new Date().toISOString();
    const values = {
      slug,
      name: existing?.name || institution.name,
      nameEn: existing?.nameEn || institution.nameEn,
      region: existing?.region || institution.region,
      type: existing?.type || institution.type,
      logoUrl: `r2:${objectKey}`,
      domain: existing?.domain || institution.domain || null,
      status: existing?.status || "published",
      sortOrder: existing?.sortOrder || 0,
      updatedAt: now,
    };
    await db.insert(catalogInstitutions).values({ ...values, createdAt: existing?.createdAt || now }).onConflictDoUpdate({ target: catalogInstitutions.slug, set: values });
    await db.insert(auditLogs).values({ actorEmail: user?.email || "admin-api-token", action: "upload", entityType: "institution_logo", entityId: slug, beforeJson: existing?.logoUrl || null, afterJson: JSON.stringify({ objectKey, contentType: detectedType, sizeBytes: file.size }), ipAddress: clientIp(request) });
    return Response.json({ ok: true, logoUrl: `/api/logos/${slug}` }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch {
    await deleteObject(objectKey).catch(() => undefined);
    return jsonError("تعذر حفظ الشعار", 500);
  }
}
