import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, platformPartners } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { AdminMfaError, requireAdminStepUp } from "@/lib/admin-mfa";
import { deleteObject, putObject } from "@/lib/storage";
import { readBoundedFormData, readBoundedJsonObject, RequestBodyTooLargeError } from "@/lib/request-body";
import { PartnerChangeError, partnerHttps, partnerRevision, validatePublishedPartner } from "@/lib/partner-policy";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const allowedTypes = new Map([["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"]]);
const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
function imageSignature(type: string, bytes: Uint8Array) {
  if (type === "image/png") return bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a][index]);
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/webp") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return false;
}
async function authorize(request: Request, mutation = false) {
  if (mutation && !sameOriginRequest(request)) throw new PartnerChangeError("مصدر الطلب غير صالح", 403);
  const user = await getSessionUser(request);
  if (!user || !await hasPermission(user, "content.manage") || request.method === "DELETE" && !await hasPermission(user, "records.delete")) throw new PartnerChangeError("لا تملك صلاحية هذا الإجراء", 403, "PARTNER_PERMISSION_DENIED");
  if (!await checkRateLimit(mutation ? "admin-partners-write" : "admin-partners-read", String(user.id), mutation ? 30 : 90, 60)) throw new PartnerChangeError("طلبات كثيرة؛ حاول لاحقًا", 429);
  if (mutation) await requireAdminStepUp(request, user);
  return user;
}
function errorResponse(error: unknown) {
  if (error instanceof PartnerChangeError) return jsonError(error.message, error.status, error.code);
  if (error instanceof AdminMfaError) return jsonError(error.message, error.status, error.code);
  if (error instanceof RequestBodyTooLargeError) return jsonError("الطلب أكبر من الحد المسموح", 413);
  if (error instanceof SyntaxError || error instanceof TypeError) return jsonError("بيانات الطلب غير صالحة", 400);
  return jsonError("تعذر حفظ التغيير بأمان؛ حدّث السجل قبل إعادة المحاولة", 503);
}
function output(row: typeof platformPartners.$inferSelect) {
  return { id: row.id, name: row.name, kind: row.kind, description: row.description, logo: row.logoObjectKey ? `/api/public/partners/${row.id}/logo` : row.logoUrl || "", destinationUrl: row.destinationUrl, credentialNumber: row.credentialNumber, verificationUrl: row.verificationUrl, rightsConfirmed: row.rightsConfirmed, rightsReference: row.rightsReference, status: row.status, sortOrder: row.sortOrder, createdAt: row.createdAt, updatedAt: row.updatedAt };
}
export async function GET(request: Request) {
  try { await authorize(request); const rows = await getDb().select().from(platformPartners).orderBy(asc(platformPartners.sortOrder), asc(platformPartners.id)); return Response.json({ ok: true, partners: rows.map(output) }, { headers }); } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  let uploadedKey = "", committed = false;
  try {
    const actor = await authorize(request, true);
    const form = await readBoundedFormData(request, MAX_LOGO_BYTES + 512 * 1024);
    const idText = form.get("id"); const id = idText === null || idText === "" ? 0 : Number(idText);
    if (!Number.isSafeInteger(id) || id < 0) throw new PartnerChangeError("معرف السجل غير صالح");
    const expected = form.get("expectedUpdatedAt");
    const name = cleanText(form.get("name"), 140), kind = cleanText(form.get("kind"), 30), status = cleanText(form.get("status"), 20) || "draft";
    const destinationUrl = cleanText(form.get("destinationUrl"), 1000), verificationUrl = cleanText(form.get("verificationUrl"), 1000), logoUrl = cleanText(form.get("logoUrl"), 1000);
    const fields = { name, kind, status, description: cleanText(form.get("description"), 500), destinationUrl: destinationUrl || null, credentialNumber: cleanText(form.get("credentialNumber"), 180) || null, verificationUrl: verificationUrl || null, rightsConfirmed: ["true", "on"].includes(String(form.get("rightsConfirmed"))), rightsReference: cleanText(form.get("rightsReference"), 500) || null, sortOrder: Math.max(0, Math.min(10000, Math.floor(Number(form.get("sortOrder")) || 0))) };
    if (name.length < 2 || !["partner", "accreditation", "payment"].includes(kind) || !["draft", "published", "hidden"].includes(status)) throw new PartnerChangeError("تحقق من الاسم ونوع السجل وحالته");
    if (![destinationUrl, verificationUrl, logoUrl].every(partnerHttps)) throw new PartnerChangeError("استخدم روابط HTTPS عامة دون حساب أو كلمة مرور أو عنوان شبكة داخلي");
    validatePublishedPartner(fields);
    const [initial] = id ? await getDb().select().from(platformPartners).where(eq(platformPartners.id, id)).limit(1) : [];
    partnerRevision(initial, expected, id);
    const file = form.get("file"); let contentType: string | null = null;
    if (file instanceof File && file.size > 0) {
      contentType = file.type.toLowerCase();
      if (!allowedTypes.has(contentType) || file.size > MAX_LOGO_BYTES || !imageSignature(contentType, new Uint8Array(await file.slice(0, 64).arrayBuffer()))) throw new PartnerChangeError("ارفع صورة PNG أو JPG أو WebP صحيحة لا تتجاوز 2 MB", 422);
      uploadedKey = `partners/${randomUUID()}.${allowedTypes.get(contentType)}`; await putObject(uploadedKey, file.stream(), contentType);
    }
    // Recheck the same actor after storage I/O; a superseded account cannot finish the old action.
    const still = await getSessionUser(request);
    if (!still || still.id !== actor.id || !await hasPermission(still, "content.manage")) throw new PartnerChangeError("تغيّرت صلاحية الجلسة؛ لم يُحفظ التعديل", 403);
    const saved = await getDb().transaction(async tx => {
      const [before] = id ? await tx.select().from(platformPartners).where(eq(platformPartners.id, id)).for("update") : [];
      partnerRevision(before, expected, id);
      const nextObjectKey = uploadedKey || (logoUrl ? null : before?.logoObjectKey || null);
      const nextUrl = nextObjectKey ? null : logoUrl || before?.logoUrl || null;
      if (!nextObjectKey && !nextUrl) throw new PartnerChangeError("أرفق شعارًا أو رابط صورة صالحًا");
      const now = new Date(Math.max(Date.now(), Date.parse(before?.updatedAt || "") + 1 || 0)).toISOString();
      const values = { ...fields, logoObjectKey: nextObjectKey, logoContentType: nextObjectKey ? contentType || before?.logoContentType || null : null, logoUrl: nextUrl, createdBy: before?.createdBy || actor.email, updatedAt: now };
      const [row] = before ? await tx.update(platformPartners).set(values).where(eq(platformPartners.id, before.id)).returning() : await tx.insert(platformPartners).values({ ...values, createdAt: now }).returning();
      await tx.insert(auditLogs).values({ actorEmail: actor.email, action: before ? "update" : "create", entityType: "platform_partner", entityId: String(row.id), beforeJson: before ? JSON.stringify(output(before)) : null, afterJson: JSON.stringify(output(row)), ipAddress: clientIp(request), createdAt: now });
      return { row, obsolete: before?.logoObjectKey && before.logoObjectKey !== nextObjectKey ? before.logoObjectKey : null };
    });
    committed = true;
    if (saved.obsolete) await deleteObject(saved.obsolete).catch(() => undefined);
    return Response.json({ ok: true, partner: output(saved.row) }, { status: id ? 200 : 201, headers });
  } catch (error) { return errorResponse(error); }
  finally { if (uploadedKey && !committed) await deleteObject(uploadedKey).catch(() => undefined); }
}
export async function DELETE(request: Request) {
  try {
    const actor = await authorize(request, true); const payload = await readBoundedJsonObject(request, 2048), id = Number(payload.id);
    if (!Number.isSafeInteger(id) || id < 1) throw new PartnerChangeError("معرف السجل غير صالح");
    const before = await getDb().transaction(async tx => {
      const [row] = await tx.select().from(platformPartners).where(eq(platformPartners.id, id)).for("update"); partnerRevision(row, payload.expectedUpdatedAt, id);
      await tx.delete(platformPartners).where(eq(platformPartners.id, id));
      await tx.insert(auditLogs).values({ actorEmail: actor.email, action: "delete", entityType: "platform_partner", entityId: String(id), beforeJson: JSON.stringify(output(row)), ipAddress: clientIp(request) });
      return row;
    });
    if (before.logoObjectKey) await deleteObject(before.logoObjectKey).catch(() => undefined);
    return Response.json({ ok: true }, { headers });
  } catch (error) { return errorResponse(error); }
}
