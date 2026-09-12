import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, catalogCourses, catalogInstitutions, catalogSpecialties, courseResources } from "@/db/schema";
import { cleanText, isAdminRequest, jsonError } from "@/lib/api";
import { AdminMfaError, requireAdminStepUp } from "@/lib/admin-mfa";
import { checkRateLimit, clientIp, getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { scanColumns, scanStoredFile } from "@/lib/file-security";
import { deleteStoredMultipartFiles, parseStoredMultipart } from "@/lib/multipart-upload";
import { ADMIN_PERMISSIONS, hasPermission } from "@/lib/permissions";
import { deleteObject } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const SAFE_FILE_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/csv",
]);

const EXTENSIONS_BY_TYPE: Readonly<Record<string, ReadonlySet<string>>> = {
  "application/pdf": new Set(["pdf"]),
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": new Set(["docx"]),
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": new Set(["pptx"]),
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": new Set(["xlsx"]),
  "image/png": new Set(["png"]),
  "image/jpeg": new Set(["jpg", "jpeg"]),
  "image/webp": new Set(["webp"]),
  "text/plain": new Set(["txt"]),
  "text/csv": new Set(["csv"]),
};

class ResourceInputError extends Error {}

function validFileSignature(contentType: string, bytes: Uint8Array) {
  if (contentType === "application/pdf") return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  if (contentType === "image/png") return bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  if (contentType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/webp") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (contentType.includes("openxmlformats")) return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (contentType === "text/plain" || contentType === "text/csv") return bytes.length > 0 && !bytes.includes(0);
  return false;
}

function hasExpectedExtension(originalName: string, contentType: string) {
  const extension = originalName.split(".").pop()?.toLowerCase() || "";
  return EXTENSIONS_BY_TYPE[contentType]?.has(extension) === true;
}

function safeSlug(value: unknown) {
  const slug = cleanText(value, 120).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(slug)) throw new ResourceInputError("معرّف المادة غير صالح");
  return slug;
}

function integer(value: unknown, label: string, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new ResourceInputError(`${label} غير صالح`);
  return parsed;
}

function booleanValue(value: unknown) {
  return value === true || value === "true" || value === "on" || value === "1";
}

