import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, courseBundleItems, courseBundles, orders } from "@/db/schema";
import { cleanText, isAdminRequest, isUniqueConstraintError, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { AdminMfaError, requireAdminStepUp } from "@/lib/admin-mfa";
import { getCoursesCatalog } from "@/lib/catalog-store";
import type { BundleDiscountType } from "@/lib/course-bundles";
import { toMinorUnits } from "@/lib/finance";
import { ADMIN_PERMISSIONS, hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type BundleInput = {
  slug: string;
  title: string;
  description: string;
  institutionSlug: string | null;
  specialtySlug: string | null;
  discountType: BundleDiscountType;
  discountValue: number;
  status: "draft" | "published" | "archived";
  featured: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  courseSlugs: string[];
};

class BundleInputError extends Error {}
class BundleConflictError extends Error {}

async function authorize(request: Request) {
  const user = await getSessionUser(request);
  if (roleAllowed(user, ["admin"])) return { actor: user!.email, identity: `user:${user!.id}`, machine: false, user: user! };
  if (isAdminRequest(request)) return { actor: "admin-api-token", identity: `machine:${clientIp(request)}`, machine: true, user: null };
  return null;
}

function json(value: unknown) {
  try { return JSON.stringify(value); } catch { return "{}"; }
}

function requiredSlug(value: unknown, label: string, max = 120) {
  const slug = cleanText(value, max).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(slug)) throw new BundleInputError(`${label} غير صالح`);
  return slug;
}

function optionalSlug(value: unknown, label: string) {
  const slug = cleanText(value, 120).toLowerCase();
  return slug ? requiredSlug(slug, label) : null;
}

function optionalDate(value: unknown, label: string) {
  const text = cleanText(value, 80);
  if (!text) return null;
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) throw new BundleInputError(`${label} غير صالح`);
  return new Date(timestamp).toISOString();
}

async function bundleInput(payload: Record<string, unknown>): Promise<BundleInput> {
  const slug = requiredSlug(payload.slug, "معرّف الباقة");
  const title = cleanText(payload.title, 120);
  if (title.length < 2) throw new BundleInputError("اسم الباقة مطلوب");
  const description = cleanText(payload.description, 1_000);
  const institutionSlug = optionalSlug(payload.institutionSlug, "معرّف الجامعة");
  const specialtySlug = optionalSlug(payload.specialtySlug, "معرّف التخصص");
  const discountType = cleanText(payload.discountType, 20) as BundleDiscountType;
  if (discountType !== "percent" && discountType !== "fixed") throw new BundleInputError("نوع الخصم يجب أن يكون نسبة أو مبلغًا ثابتًا");
  const discountValue = typeof payload.discountValue === "number" ? payload.discountValue : Number(payload.discountValue);
  if (!Number.isFinite(discountValue) || discountValue <= 0) throw new BundleInputError("قيمة الخصم يجب أن تكون أكبر من صفر");
  if (discountType === "percent" && discountValue > 95) throw new BundleInputError("نسبة الخصم لا يمكن أن تتجاوز 95٪");
  const status = cleanText(payload.status, 20) as BundleInput["status"];
  if (!(["draft", "published", "archived"] as string[]).includes(status)) throw new BundleInputError("حالة الباقة غير صالحة");
  if (typeof payload.featured !== "boolean") throw new BundleInputError("قيمة إبراز الباقة غير صالحة");
  const startsAt = optionalDate(payload.startsAt, "تاريخ بدء الباقة");
  const expiresAt = optionalDate(payload.expiresAt, "تاريخ انتهاء الباقة");
  if (startsAt && expiresAt && Date.parse(startsAt) >= Date.parse(expiresAt)) throw new BundleInputError("تاريخ انتهاء الباقة يجب أن يكون بعد تاريخ البدء");
  if (!Array.isArray(payload.courseSlugs)) throw new BundleInputError("مواد الباقة مطلوبة");
  const courseSlugs = [...new Set(payload.courseSlugs.map((value) => requiredSlug(value, "معرّف المادة")))];
  if (courseSlugs.length < 2 || courseSlugs.length > 30) throw new BundleInputError("يجب أن تحتوي الباقة على مادتين إلى 30 مادة مختلفة");

  const catalog = await getCoursesCatalog(true);
  const catalogBySlug = new Map(catalog.map((course) => [course.slug, course]));
  const missing = courseSlugs.filter((courseSlug) => !catalogBySlug.has(courseSlug));
  if (missing.length) throw new BundleInputError(`مواد غير موجودة: ${missing.join("، ")}`);
  const subtotalMinor = courseSlugs.reduce((sum, courseSlug) => sum + toMinorUnits(catalogBySlug.get(courseSlug)?.price || 0), 0);
  if (discountType === "fixed" && toMinorUnits(discountValue) >= subtotalMinor) throw new BundleInputError("الخصم الثابت يجب أن يكون أقل من إجمالي أسعار مواد الباقة");
  if (status === "published") {
    const publicCatalog = await getCoursesCatalog();
    const purchasable = new Set(publicCatalog.filter((course) => course.availableForPurchase).map((course) => course.slug));
    const unavailable = courseSlugs.filter((courseSlug) => !purchasable.has(courseSlug));
    if (unavailable.length) throw new BundleInputError(`لا يمكن نشر الباقة قبل جاهزية ونشر موادها: ${unavailable.join("، ")}`);
  }
  return { slug, title, description, institutionSlug, specialtySlug, discountType, discountValue, status, featured: payload.featured, startsAt, expiresAt, courseSlugs };
}

