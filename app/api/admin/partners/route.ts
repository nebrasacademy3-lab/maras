import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, platformPartners } from "@/db/schema";
import { cleanText, isAdminRequest, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { deleteObject, putObject } from "@/lib/storage";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const allowedTypes = new Map([["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"]]);

function imageSignature(type: string, bytes: Uint8Array) {
  if (type === "image/png") return bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a][index]);
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/webp") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}

function safeHttps(value: string) {
  if (!value) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

async function authorize(request: Request) {
  if (isAdminRequest(request)) return { actor: "admin-api-token", userId: 0 };
  if (!sameOriginRequest(request)) return null;
  const user = await getSessionUser(request);
  return roleAllowed(user, ["admin"]) ? { actor: user!.email, userId: user!.id } : null;
}

function output(row: typeof platformPartners.$inferSelect) {
  return {
    id: row.id, name: row.name, kind: row.kind, description: row.description,
    logo: row.logoObjectKey ? `/api/public/partners/${row.id}/logo` : row.logoUrl || "",
    destinationUrl: row.destinationUrl, credentialNumber: row.credentialNumber,
    verificationUrl: row.verificationUrl, rightsConfirmed: row.rightsConfirmed,
    rightsReference: row.rightsReference, status: row.status, sortOrder: row.sortOrder,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

export async function GET(request: Request) {
  const authorization = await authorize(request);
  if (!authorization) return jsonError("غير مصرح", 403);
  const rows = await getDb().select().from(platformPartners).orderBy(asc(platformPartners.sortOrder), asc(platformPartners.id));
  return Response.json({ ok: true, partners: rows.map(output) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const authorization = await authorize(request);
  if (!authorization) return jsonError("غير مصرح", 403);
  if (!await checkRateLimit("admin-partners-write", authorization.actor, 30, 60)) return jsonError("طلبات كثيرة. حاول بعد دقيقة.", 429);
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_LOGO_BYTES + 1024 * 1024) return jsonError("حجم الشعار أكبر من المسموح", 413);
  const form = await request.formData().catch(() => null);
  if (!form) return jsonError("تعذر قراءة البيانات");
  const id = Math.max(0, Math.floor(Number(form.get("id")) || 0));
  const db = getDb();
  const [before] = id ? await db.select().from(platformPartners).where(eq(platformPartners.id, id)).limit(1) : [];
  if (id && !before) return jsonError("السجل غير موجود", 404);
  const name = cleanText(form.get("name"), 140);
  const kind = cleanText(form.get("kind"), 30);
  const status = cleanText(form.get("status"), 20) || "draft";
  const description = cleanText(form.get("description"), 500);
  const destinationUrl = cleanText(form.get("destinationUrl"), 1000);
  const credentialNumber = cleanText(form.get("credentialNumber"), 180);
  const verificationUrl = cleanText(form.get("verificationUrl"), 1000);
  const logoUrl = cleanText(form.get("logoUrl"), 1000);
  const rightsConfirmed = kind === "accreditation"
    ? form.get("rightsConfirmed") === "true" || form.get("rightsConfirmed") === "on"
    : true;
  const rightsReference = cleanText(form.get("rightsReference"), 500);
  const sortOrder = Math.max(0, Math.min(10000, Math.floor(Number(form.get("sortOrder")) || 0)));
  if (name.length < 2 || !["partner", "accreditation", "payment"].includes(kind) || !["draft", "published", "hidden"].includes(status)) return jsonError("تحقق من اسم السجل ونوعه وحالته");
  if ((destinationUrl && !safeHttps(destinationUrl)) || (logoUrl && !safeHttps(logoUrl)) || (verificationUrl && !safeHttps(verificationUrl))) return jsonError("روابط الشعار والوجهة والتحقق يجب أن تبدأ بـ HTTPS");
  if (status === "published" && !rightsConfirmed) return jsonError("أكد حق استخدام الشعار قبل النشر");
  if (status === "published" && kind === "accreditation") {
    if (credentialNumber.length < 2) return jsonError("أدخل رقم الاعتماد أو الترخيص قبل النشر");
    if (rightsReference.length < 3) return jsonError("أدخل مرجع موافقة استخدام علامة الاعتماد قبل النشر");
    if (!verificationUrl || !safeHttps(verificationUrl)) return jsonError("أدخل رابط تحقق HTTPS للاعتماد أو الترخيص قبل النشر");
  }
  const file = form.get("file");
  let nextObjectKey = before?.logoObjectKey || null;
  let nextContentType = before?.logoContentType || null;
  let uploadedKey = "";
  if (file instanceof File && file.size > 0) {
    const contentType = file.type.toLowerCase();
    if (!allowedTypes.has(contentType) || file.size > MAX_LOGO_BYTES) return jsonError("ارفع شعارًا بصيغة PNG أو JPG أو WebP وبحجم لا يتجاوز 2 ميجابايت", 413);
    const header = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    if (!imageSignature(contentType, header)) return jsonError("محتوى الشعار لا يطابق نوعه أو يتضمن عناصر غير آمنة");
    uploadedKey = `partners/${crypto.randomUUID()}.${allowedTypes.get(contentType)}`;
    await putObject(uploadedKey, file.stream(), contentType);
    nextObjectKey = uploadedKey;
    nextContentType = contentType;
  }
  if (!nextObjectKey && !logoUrl && !before?.logoUrl) {
    if (uploadedKey) await deleteObject(uploadedKey).catch(() => undefined);
    return jsonError("أرفق شعارًا أو أدخل رابط صورة HTTPS");
  }
  const now = new Date().toISOString();
  const values = {
    name, kind, description, logoObjectKey: nextObjectKey,
    logoUrl: nextObjectKey ? null : logoUrl || before?.logoUrl || null,
    logoContentType: nextContentType,
    destinationUrl: destinationUrl || null, credentialNumber: credentialNumber || null,
    verificationUrl: verificationUrl || null, rightsConfirmed, rightsReference: rightsReference || null,
    status, sortOrder, createdBy: before?.createdBy || authorization.actor, updatedAt: now,
  };
  try {
    const [saved] = before
      ? await db.update(platformPartners).set(values).where(eq(platformPartners.id, before.id)).returning()
      : await db.insert(platformPartners).values({ ...values, createdAt: now }).returning();
    await db.insert(auditLogs).values({ actorEmail: authorization.actor, action: before ? "update" : "create", entityType: "platform_partner", entityId: String(saved.id), beforeJson: before ? JSON.stringify(output(before)) : null, afterJson: JSON.stringify(output(saved)), ipAddress: clientIp(request) });
    if (uploadedKey && before?.logoObjectKey && before.logoObjectKey !== uploadedKey) await deleteObject(before.logoObjectKey).catch(() => undefined);
    return Response.json({ ok: true, partner: output(saved) }, { status: before ? 200 : 201, headers: { "cache-control": "no-store" } });
  } catch {
    if (uploadedKey) await deleteObject(uploadedKey).catch(() => undefined);
    return jsonError("تعذر حفظ الشريك", 500);
  }
}

export async function DELETE(request: Request) {
  const authorization = await authorize(request);
  if (!authorization) return jsonError("غير مصرح", 403);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات غير صالحة"); }
  const id = Math.floor(Number(payload.id));
  if (!id) return jsonError("السجل غير صالح");
  const db = getDb();
  const [before] = await db.select().from(platformPartners).where(eq(platformPartners.id, id)).limit(1);
  if (!before) return jsonError("السجل غير موجود", 404);
  await db.transaction(async (tx) => {
    await tx.delete(platformPartners).where(eq(platformPartners.id, id));
    await tx.insert(auditLogs).values({ actorEmail: authorization.actor, action: "delete", entityType: "platform_partner", entityId: String(id), beforeJson: JSON.stringify(output(before)), afterJson: null, ipAddress: clientIp(request) });
  });
  if (before.logoObjectKey) await deleteObject(before.logoObjectKey).catch(() => undefined);
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
