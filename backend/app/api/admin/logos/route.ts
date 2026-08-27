import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, catalogInstitutions } from "@/db/schema";
import { cleanText, isAdminRequest, jsonError } from "@/lib/api";
import { getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { getInstitutionCatalog } from "@/lib/catalog-store";
import { putObject } from "@/lib/storage";

const allowedTypes = new Map([["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"]]);

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!roleAllowed(user, ["admin"]) && !isAdminRequest(request)) return jsonError("غير مصرح", 403);
  const form = await request.formData();
  const slug = cleanText(form.get("slug"), 80).toLowerCase();
  const file = form.get("file");
  const institution = await getInstitutionCatalog(slug, true);
  if (!institution) return jsonError("الجهة غير موجودة", 404);
  if (!(file instanceof File) || !allowedTypes.has(file.type)) return jsonError("ارفع شعار PNG أو JPG أو WebP");
  if (file.size <= 0 || file.size > 4 * 1024 * 1024) return jsonError("حجم الشعار يجب ألا يتجاوز 4 ميجابايت", 413);
  const extension = allowedTypes.get(file.type)!;
  const objectKey = `logos/${slug}/${crypto.randomUUID()}.${extension}`;
  await putObject(objectKey, file.stream(), file.type);
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
  await db.insert(auditLogs).values({ actorEmail: user?.email || "admin-api-token", action: "upload", entityType: "institution_logo", entityId: slug, beforeJson: existing?.logoUrl || null, afterJson: JSON.stringify({ objectKey, contentType: file.type, sizeBytes: file.size }) });
  return Response.json({ ok: true, logoUrl: `/api/logos/${slug}` }, { status: 201 });
}