function resourcePayload(row: typeof courseResources.$inferSelect) {
  return {
    id: row.id,
    courseSlug: row.courseSlug,
    title: row.title,
    description: row.description,
    originalName: row.originalName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    studentVisible: row.studentVisible,
    status: row.status,
    sortOrder: row.sortOrder,
    scanStatus: row.scanStatus,
    scanProvider: row.scanProvider,
    scannedAt: row.scannedAt,
    scanError: row.scanError,
    quarantineReason: row.quarantineReason,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function json(value: unknown) {
  try { return JSON.stringify(value); } catch { return "{}"; }
}

async function authorize(request: Request) {
  const user = await getSessionUser(request);
  if (roleAllowed(user, ["admin"])) return { actor: user!.email, identity: `user:${user!.id}`, machine: false, user: user! };
  if (isAdminRequest(request)) return { actor: "admin-api-token", identity: `machine:${clientIp(request)}`, machine: true, user: null };
  return null;
}

async function guard(request: Request, mutation: boolean) {
  const authorization = await authorize(request);
  if (!authorization) return { authorization: null, response: jsonError("غير مصرح", 403) };
  if (!authorization.machine && !sameOriginRequest(request)) return { authorization: null, response: jsonError("تعذر التحقق من مصدر الطلب", 403) };
  const allowed = await checkRateLimit(mutation ? "admin-course-resources-write" : "admin-course-resources-read", authorization.identity, mutation ? 40 : 90, 60);
  if (!allowed) return { authorization: null, response: jsonError("طلبات إدارية كثيرة. حاول بعد دقيقة.", 429) };
  return { authorization, response: null };
}

async function requestPayload(request: Request) {
  try {
    const payload = await request.json() as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error();
    return payload as Record<string, unknown>;
  } catch {
    throw new ResourceInputError("بيانات الملف غير صالحة");
  }
}

export async function GET(request: Request) {
  const guarded = await guard(request, false);
  if (guarded.response) return guarded.response;
  const selectedCourse = cleanText(new URL(request.url).searchParams.get("course"), 120).toLowerCase();
  if (selectedCourse && !/^[a-z0-9][a-z0-9._-]*$/.test(selectedCourse)) return jsonError("معرّف المادة غير صالح");
  const db = getDb();
  const [courseRows, institutionRows, specialtyRows, resourceRows] = await Promise.all([
    db.select().from(catalogCourses).orderBy(asc(catalogCourses.institutionSlug), asc(catalogCourses.specialtySlug), asc(catalogCourses.title)),
    db.select({ slug: catalogInstitutions.slug, name: catalogInstitutions.name }).from(catalogInstitutions),
    db.select({ slug: catalogSpecialties.slug, name: catalogSpecialties.name }).from(catalogSpecialties),
    selectedCourse
      ? db.select().from(courseResources).where(eq(courseResources.courseSlug, selectedCourse)).orderBy(asc(courseResources.sortOrder), asc(courseResources.title), asc(courseResources.id))
      : Promise.resolve([] as Array<typeof courseResources.$inferSelect>),
  ]);
  const institutionNames = new Map(institutionRows.map((row) => [row.slug, row.name]));
  const specialtyNames = new Map(specialtyRows.map((row) => [row.slug, row.name]));
  return Response.json({
    ok: true,
    courses: courseRows.map((course) => ({
      slug: course.slug,
      title: course.title,
      code: course.code || "",
      institutionSlug: course.institutionSlug,
      institution: institutionNames.get(course.institutionSlug) || course.institutionSlug,
      specialtySlug: course.specialtySlug,
      specialty: specialtyNames.get(course.specialtySlug) || course.specialtySlug,
      audienceScope: course.audienceScope === "institution" ? "institution" : "specialty",
      status: course.status,
    })),
    resources: resourceRows.map(resourcePayload),
    limits: { maxFileBytes: MAX_FILE_BYTES, maxFileMegabytes: 25 },
  }, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

export async function POST(request: Request) {
  const guarded = await guard(request, true);
  if (guarded.response || !guarded.authorization) return guarded.response;
  let courseSlug: string;
  try { courseSlug = safeSlug(new URL(request.url).searchParams.get("course")); }
  catch (error) { return jsonError(error instanceof Error ? error.message : "معرّف المادة غير صالح"); }
  const db = getDb();
  const [course] = await db.select({ slug: catalogCourses.slug }).from(catalogCourses).where(eq(catalogCourses.slug, courseSlug)).limit(1);
  if (!course) return jsonError("المادة غير موجودة", 404);

  let parsed: Awaited<ReturnType<typeof parseStoredMultipart>>;
  try {
    parsed = await parseStoredMultipart(request, {
      fieldName: "file",
      maxFiles: 1,
      maxFileBytes: MAX_FILE_BYTES,
      maxTotalBytes: MAX_FILE_BYTES,
      objectPrefix: `course-resources/${courseSlug}`,
      allowedTypes: SAFE_FILE_TYPES,
      validSignature: validFileSignature,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "تعذر رفع الملف", 413);
  }
  const file = parsed.files[0];
  if (!file) return jsonError("اختر ملفًا واحدًا للرفع");
  if (!hasExpectedExtension(file.originalName, file.contentType)) {
    await deleteStoredMultipartFiles(parsed.files);
    return jsonError("امتداد الملف لا يطابق نوعه الفعلي", 422);
  }
  const fallbackTitle = file.originalName.replace(/\.[^.]+$/, "").trim().slice(0, 160) || "ملف المادة";
  const title = cleanText(parsed.fields.title, 160) || fallbackTitle;
  const description = cleanText(parsed.fields.description, 1000);
  const sortOrder = Math.max(0, Math.min(10000, Math.floor(Number(parsed.fields.sortOrder) || 0)));
  const requestedVisibility = booleanValue(parsed.fields.studentVisible);
  const scan = await scanStoredFile(file);
  if (scan.status === "quarantined") {
    await deleteStoredMultipartFiles(parsed.files);
    return jsonError("رُفض الملف بعد الفحص الأمني ولن يتم حفظه", 422);
  }
  const now = new Date().toISOString();
  try {
    const [created] = await db.transaction(async (tx) => {
      const [row] = await tx.insert(courseResources).values({
        courseSlug,
        title,
        description,
        objectKey: file.objectKey,
        originalName: file.originalName,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        studentVisible: requestedVisibility && scan.status === "clean",
        status: "active",
        sortOrder,
        ...scanColumns(scan),
        createdBy: guarded.authorization.actor,
        createdAt: now,
        updatedAt: now,
      }).returning();
      await tx.insert(auditLogs).values({ actorEmail: guarded.authorization.actor, action: "create", entityType: "course_resource", entityId: String(row.id), beforeJson: null, afterJson: json(resourcePayload(row)), ipAddress: clientIp(request), createdAt: now });
      return [row];
    });
    return Response.json({ ok: true, resource: resourcePayload(created), visibilityDeferred: requestedVisibility && scan.status !== "clean" }, { status: 201, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch {
    await deleteStoredMultipartFiles(parsed.files);
    return jsonError("تعذر حفظ ملف المادة", 500);
  }
}

export async function PATCH(request: Request) {
  const guarded = await guard(request, true);
  if (guarded.response || !guarded.authorization) return guarded.response;
  try {
    const payload = await requestPayload(request);
    const action = cleanText(payload.action, 30);
    const db = getDb();
    const now = new Date().toISOString();
    if (action === "scope") {
      const courseSlug = safeSlug(payload.courseSlug);
      const audienceScope = cleanText(payload.audienceScope, 30);
      if (audienceScope !== "specialty" && audienceScope !== "institution") throw new ResourceInputError("نطاق ظهور المادة غير صالح");
      const updated = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT slug FROM catalog_courses WHERE slug = ${courseSlug} FOR UPDATE`);
        const [before] = await tx.select().from(catalogCourses).where(eq(catalogCourses.slug, courseSlug)).limit(1);
        if (!before) throw new ResourceInputError("المادة غير موجودة");
        const [after] = await tx.update(catalogCourses).set({ audienceScope, updatedAt: now }).where(eq(catalogCourses.slug, courseSlug)).returning();
        await tx.insert(auditLogs).values({ actorEmail: guarded.authorization.actor, action: "update_audience_scope", entityType: "catalog_course", entityId: courseSlug, beforeJson: json({ audienceScope: before.audienceScope }), afterJson: json({ audienceScope: after.audienceScope }), ipAddress: clientIp(request), createdAt: now });
        return after;
      });
      return Response.json({ ok: true, course: { slug: updated.slug, audienceScope: updated.audienceScope } }, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    }

    const id = integer(payload.id, "معرّف الملف", 1, 2_147_483_647);
    const [before] = await db.select().from(courseResources).where(eq(courseResources.id, id)).limit(1);
    if (!before) return jsonError("الملف غير موجود", 404);
    if (action === "rescan") {
      const scan = await scanStoredFile(before);
      const values = {
        ...scanColumns(scan),
        studentVisible: scan.status === "clean" ? before.studentVisible : false,
        status: scan.status === "quarantined" ? "archived" : before.status,
        updatedAt: now,
      };
      const [after] = await db.update(courseResources).set(values).where(eq(courseResources.id, id)).returning();
      await db.insert(auditLogs).values({ actorEmail: guarded.authorization.actor, action: "rescan", entityType: "course_resource", entityId: String(id), beforeJson: json(resourcePayload(before)), afterJson: json(resourcePayload(after)), ipAddress: clientIp(request), createdAt: now });
      return Response.json({ ok: true, resource: resourcePayload(after) }, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    }
    if (action !== "update") throw new ResourceInputError("الإجراء المطلوب غير صالح");
    const title = cleanText(payload.title, 160);
    if (title.length < 2) throw new ResourceInputError("اسم الملف مطلوب");
    const description = cleanText(payload.description, 1000);
    const status = cleanText(payload.status, 20);
    if (status !== "active" && status !== "archived") throw new ResourceInputError("حالة الملف غير صالحة");
    const studentVisible = booleanValue(payload.studentVisible);
    if (studentVisible && before.scanStatus !== "clean") throw new ResourceInputError("لا يمكن إظهار الملف للطلاب قبل اجتياز الفحص الأمني");
    if (studentVisible && status !== "active") throw new ResourceInputError("لا يمكن إظهار ملف مؤرشف للطلاب");
    const sortOrder = integer(payload.sortOrder, "ترتيب الملف", 0, 10000);
    const [after] = await db.update(courseResources).set({ title, description, status, studentVisible, sortOrder, updatedAt: now }).where(eq(courseResources.id, id)).returning();
    await db.insert(auditLogs).values({ actorEmail: guarded.authorization.actor, action: "update", entityType: "course_resource", entityId: String(id), beforeJson: json(resourcePayload(before)), afterJson: json(resourcePayload(after)), ipAddress: clientIp(request), createdAt: now });
    return Response.json({ ok: true, resource: resourcePayload(after) }, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch (error) {
    if (error instanceof ResourceInputError) return jsonError(error.message, error.message === "المادة غير موجودة" ? 404 : 400);
    return jsonError("تعذر تحديث ملف المادة", 500);
  }
}

export async function DELETE(request: Request) {
  const guarded = await guard(request, true);
  if (guarded.response || !guarded.authorization) return guarded.response;
  if (guarded.authorization.machine || !guarded.authorization.user || !await hasPermission(guarded.authorization.user, ADMIN_PERMISSIONS.RECORDS_DELETE)) return jsonError("غير مصرح بحذف ملفات المواد", 403);
  try {
    await requireAdminStepUp(request, guarded.authorization.user);
  } catch (error) {
    if (error instanceof AdminMfaError) return Response.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    throw error;
  }
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return jsonError("معرّف الملف غير صالح");
  const db = getDb();
  const [before] = await db.select().from(courseResources).where(eq(courseResources.id, id)).limit(1);
  if (!before) return jsonError("الملف غير موجود", 404);
  const now = new Date().toISOString();
  try {
    await db.transaction(async (tx) => {
      await tx.delete(courseResources).where(eq(courseResources.id, id));
      await tx.insert(auditLogs).values({ actorEmail: guarded.authorization.actor, action: "delete", entityType: "course_resource", entityId: String(id), beforeJson: json(resourcePayload(before)), afterJson: null, ipAddress: clientIp(request), createdAt: now });
    });
    await deleteObject(before.objectKey).catch(async (error) => {
      await db.insert(auditLogs).values({ actorEmail: guarded.authorization.actor, action: "storage_delete_failed", entityType: "course_resource", entityId: String(id), beforeJson: null, afterJson: json({ error: error instanceof Error ? error.message.slice(0, 300) : "storage_delete_failed" }), ipAddress: clientIp(request), createdAt: new Date().toISOString() });
    });
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch {
    return jsonError("تعذر حذف ملف المادة", 500);
  }
}