function bundleValues(input: BundleInput, updatedAt: string) {
  return {
    slug: input.slug,
    title: input.title,
    description: input.description,
    institutionSlug: input.institutionSlug,
    specialtySlug: input.specialtySlug,
    discountType: input.discountType,
    discountValue: input.discountValue,
    status: input.status,
    featured: input.featured,
    startsAt: input.startsAt,
    expiresAt: input.expiresAt,
    updatedAt,
  };
}

async function requestPayload(request: Request) {
  try {
    const payload = await request.json() as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error();
    return payload as Record<string, unknown>;
  } catch {
    throw new BundleInputError("بيانات الباقة غير صالحة");
  }
}

async function guard(request: Request, mutation: boolean) {
  const authorization = await authorize(request);
  if (!authorization) return { response: jsonError("غير مصرح", 403), authorization: null };
  if (mutation && !authorization.machine && !sameOriginRequest(request)) return { response: jsonError("تعذر التحقق من مصدر الطلب", 403), authorization: null };
  const allowed = await checkRateLimit(mutation ? "admin-bundles-write" : "admin-bundles-read", authorization.identity, mutation ? 30 : 60, 60);
  if (!allowed) return { response: jsonError("طلبات إدارية كثيرة. حاول بعد دقيقة.", 429), authorization: null };
  return { response: null, authorization };
}

export async function GET(request: Request) {
  const guarded = await guard(request, false);
  if (guarded.response) return guarded.response;
  const db = getDb();
  const [bundles, items, catalog] = await Promise.all([
    db.select().from(courseBundles).orderBy(asc(courseBundles.title)),
    db.select().from(courseBundleItems).orderBy(asc(courseBundleItems.bundleId), asc(courseBundleItems.position), asc(courseBundleItems.id)),
    getCoursesCatalog(true),
  ]);
  const courseBySlug = new Map(catalog.map((course) => [course.slug, { slug: course.slug, title: course.title, price: course.price, status: course.availableForPurchase ? "ready" : "preparing" }]));
  const itemsByBundle = new Map<number, typeof items>();
  for (const item of items) {
    const bucket = itemsByBundle.get(item.bundleId) || [];
    bucket.push(item);
    itemsByBundle.set(item.bundleId, bucket);
  }
  return Response.json({
    ok: true,
    catalog: catalog.map((course) => ({
      slug: course.slug,
      title: course.title,
      university: course.university,
      universitySlug: course.universitySlug,
      specialty: course.specialty,
      specialtySlug: course.specialtySlug || "",
      price: course.price,
      availableForPurchase: Boolean(course.availableForPurchase),
    })),
    bundles: bundles.map((bundle) => ({
      ...bundle,
      courseSlugs: (itemsByBundle.get(bundle.id) || []).map((item) => item.courseSlug),
      courses: (itemsByBundle.get(bundle.id) || []).map((item) => courseBySlug.get(item.courseSlug) || { slug: item.courseSlug, title: item.courseSlug, price: 0, status: "missing" }),
    })),
  }, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

export async function POST(request: Request) {
  const guarded = await guard(request, true);
  if (guarded.response || !guarded.authorization) return guarded.response;
  try {
    const input = await bundleInput(await requestPayload(request));
    const now = new Date().toISOString();
    const created = await getDb().transaction(async (tx) => {
      const [bundle] = await tx.insert(courseBundles).values({ ...bundleValues(input, now), createdAt: now }).returning();
      await tx.insert(courseBundleItems).values(input.courseSlugs.map((courseSlug, position) => ({ bundleId: bundle.id, courseSlug, position, createdAt: now })));
      const snapshot = { ...bundle, courseSlugs: input.courseSlugs };
      await tx.insert(auditLogs).values({ actorEmail: guarded.authorization.actor, action: "create", entityType: "course_bundle", entityId: input.slug, beforeJson: null, afterJson: json(snapshot), ipAddress: clientIp(request), createdAt: now });
      return snapshot;
    });
    return Response.json({ ok: true, bundle: created }, { status: 201, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch (error) {
    if (error instanceof BundleInputError) return jsonError(error.message, 400);
    if (isUniqueConstraintError(error)) return jsonError("معرّف الباقة مستخدم مسبقًا", 409);
    return jsonError("تعذر إنشاء الباقة", 500);
  }
}

export async function PATCH(request: Request) {
  const guarded = await guard(request, true);
  if (guarded.response || !guarded.authorization) return guarded.response;
  try {
    const payload = await requestPayload(request);
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) throw new BundleInputError("معرّف سجل الباقة غير صالح");
    const input = await bundleInput(payload);
    const now = new Date().toISOString();
    const updated = await getDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM course_bundles WHERE id = ${id} FOR UPDATE`);
      const [beforeBundle] = await tx.select().from(courseBundles).where(eq(courseBundles.id, id)).limit(1);
      if (!beforeBundle) throw new BundleInputError("الباقة غير موجودة");
      const beforeItems = await tx.select().from(courseBundleItems).where(eq(courseBundleItems.bundleId, id)).orderBy(asc(courseBundleItems.position));
      const before = { ...beforeBundle, courseSlugs: beforeItems.map((item) => item.courseSlug) };
      const [bundle] = await tx.update(courseBundles).set(bundleValues(input, now)).where(eq(courseBundles.id, id)).returning();
      await tx.delete(courseBundleItems).where(eq(courseBundleItems.bundleId, id));
      await tx.insert(courseBundleItems).values(input.courseSlugs.map((courseSlug, position) => ({ bundleId: id, courseSlug, position, createdAt: now })));
      const after = { ...bundle, courseSlugs: input.courseSlugs };
      await tx.insert(auditLogs).values({ actorEmail: guarded.authorization.actor, action: "update", entityType: "course_bundle", entityId: input.slug, beforeJson: json(before), afterJson: json(after), ipAddress: clientIp(request), createdAt: now });
      return after;
    });
    return Response.json({ ok: true, bundle: updated }, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch (error) {
    if (error instanceof BundleInputError) return jsonError(error.message, error.message === "الباقة غير موجودة" ? 404 : 400);
    if (isUniqueConstraintError(error)) return jsonError("معرّف الباقة مستخدم مسبقًا", 409);
    return jsonError("تعذر تحديث الباقة", 500);
  }
}

export async function DELETE(request: Request) {
  const guarded = await guard(request, true);
  if (guarded.response || !guarded.authorization) return guarded.response;
  if (guarded.authorization.machine || !guarded.authorization.user || !await hasPermission(guarded.authorization.user, ADMIN_PERMISSIONS.RECORDS_DELETE)) return jsonError("غير مصرح بحذف الباقات", 403);
  try {
    await requireAdminStepUp(request, guarded.authorization.user);
  } catch (error) {
    if (error instanceof AdminMfaError) return Response.json({ ok:false, code:error.code, error:error.message }, { status:error.status, headers:{ "cache-control":"no-store" } });
    throw error;
  }
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) throw new BundleInputError("معرّف سجل الباقة غير صالح");
    await getDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM course_bundles WHERE id = ${id} FOR UPDATE`);
      const [bundle] = await tx.select().from(courseBundles).where(eq(courseBundles.id, id)).limit(1);
      if (!bundle) throw new BundleInputError("الباقة غير موجودة");
      const items = await tx.select().from(courseBundleItems).where(eq(courseBundleItems.bundleId, id)).orderBy(asc(courseBundleItems.position));
      const [usedOrder] = await tx.select({ orderNumber: orders.orderNumber }).from(orders).where(eq(orders.bundleSlug, bundle.slug)).limit(1);
      if (usedOrder) throw new BundleConflictError("لا يمكن حذف باقة مرتبطة بطلب مالي؛ غيّر حالتها إلى مؤرشفة بدلًا من ذلك");
      const before = { ...bundle, courseSlugs: items.map((item) => item.courseSlug) };
      await tx.delete(courseBundles).where(eq(courseBundles.id, id));
      const now = new Date().toISOString();
      await tx.insert(auditLogs).values({ actorEmail: guarded.authorization.actor, action: "delete", entityType: "course_bundle", entityId: bundle.slug, beforeJson: json(before), afterJson: null, ipAddress: clientIp(request), createdAt: now });
    });
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch (error) {
    if (error instanceof BundleConflictError) return jsonError(error.message, 409);
    if (error instanceof BundleInputError) return jsonError(error.message, error.message === "الباقة غير موجودة" ? 404 : 400);
    return jsonError("تعذر حذف الباقة", 500);
  }
}
