import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs, catalogCourses, catalogInstitutions, catalogSpecialties, couponsDb, courseAccess, courseRequestFiles, courseRequests,
  courseReviews, courseUnitsDb, institutionSpecialties, lessonsDb, notificationsDb, orderItems, orders, platformSettings,
  supervisorAssignments, supportReplyFiles, supportReplies, supportTickets, users, videoAssets,
} from "@/db/schema";
import { cleanText, isAdminRequest, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, getSessionUser, roleAllowed, sameOriginRequest, validEmail } from "@/lib/auth";
import { getCourseCatalog, getCoursesCatalog, getInstitutionCatalog, getInstitutionsCatalog, invalidateCatalogCache } from "@/lib/catalog-store";
import { invalidatePublicSettingsCache, PUBLIC_SETTING_DEFAULTS, SETTING_META, type PublicSettingKey } from "@/lib/platform-settings";
import { sendPushNotification } from "@/lib/push";
import { syncCatalogTemplates } from "@/lib/catalog-sync";
import { courseSlug, institutionSlug as makeInstitutionSlug, lessonId, specialtySlug } from "@/lib/catalog-templates";
import { deleteAdminEntity, DeletionPolicyError, type AdminDeletionType } from "@/lib/admin-deletion";
import { specialtiesEquivalent } from "@/lib/academic-data";
import { normalizeInternalActionPath } from "@/lib/internal-action-route";

async function authorize(request: Request) {
  const user = await getSessionUser(request);
  if (roleAllowed(user, ["admin"])) return { actor: user!.email, user };
  if (isAdminRequest(request)) return { actor: "admin-api-token", user: null };
  return null;
}

function asJson(value: unknown) {
  try { return JSON.stringify(value); } catch { return "{}"; }
}

async function audit(request: Request, actor: string, action: string, entityType: string, entityId: string | null, before: unknown, after: unknown) {
  await getDb().insert(auditLogs).values({
    actorEmail: actor,
    action,
    entityType,
    entityId,
    beforeJson: before == null ? null : asJson(before),
    afterJson: after == null ? null : asJson(after),
    ipAddress: (request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown").slice(0, 80),
  });
}

function validSlug(value: string) {
  return /^[a-z0-9][a-z0-9._-]{1,79}$/i.test(value);
}

function safeUrl(value: string) {
  if (!value) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function managedAssetInput(value: string, publicPath: string) {
  // R2-backed assets are exposed in catalog DTOs through these public routes.
  // Receiving the exact route back from an edit form means "keep the stored
  // object", not that the administrator supplied an unsafe external URL.
  return value === publicPath ? "" : value;
}

function requestStatusLabel(value: string) {
  return ({ new: "جديد", assigned: "مسند", reviewing: "قيد المراجعة", planned: "مخطط له", producing: "قيد الإنتاج", available: "متاح", declined: "متعذر حاليًا" } as Record<string, string>)[value] || "حالة غير معروفة";
}

function ticketStatusLabel(value: string) {
  return ({ new: "جديدة", open: "مفتوحة", waiting: "بانتظار رد الطالب", resolved: "محلولة", closed: "مغلقة" } as Record<string, string>)[value] || "حالة غير معروفة";
}

function accessIsActive(row: { revokedAt: string | null; expiresAt: string | null }, nowMs: number) {
  if (row.revokedAt) return false;
  if (!row.expiresAt) return true;
  const expiresAt = new Date(row.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > nowMs;
}

export async function GET(request: Request) {
  const authorization = await authorize(request);
  if (!authorization) return jsonError("غير مصرح", 403);
  const identity = authorization.user ? `user:${authorization.user.id}` : `machine:${clientIp(request)}`;
  if (!await checkRateLimit("admin-console-read", identity, 30, 60)) return jsonError("طلبات إدارية كثيرة. حاول بعد دقيقة.", 429);
  const db = getDb();
  const [institutionRows, courses, specialtyRows, links, unitRows, lessonRows, videoRows, studentRows, orderRows, requestRows, requestFileRows, ticketRows, replyRows, supportFileRows, reviewRows, accessRows, supervisorRows, notificationRows, couponRows, settingRows, audits] = await Promise.all([
    getInstitutionsCatalog(true),
    getCoursesCatalog(true),
    db.select().from(catalogSpecialties).orderBy(catalogSpecialties.name),
    db.select().from(institutionSpecialties),
    db.select().from(courseUnitsDb).orderBy(courseUnitsDb.position),
    db.select().from(lessonsDb).orderBy(lessonsDb.position),
    db.select().from(videoAssets).orderBy(desc(videoAssets.createdAt)).limit(500),
    db.select({ id: users.id, email: users.email, phone: users.phone, fullName: users.fullName, role: users.role, universitySlug: users.universitySlug, specialty: users.specialty, academicLevel: users.academicLevel, profileCompletedAt: users.profileCompletedAt, onboardingCompletedAt: users.onboardingCompletedAt, lastLoginAt: users.lastLoginAt, status: users.status, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt)).limit(500),
    db.select().from(orders).orderBy(desc(orders.createdAt)).limit(300),
    db.select().from(courseRequests).orderBy(desc(courseRequests.createdAt)).limit(300),
    db.select().from(courseRequestFiles).orderBy(desc(courseRequestFiles.createdAt)).limit(3000),
    db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt)).limit(300),
    db.select().from(supportReplies).orderBy(desc(supportReplies.createdAt)).limit(1000),
    db.select().from(supportReplyFiles).limit(2000),
    db.select().from(courseReviews).orderBy(desc(courseReviews.createdAt)).limit(300),
    db.select().from(courseAccess).orderBy(desc(courseAccess.startsAt)).limit(500),
    db.select().from(supervisorAssignments).orderBy(desc(supervisorAssignments.createdAt)).limit(500),
    db.select().from(notificationsDb).orderBy(desc(notificationsDb.createdAt)).limit(200),
    db.select().from(couponsDb).orderBy(desc(couponsDb.createdAt)).limit(200),
    db.select().from(platformSettings),
    db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(120),
  ]);
  const orderNumbers = orderRows.map((order) => order.orderNumber);
  const orderItemRows = orderNumbers.length ? await db.select().from(orderItems).where(inArray(orderItems.orderNumber, orderNumbers)).orderBy(desc(orderItems.createdAt)) : [];
  const settings = { ...PUBLIC_SETTING_DEFAULTS } as Record<string, string>;
  for (const row of settingRows) settings[row.key] = row.value;
  const [managedInstitutionRows, managedCourseRows] = await Promise.all([
    db.select().from(catalogInstitutions),
    db.select().from(catalogCourses),
  ]);
  const managedInstitutionMap = new Map(managedInstitutionRows.map((row) => [row.slug, row]));
  const managedCourseMap = new Map(managedCourseRows.map((row) => [row.slug, row]));
  const [[userMetrics], [institutionMetrics], [courseMetrics], [orderMetrics], [requestMetrics], [ticketMetrics], [reviewMetrics]] = await Promise.all([
    db.select({ students: sql<number>`count(*) FILTER (WHERE ${users.role} = 'student')::int`, activeStudents: sql<number>`count(*) FILTER (WHERE ${users.role} = 'student' AND ${users.status} = 'active')::int` }).from(users),
    db.select({ institutions: sql<number>`count(*)::int` }).from(catalogInstitutions),
    db.select({ publishedCourses: sql<number>`count(*) FILTER (WHERE ${catalogCourses.status} = 'published')::int` }).from(catalogCourses),
    db.select({ orders: sql<number>`count(*)::int`, paidOrders: sql<number>`count(*) FILTER (WHERE ${orders.status} = 'paid')::int`, revenue: sql<number>`COALESCE(sum(${orders.total}) FILTER (WHERE ${orders.status} = 'paid'), 0)::double precision` }).from(orders),
    db.select({ openRequests: sql<number>`count(*) FILTER (WHERE ${courseRequests.status} NOT IN ('available', 'declined'))::int` }).from(courseRequests),
    db.select({ openTickets: sql<number>`count(*) FILTER (WHERE ${supportTickets.status} NOT IN ('resolved', 'closed'))::int` }).from(supportTickets),
    db.select({ pendingReviews: sql<number>`count(*) FILTER (WHERE ${courseReviews.status} = 'pending')::int` }).from(courseReviews),
  ]);
  return Response.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    metrics: {
      students: userMetrics?.students || 0,
      activeStudents: userMetrics?.activeStudents || 0,
      institutions: institutionMetrics?.institutions || 0,
      publishedCourses: courseMetrics?.publishedCourses || 0,
      orders: orderMetrics?.orders || 0,
      paidOrders: orderMetrics?.paidOrders || 0,
      revenue: orderMetrics?.revenue || 0,
      openRequests: requestMetrics?.openRequests || 0,
      openTickets: ticketMetrics?.openTickets || 0,
      pendingReviews: reviewMetrics?.pendingReviews || 0,
    },
    institutions: institutionRows.map((row) => ({ ...row, status: managedInstitutionMap.get(row.slug)?.status || "published" })),
    courses: courses.map((row) => ({ ...row, status: managedCourseMap.get(row.slug)?.status || "published", specialtySlug: managedCourseMap.get(row.slug)?.specialtySlug || "", coverTheme: managedCourseMap.get(row.slug)?.coverTheme || "blue-violet" })),
    specialties: specialtyRows,
    specialtyLinks: links,
    units: unitRows,
    lessons: lessonRows,
    videos: videoRows,
    users: studentRows,
    orders: orderRows.map((order) => {
      const items = orderItemRows.filter((item) => item.orderNumber === order.orderNumber).map((item) => ({ ...item, courseTitle: courses.find((course) => course.slug === item.courseSlug)?.title || item.courseSlug }));
      const resolvedItems = items.length ? items : [{ id: 0, orderNumber: order.orderNumber, courseSlug: order.courseSlug, unitPrice: order.subtotal, discount: order.discount, total: order.total, createdAt: order.createdAt, courseTitle: courses.find((course) => course.slug === order.courseSlug)?.title || order.courseSlug }];
      return { ...order, items: resolvedItems, courseSlugs: resolvedItems.map((item) => item.courseSlug) };
    }),
    requests: requestRows.map((request) => ({ ...request, student: request.userId ? (() => { const student = studentRows.find((user) => user.id === request.userId); return student ? { fullName: student.fullName, email: student.email, phone: student.phone, universitySlug: student.universitySlug, specialty: student.specialty, academicLevel: student.academicLevel, status: student.status } : null; })() : null, files: requestFileRows.filter((file) => file.requestId === request.id).map((file) => ({ id: file.id, requestId: file.requestId, originalName: file.originalName, contentType: file.contentType, sizeBytes: file.sizeBytes, createdAt: file.createdAt })) })),
    tickets: ticketRows.map((ticket) => ({ ...ticket, student: ticket.userEmail ? (() => { const student = studentRows.find((user) => user.email.toLowerCase() === ticket.userEmail!.toLowerCase()); return student ? { fullName: student.fullName, email: student.email, phone: student.phone, universitySlug: student.universitySlug, specialty: student.specialty, academicLevel: student.academicLevel, status: student.status } : null; })() : null, replies: replyRows.filter((reply) => reply.ticketId === ticket.id).map((reply) => ({ ...reply, files: supportFileRows.filter((file) => file.replyId === reply.id).map((file) => ({ id: file.id, replyId: file.replyId, ticketId: file.ticketId, originalName: file.originalName, contentType: file.contentType, sizeBytes: file.sizeBytes, createdAt: file.createdAt })) })) })),
    reviews: reviewRows,
    access: accessRows,
    supervisorAssignments: supervisorRows,
    notifications: notificationRows,
    coupons: couponRows,
    settings,
    audit: audits,
    services: {
      assistant: true,
      payments: Boolean(process.env.TAP_SECRET_KEY?.trim()),
      email: Boolean(process.env.RESEND_API_KEY?.trim()),
      videoSigning: Boolean(process.env.VIDEO_SIGNING_SECRET?.trim() && process.env.VIDEO_SIGNING_SECRET!.trim().length >= 24),
    },
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const machineAuthorized = isAdminRequest(request);
  if (!machineAuthorized && !sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const authorization = await authorize(request);
  if (!authorization) return jsonError("غير مصرح", 403);
  const identity = authorization.user ? `user:${authorization.user.id}` : `machine:${clientIp(request)}`;
  if (!await checkRateLimit("admin-console-write", identity, 60, 60)) return jsonError("طلبات إدارية كثيرة. حاول بعد دقيقة.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات غير صالحة"); }
  const action = cleanText(payload.action, 50);
  const db = getDb();
  const now = new Date().toISOString();

  if (action === "deleteEntity") {
    const entityType = cleanText(payload.entityType, 50) as AdminDeletionType;
    const entityId = cleanText(payload.entityId, 180);
    const confirmation = typeof payload.confirmation === "string" ? payload.confirmation.trim() : "";
    if (!entityType || !entityId) return jsonError("حدد السجل المراد حذفه");
    try {
      const result = await deleteAdminEntity(db, { entityType, entityId, actor: authorization.actor, ipAddress: clientIp(request), confirmation });
      if (["institution", "specialty", "course", "unit", "lesson", "video"].includes(entityType)) invalidateCatalogCache();
      return Response.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
    } catch (error) {
      if (error instanceof DeletionPolicyError) return jsonError(error.message, error.status);
      console.error("[admin-delete] transaction failed", error instanceof Error ? error.message : "unknown error");
      return jsonError("تعذر تنفيذ الحذف بأمان. لم يتم اعتماد التغييرات.", 500);
    }
  }

  if (action === "syncCatalogTemplates") {
    const rawPrice = Number(payload.templatePrice);
    const templatePrice = Number.isFinite(rawPrice) && rawPrice >= 0 && rawPrice <= 50_000 ? rawPrice : 49;
    const mode = cleanText(payload.mode, 10) === "full" ? "full" : "core";
    const result = await syncCatalogTemplates(templatePrice, mode);
    invalidateCatalogCache();
    await audit(request, authorization.actor, "sync", "catalog_templates", "all", null, result);
    return Response.json({ ok: true, result });
  }

  if (action === "saveInstitution") {
    const name = cleanText(payload.name, 140);
    const suppliedSlug = cleanText(payload.slug, 80).toLowerCase();
    const slug = suppliedSlug || makeInstitutionSlug(name);
    const nameEn = cleanText(payload.nameEn, 140);
    const region = cleanText(payload.region, 80);
    const type = cleanText(payload.type, 30);
    const domain = cleanText(payload.domain, 180).replace(/^https?:\/\//, "").replace(/\/$/, "");
    const requestedLogoUrl = cleanText(payload.logoUrl, 500);
    const logoUrl = managedAssetInput(requestedLogoUrl, `/api/logos/${slug}`);
    const directorySourceUrl = cleanText(payload.directorySourceUrl, 500);
    const aliasValues: unknown[] = Array.isArray(payload.aliases) ? payload.aliases : [];
    const suppliedAliases = Array.isArray(payload.aliases);
    const aliasesJson = suppliedAliases ? JSON.stringify(aliasValues.map((item: unknown) => cleanText(item, 160)).filter(Boolean).slice(0, 20)) : undefined;
    const verificationStatus = cleanText(payload.verificationStatus, 30) || "pending-review";
    const status = cleanText(payload.status, 20) || "published";
    if (!validSlug(slug) || name.length < 3 || !region || !["حكومية", "أهلية", "كلية", "تقنية"].includes(type) || !["published", "hidden"].includes(status) || !["official-directory", "pending-review"].includes(verificationStatus)) return jsonError("تحقق من بيانات الجهة");
    if (logoUrl && !safeUrl(logoUrl) && !logoUrl.startsWith("r2:")) return jsonError("رابط الشعار يجب أن يبدأ بـ https");
    if (directorySourceUrl && !safeUrl(directorySourceUrl)) return jsonError("رابط المصدر يجب أن يبدأ بـ https");
    const [before] = await db.select().from(catalogInstitutions).where(eq(catalogInstitutions.slug, slug)).limit(1);
    const suppliedSortOrder = payload.sortOrder !== undefined && payload.sortOrder !== null && payload.sortOrder !== "";
    const values = { slug, name, nameEn, region, type, domain: domain || null, logoUrl: logoUrl || before?.logoUrl || null, directorySourceUrl: directorySourceUrl || before?.directorySourceUrl || null, verificationStatus: verificationStatus === "pending-review" && before?.verificationStatus === "official-directory" ? "official-directory" : verificationStatus, aliasesJson: aliasesJson ?? before?.aliasesJson ?? "[]", status, featured: payload.featured === true, sortOrder: suppliedSortOrder && Number.isFinite(Number(payload.sortOrder)) ? Math.floor(Number(payload.sortOrder)) : before?.sortOrder || 0, updatedAt: now };
    await db.insert(catalogInstitutions).values({ ...values, createdAt: before?.createdAt || now }).onConflictDoUpdate({ target: catalogInstitutions.slug, set: values });
    invalidateCatalogCache();
    await audit(request, authorization.actor, before ? "update" : "create", "institution", slug, before, values);
    return Response.json({ ok: true, institution: values });
  }

  if (action === "saveSpecialty") {
    const name = cleanText(payload.name, 140);
    const suppliedSlug = cleanText(payload.slug, 80).toLowerCase();
    const slug = suppliedSlug || specialtySlug(name);
    const description = cleanText(payload.description, 1000);
    const sourceUrl = cleanText(payload.sourceUrl, 500);
    const verifiedAt = cleanText(payload.verifiedAt, 30);
    const verificationStatus = cleanText(payload.verificationStatus, 30) || "pending-review";
    const faculty = cleanText(payload.faculty, 160) || null;
    const degree = cleanText(payload.degree, 80) || null;
    const status = cleanText(payload.status, 20) || "published";
    const institutionSlug = cleanText(payload.institutionSlug, 80).toLowerCase();
    if (!validSlug(slug) || name.length < 2 || !["published", "hidden"].includes(status) || !["official-program", "pending-review", "discovery"].includes(verificationStatus)) return jsonError("تحقق من بيانات التخصص");
    if (sourceUrl && !safeUrl(sourceUrl)) return jsonError("رابط مصدر التخصص يجب أن يبدأ بـ https");
    if (institutionSlug && !await getInstitutionCatalog(institutionSlug, true)) return jsonError("الجهة غير موجودة");
    const [before] = await db.select().from(catalogSpecialties).where(eq(catalogSpecialties.slug, slug)).limit(1);
    const values = { slug, name, description, sourceUrl: sourceUrl || before?.sourceUrl || null, verifiedAt: verifiedAt || before?.verifiedAt || null, verificationStatus, faculty, degree, status, updatedAt: now };
    await db.insert(catalogSpecialties).values({ ...values, createdAt: before?.createdAt || now }).onConflictDoUpdate({ target: catalogSpecialties.slug, set: values });
    if (institutionSlug) await db.insert(institutionSpecialties).values({ institutionSlug, specialtySlug: slug, status: "published", sortOrder: 0 }).onConflictDoUpdate({ target: [institutionSpecialties.institutionSlug, institutionSpecialties.specialtySlug], set: { status: "published" } });
    invalidateCatalogCache();
    await audit(request, authorization.actor, before ? "update" : "create", "specialty", slug, before, { ...values, institutionSlug });
    return Response.json({ ok: true, specialty: values });
  }

  if (action === "saveCourse") {
    const institutionSlug = cleanText(payload.institutionSlug, 80).toLowerCase();
    const specialtySlug = cleanText(payload.specialtySlug, 80).toLowerCase();
    const title = cleanText(payload.title, 160);
    const suppliedSlug = cleanText(payload.slug, 80).toLowerCase();
    const status = cleanText(payload.status, 20) || "draft";
    const price = Number(payload.price);
    const oldPriceValue = Number(payload.oldPrice);
    const requestedCoverImageUrl = cleanText(payload.coverImageUrl, 1000);
    const [specialty] = await db.select().from(catalogSpecialties).where(eq(catalogSpecialties.slug, specialtySlug)).limit(1);
    if (!specialty) return jsonError("أنشئ التخصص أو اربطه أولًا");
    const slug = suppliedSlug || courseSlug(institutionSlug, specialty.name, title);
    const coverImageUrl = managedAssetInput(requestedCoverImageUrl, `/api/covers/${slug}`);
    if (!validSlug(slug) || title.length < 3 || !await getInstitutionCatalog(institutionSlug, true) || !validSlug(specialtySlug) || !Number.isFinite(price) || price < 0 || price > 50_000 || !["draft", "published", "hidden"].includes(status)) return jsonError("تحقق من بيانات المادة وربطها");
    if (coverImageUrl && !safeUrl(coverImageUrl) && !coverImageUrl.startsWith("r2:")) return jsonError("رابط غلاف المادة يجب أن يبدأ بـ https");
    const [specialtyLink] = await db.select().from(institutionSpecialties).where(and(eq(institutionSpecialties.institutionSlug, institutionSlug), eq(institutionSpecialties.specialtySlug, specialtySlug), eq(institutionSpecialties.status, "published"))).limit(1);
    if (!specialtyLink) return jsonError("التخصص غير مربوط بهذه الجهة");
    const [before] = await db.select().from(catalogCourses).where(eq(catalogCourses.slug, slug)).limit(1);
    const values = {
      slug, institutionSlug, specialtySlug, title,
      titleEn: cleanText(payload.titleEn, 160), code: cleanText(payload.code, 50) || null,
      description: cleanText(payload.description, 3000), coverImageUrl: coverImageUrl || before?.coverImageUrl || null, price,
      oldPrice: Number.isFinite(oldPriceValue) && oldPriceValue > price ? oldPriceValue : null,
      accessLabel: cleanText(payload.accessLabel, 80) || "90 يومًا",
      sourceUrl: cleanText(payload.sourceUrl, 500) || before?.sourceUrl || null,
      verifiedAt: cleanText(payload.verifiedAt, 30) || before?.verifiedAt || null,
      status, featured: payload.featured === true, coverTheme: cleanText(payload.coverTheme, 40) || "blue-violet", updatedAt: now,
    };
    await db.insert(catalogCourses).values({ ...values, createdAt: before?.createdAt || now }).onConflictDoUpdate({ target: catalogCourses.slug, set: values });
    invalidateCatalogCache();
    await audit(request, authorization.actor, before ? "update" : "create", "course", slug, before, values);
    return Response.json({ ok: true, course: values });
  }

  if (action === "saveUnit") {
    const id = Math.floor(Number(payload.id));
    const courseSlug = cleanText(payload.courseSlug, 80);
    const title = cleanText(payload.title, 160);
    const description = cleanText(payload.description, 2000);
    const status = cleanText(payload.status, 20) || "draft";
    if (!validSlug(courseSlug) || title.length < 2 || !["draft", "published", "hidden"].includes(status)) return jsonError("تحقق من الوحدة");
    const [course] = await db.select().from(catalogCourses).where(eq(catalogCourses.slug, courseSlug)).limit(1);
    if (!course) return jsonError("يجب إنشاء المادة في الإدارة أولًا");
    const position = Math.max(0, Math.floor(Number(payload.position) || 0));
    if (id) {
      const [before] = await db.select().from(courseUnitsDb).where(eq(courseUnitsDb.id, id)).limit(1);
      if (!before || before.courseSlug !== courseSlug) return jsonError("الوحدة غير موجودة", 404);
      await db.update(courseUnitsDb).set({ title, description: description || before.description, position, status, updatedAt: now }).where(eq(courseUnitsDb.id, id));
      invalidateCatalogCache();
      await audit(request, authorization.actor, "update", "unit", String(id), before, { title, description: description || before.description, position, status });
      return Response.json({ ok: true, id });
    }
    const [created] = await db.insert(courseUnitsDb).values({ courseSlug, title, description, position, status, createdAt: now, updatedAt: now }).returning({ id: courseUnitsDb.id });
    invalidateCatalogCache();
    await audit(request, authorization.actor, "create", "unit", String(created.id), null, { courseSlug, title, description, position, status });
    return Response.json({ ok: true, id: created.id }, { status: 201 });
  }

  if (action === "saveLesson") {
    const suppliedId = cleanText(payload.id, 100);
    const courseSlug = cleanText(payload.courseSlug, 80);
    const unitId = Math.floor(Number(payload.unitId));
    const title = cleanText(payload.title, 160);
    const description = cleanText(payload.description, 2000);
    const status = cleanText(payload.status, 20) || "draft";
    const position = Math.max(0, Math.floor(Number(payload.position) || 0));
    const id = suppliedId || lessonId(courseSlug, position + 1, title);
    if (!validSlug(courseSlug) || !validSlug(id) || !unitId || title.length < 2 || !["draft", "published", "hidden"].includes(status)) return jsonError("تحقق من بيانات الدرس");
    const [unit] = await db.select().from(courseUnitsDb).where(and(eq(courseUnitsDb.id, unitId), eq(courseUnitsDb.courseSlug, courseSlug))).limit(1);
    if (!unit) return jsonError("الوحدة لا تتبع هذه المادة");
    const [before] = await db.select().from(lessonsDb).where(eq(lessonsDb.id, id)).limit(1);
    const values = { id, courseSlug, unitId, title, description: description || before?.description || "", position, durationSeconds: Math.max(0, Math.floor(Number(payload.durationSeconds) || 0)), freePreview: payload.freePreview === true, status, videoAssetId: before?.videoAssetId || null, updatedAt: now };
    await db.insert(lessonsDb).values({ ...values, createdAt: before?.createdAt || now }).onConflictDoUpdate({ target: lessonsDb.id, set: values });
    invalidateCatalogCache();
    await audit(request, authorization.actor, before ? "update" : "create", "lesson", id, before, values);
    return Response.json({ ok: true, lesson: values });
  }

  if (action === "updateUser") {
    const id = Math.floor(Number(payload.id));
    const status = cleanText(payload.status, 20);
    const role = cleanText(payload.role, 20);
    if (!id || !["active", "suspended"].includes(status) || !["student", "supervisor", "admin"].includes(role)) return jsonError("بيانات المستخدم غير صالحة");
    const [before] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!before) return jsonError("المستخدم غير موجود", 404);
    if (before.status === "deleted") return jsonError("لا يمكن إعادة تنشيط حساب محذوف أو تغيير دوره", 409);
    if (before.email === authorization.actor && (status !== "active" || role !== "admin")) return jsonError("لا يمكنك تعطيل صلاحية حسابك الإداري الحالي");
    if (before.role === "admin" && before.status === "active" && (status !== "active" || role !== "admin")) {
      const [{ activeAdmins }] = await db.select({ activeAdmins: sql<number>`count(*)::int` }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active")));
      if ((activeAdmins || 0) <= 1) return jsonError("لا يمكن تعطيل أو تخفيض آخر مدير نشط في المنصة", 409);
    }
    await db.update(users).set({ status, role, updatedAt: now }).where(eq(users.id, id));
    if (role !== "supervisor" || status !== "active") await db.update(supervisorAssignments).set({ active: false }).where(eq(supervisorAssignments.supervisorId, id));
    await audit(request, authorization.actor, "update", "user", String(id), { status: before.status, role: before.role }, { status, role });
    return Response.json({ ok: true });
  }

  if (action === "saveSupervisorAssignment") {
    const id = Math.floor(Number(payload.id));
    const supervisorId = Math.floor(Number(payload.supervisorId));
    const institutionSlug = cleanText(payload.institutionSlug, 80).toLowerCase();
    const specialty = cleanText(payload.specialty, 140);
    const active = payload.active !== false;
    if (!supervisorId || !institutionSlug || !specialty) return jsonError("اختر المشرف والجامعة والتخصص");
    const [supervisor] = await db.select({ id: users.id, role: users.role, email: users.email, status: users.status }).from(users).where(eq(users.id, supervisorId)).limit(1);
    if (!supervisor || supervisor.role !== "supervisor" || supervisor.status !== "active") return jsonError("الحساب المحدد ليس مشرفًا نشطًا");
    if (!await getInstitutionCatalog(institutionSlug, true)) return jsonError("الجهة غير موجودة");
    const [managedSpecialty] = await db.select({ slug: catalogSpecialties.slug }).from(catalogSpecialties).where(eq(catalogSpecialties.name, specialty)).limit(1);
    if (!managedSpecialty) return jsonError("أنشئ التخصص الإداري أولًا");
    const [specialtyLink] = await db.select({ id: institutionSpecialties.id }).from(institutionSpecialties).where(and(eq(institutionSpecialties.institutionSlug, institutionSlug), eq(institutionSpecialties.specialtySlug, managedSpecialty.slug), eq(institutionSpecialties.status, "published"))).limit(1);
    if (!specialtyLink) return jsonError("التخصص غير مربوط بهذه الجهة");
    if (id) {
      const [before] = await db.select().from(supervisorAssignments).where(eq(supervisorAssignments.id, id)).limit(1);
      if (!before) return jsonError("نطاق الإشراف غير موجود", 404);
      await db.update(supervisorAssignments).set({ supervisorId, institutionSlug, specialty, active }).where(eq(supervisorAssignments.id, id));
      await audit(request, authorization.actor, "update", "supervisor_assignment", String(id), before, { supervisorId, institutionSlug, specialty, active });
      return Response.json({ ok: true, id });
    }
    const [created] = await db.insert(supervisorAssignments).values({ supervisorId, institutionSlug, specialty, active, createdAt: now }).onConflictDoUpdate({ target: [supervisorAssignments.supervisorId, supervisorAssignments.institutionSlug, supervisorAssignments.specialty], set: { active } }).returning({ id: supervisorAssignments.id });
    await audit(request, authorization.actor, "create", "supervisor_assignment", String(created.id), null, { supervisorId, institutionSlug, specialty, active });
    return Response.json({ ok: true, id: created.id }, { status: 201 });
  }

  if (action === "grantAccess") {
    const userEmail = cleanText(payload.userEmail, 180).toLowerCase();
    const courseSlug = cleanText(payload.courseSlug, 80);
    if (!validEmail(userEmail) || !await getCourseCatalog(courseSlug, true)) return jsonError("تحقق من الطالب والمادة");
    const [student] = await db.select({ id: users.id, role: users.role, status: users.status }).from(users).where(eq(users.email, userEmail)).limit(1);
    if (!student || student.role !== "student" || student.status !== "active") return jsonError("الطالب غير موجود أو حسابه غير نشط", 404);
    const expiresAtInput = cleanText(payload.expiresAt, 40);
    const expiresAtTime = expiresAtInput ? new Date(expiresAtInput).getTime() : null;
    if (expiresAtTime !== null && (Number.isNaN(expiresAtTime) || expiresAtTime <= Date.now())) return jsonError("تاريخ انتهاء الوصول يجب أن يكون تاريخًا مستقبليًا صالحًا");
    const expiresAt = expiresAtTime === null ? null : new Date(expiresAtTime).toISOString();
    let sourceConflict = false;
    await db.transaction(async (tx) => {
      const [existingAccess] = await tx.select({ source: courseAccess.source }).from(courseAccess).where(and(eq(courseAccess.userEmail, userEmail), eq(courseAccess.courseSlug, courseSlug))).limit(1);
      if (existingAccess && existingAccess.source !== "admin") { sourceConflict = true; return; }
      if (existingAccess) {
        await tx.update(courseAccess).set({ revokedAt: null, expiresAt, startsAt: now }).where(and(eq(courseAccess.userEmail, userEmail), eq(courseAccess.courseSlug, courseSlug), eq(courseAccess.source, "admin")));
        return;
      }
      const [created] = await tx.insert(courseAccess).values({ userEmail, courseSlug, source: "admin", expiresAt, startsAt: now }).onConflictDoNothing().returning({ source: courseAccess.source });
      if (created) return;
      const [racedAccess] = await tx.select({ source: courseAccess.source }).from(courseAccess).where(and(eq(courseAccess.userEmail, userEmail), eq(courseAccess.courseSlug, courseSlug))).limit(1);
      if (!racedAccess || racedAccess.source !== "admin") { sourceConflict = true; return; }
      await tx.update(courseAccess).set({ revokedAt: null, expiresAt, startsAt: now }).where(and(eq(courseAccess.userEmail, userEmail), eq(courseAccess.courseSlug, courseSlug), eq(courseAccess.source, "admin")));
    });
    if (sourceConflict) return jsonError("يوجد للطالب وصول مسجل من شراء أو طلب مادة؛ لن تستبدله المنحة الإدارية أو تغيّر مدته", 409);
    const course = await getCourseCatalog(courseSlug, true);
    const notificationTitle = "تم تفعيل المادة";
    const notificationBody = `أصبحت مادة «${course?.title || courseSlug}» متاحة في حسابك.`;
    await db.insert(notificationsDb).values({ userEmail, audience: "student", title: notificationTitle, body: notificationBody, actionUrl: `/learn/${courseSlug}`, createdAt: now }).catch(() => undefined);
    await sendPushNotification({ userEmail }, notificationTitle, notificationBody, { route: `/learn/${courseSlug}` });
    await audit(request, authorization.actor, "grant", "course_access", `${userEmail}:${courseSlug}`, null, { expiresAt });
    return Response.json({ ok: true });
  }

  if (action === "prepareRequest") {
    const id = Math.floor(Number(payload.id));
    const courseSlug = cleanText(payload.courseSlug, 80);
    if (!id || !courseSlug || !validSlug(courseSlug)) return jsonError("اختر طلبًا ومادة صالحة");
    const [before] = await db.select().from(courseRequests).where(eq(courseRequests.id, id)).limit(1);
    if (!before) return jsonError("الطلب غير موجود", 404);
    const course = await getCourseCatalog(courseSlug);
    if (!course) return jsonError("المادة غير موجودة أو غير منشورة", 404);
    if (before.universitySlug && course.universitySlug && before.universitySlug !== course.universitySlug) return jsonError("المادة لا تتبع جامعة الطلب");
    if (before.specialty && course.specialty && !specialtiesEquivalent(before.universitySlug || course.universitySlug, before.specialty, course.universitySlug, course.specialty)) return jsonError("المادة لا تتبع تخصص الطلب");
    let accessEmail = "";
    let grantEmail = "";
    let studentEmail = "";
    if (before.userId) {
      const [student] = await db.select({ email: users.email, role: users.role, status: users.status }).from(users).where(eq(users.id, before.userId)).limit(1);
      accessEmail = student?.email || "";
      if (student?.role === "student" && student.status !== "deleted") grantEmail = student.email;
      if (student?.role === "student" && student.status === "active") studentEmail = student.email;
    }
    let accessConflict = false;
    await db.transaction(async (tx) => {
      if (grantEmail) {
        const [requestAccess] = await tx.insert(courseAccess).values({ userEmail: grantEmail, courseSlug: course.slug, source: "request", startsAt: now, revokedAt: null })
          .onConflictDoUpdate({
            target: [courseAccess.userEmail, courseAccess.courseSlug],
            set: { startsAt: now, expiresAt: null, revokedAt: null },
            setWhere: eq(courseAccess.source, "request"),
          })
          .returning({ source: courseAccess.source, revokedAt: courseAccess.revokedAt, expiresAt: courseAccess.expiresAt });
        if (!requestAccess) {
          const [competingAccess] = await tx.select({ source: courseAccess.source, revokedAt: courseAccess.revokedAt, expiresAt: courseAccess.expiresAt }).from(courseAccess).where(and(eq(courseAccess.userEmail, grantEmail), eq(courseAccess.courseSlug, course.slug))).limit(1);
          if (!competingAccess || !accessIsActive(competingAccess, new Date(now).getTime())) { accessConflict = true; return; }
        }
      }
      await tx.update(courseRequests).set({ status: "available", preparedCourseSlug: course.slug, updatedAt: now }).where(eq(courseRequests.id, id));
      if (before.preparedCourseSlug && before.preparedCourseSlug !== course.slug && accessEmail && before.userId) {
        const [otherAvailableRequest] = await tx.select({ id: courseRequests.id }).from(courseRequests).where(and(
          eq(courseRequests.userId, before.userId),
          eq(courseRequests.status, "available"),
          eq(courseRequests.preparedCourseSlug, before.preparedCourseSlug),
          ne(courseRequests.id, id),
        )).limit(1);
        if (!otherAvailableRequest) await tx.update(courseAccess).set({ revokedAt: now }).where(and(eq(courseAccess.userEmail, accessEmail), eq(courseAccess.courseSlug, before.preparedCourseSlug), eq(courseAccess.source, "request")));
      }
      if (studentEmail) {
        await tx.insert(notificationsDb).values({ userEmail: studentEmail, audience: "student", title: "تم تجهيز المادة المطلوبة", body: `تم تجهيز مادة «${course.title}» وأصبحت متاحة الآن في حسابك.`, actionUrl: `/learn/${course.slug}`, actionLabel: "فتح المادة", createdAt: now });
      }
    });
    if (accessConflict) return jsonError("يوجد سجل وصول سابق غير نشط من مصدر آخر؛ لم نغيّر مصدره أو نعتمد الطلب شكليًا", 409);
    if (studentEmail && before.notify) await sendPushNotification({ userEmail: studentEmail }, "تم تجهيز المادة المطلوبة", `تم تجهيز مادة «${course.title}» وأصبحت متاحة الآن في حسابك.`, { route: `/learn/${course.slug}` });
    await audit(request, authorization.actor, "prepare", "course_request", String(id), { status: before.status, preparedCourseSlug: before.preparedCourseSlug }, { status: "available", preparedCourseSlug: course.slug });
    return Response.json({ ok: true, course: { slug: course.slug, title: course.title } });
  }

  if (action === "updateRequest") {
    const id = Math.floor(Number(payload.id));
    const status = cleanText(payload.status, 30);
    const selectedCourseSlug = cleanText(payload.courseSlug, 80);
    if (!id || !["new", "assigned", "reviewing", "planned", "producing", "available", "declined"].includes(status)) return jsonError("الحالة غير صالحة");
    const [before] = await db.select().from(courseRequests).where(eq(courseRequests.id, id)).limit(1);
    if (!before) return jsonError("الطلب غير موجود", 404);
    const selectedCourse = status === "available" && selectedCourseSlug ? await getCourseCatalog(selectedCourseSlug) : null;
    const preparedCourse = status === "available" && before.preparedCourseSlug ? await getCourseCatalog(before.preparedCourseSlug) : null;
    const matchedCourse = status === "available" ? selectedCourse || preparedCourse || (await getCoursesCatalog()).find((course) => course.title.trim() === before.courseName.trim() && (!before.universitySlug || course.universitySlug === before.universitySlug) && (!before.specialty || specialtiesEquivalent(before.universitySlug || course.universitySlug, before.specialty, course.universitySlug, course.specialty))) : null;
    if (status === "available" && selectedCourseSlug && !selectedCourse) return jsonError("المادة المختارة غير موجودة أو غير منشورة", 404);
    if (status === "available" && !matchedCourse) return jsonError("لا يمكن اعتماد الطلب كمتاح قبل ربطه بمادة منشورة مطابقة", 409);
    let accessEmail = "";
    let grantEmail = "";
    let studentEmail = "";
    if (before.userId) {
      const [student] = await db.select({ email: users.email, role: users.role, status: users.status }).from(users).where(eq(users.id, before.userId)).limit(1);
      accessEmail = student?.email || "";
      if (student?.role === "student" && student.status !== "deleted") grantEmail = student.email;
      if (student?.role === "student" && student.status === "active") studentEmail = student.email;
    }
    const title = matchedCourse && studentEmail ? "مادتك أصبحت متاحة" : "تحديث طلب المادة";
    const body = matchedCourse && studentEmail ? `أصبحت مادة «${matchedCourse.title}» متاحة الآن في مراس.` : `تغيرت حالة طلب «${before.courseName}» إلى «${requestStatusLabel(status)}».`;
    const actionUrl = matchedCourse && studentEmail ? `/learn/${matchedCourse.slug}` : "/dashboard?view=requests";
    const nextPreparedCourseSlug = matchedCourse?.slug || null;
    let accessConflict = false;
    await db.transaction(async (tx) => {
      if (matchedCourse && grantEmail) {
        const [requestAccess] = await tx.insert(courseAccess).values({ userEmail: grantEmail, courseSlug: matchedCourse.slug, source: "request", startsAt: now, revokedAt: null })
          .onConflictDoUpdate({
            target: [courseAccess.userEmail, courseAccess.courseSlug],
            set: { startsAt: now, expiresAt: null, revokedAt: null },
            setWhere: eq(courseAccess.source, "request"),
          })
          .returning({ source: courseAccess.source, revokedAt: courseAccess.revokedAt, expiresAt: courseAccess.expiresAt });
        if (!requestAccess) {
          const [competingAccess] = await tx.select({ source: courseAccess.source, revokedAt: courseAccess.revokedAt, expiresAt: courseAccess.expiresAt }).from(courseAccess).where(and(eq(courseAccess.userEmail, grantEmail), eq(courseAccess.courseSlug, matchedCourse.slug))).limit(1);
          if (!competingAccess || !accessIsActive(competingAccess, new Date(now).getTime())) { accessConflict = true; return; }
        }
      }
      await tx.update(courseRequests).set({ status, preparedCourseSlug: nextPreparedCourseSlug, updatedAt: now }).where(eq(courseRequests.id, id));
      if (before.preparedCourseSlug && before.preparedCourseSlug !== nextPreparedCourseSlug && accessEmail && before.userId) {
        const [otherAvailableRequest] = await tx.select({ id: courseRequests.id }).from(courseRequests).where(and(
          eq(courseRequests.userId, before.userId),
          eq(courseRequests.status, "available"),
          eq(courseRequests.preparedCourseSlug, before.preparedCourseSlug),
          ne(courseRequests.id, id),
        )).limit(1);
        if (!otherAvailableRequest) await tx.update(courseAccess).set({ revokedAt: now }).where(and(eq(courseAccess.userEmail, accessEmail), eq(courseAccess.courseSlug, before.preparedCourseSlug), eq(courseAccess.source, "request")));
      }
      if (studentEmail) await tx.insert(notificationsDb).values({ userEmail: studentEmail, audience: "student", title, body, actionUrl, actionLabel: matchedCourse && studentEmail ? "افتح المادة" : "عرض الطلب", createdAt: now });
    });
    if (accessConflict) return jsonError("يوجد سجل وصول سابق غير نشط من مصدر آخر؛ لم نغيّر مصدره أو نعتمد الطلب شكليًا", 409);
    if (studentEmail && before.notify) await sendPushNotification({ userEmail: studentEmail }, title, body, { route: matchedCourse ? `/learn/${matchedCourse.slug}` : "/requests" });
    await audit(request, authorization.actor, "update", "course_request", String(id), { status: before.status, preparedCourseSlug: before.preparedCourseSlug }, { status, preparedCourseSlug: nextPreparedCourseSlug });
    return Response.json({ ok: true });
  }

  if (action === "updateTicket") {
    const id = Math.floor(Number(payload.id));
    const status = cleanText(payload.status, 30);
    const reply = cleanText(payload.reply, 4000);
    if (!id || !["new", "open", "waiting", "resolved", "closed"].includes(status)) return jsonError("حالة التذكرة غير صالحة");
    const [before] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
    if (!before) return jsonError("التذكرة غير موجودة", 404);
    const internal = payload.internal === true;
    await db.update(supportTickets).set({ status, assignedTo: authorization.actor, updatedAt: now }).where(eq(supportTickets.id, id));
    if (reply) await db.insert(supportReplies).values({ ticketId: id, authorEmail: authorization.actor, authorRole: authorization.user?.role || "admin", body: reply, internal, createdAt: now });
    if (before.userEmail && !internal && (reply || before.status !== status)) {
      const title = reply ? "رد جديد من دعم مراس" : "تحديث تذكرة الدعم";
      const body = reply ? reply.slice(0, 240) : `تغيرت حالة التذكرة ${before.ticketNumber} إلى «${ticketStatusLabel(status)}».`;
      await db.insert(notificationsDb).values({ userEmail: before.userEmail, audience: "student", title, body, actionUrl: "/support", actionLabel: "فتح المحادثة", createdAt: now }).catch(() => undefined);
      await sendPushNotification({ userEmail: before.userEmail }, title, body, { route: "/support" });
    }
    await audit(request, authorization.actor, "update", "support_ticket", String(id), { status: before.status }, { status, replied: Boolean(reply) });
    return Response.json({ ok: true });
  }

  if (action === "updateReview") {
    const id = Math.floor(Number(payload.id));
    const status = cleanText(payload.status, 30);
    if (!id || !["pending", "published", "rejected"].includes(status)) return jsonError("الحالة غير صالحة");
    const [before] = await db.select().from(courseReviews).where(eq(courseReviews.id, id)).limit(1);
    if (!before) return jsonError("التقييم غير موجود", 404);
    await db.update(courseReviews).set({ status, updatedAt: now }).where(eq(courseReviews.id, id));
    await audit(request, authorization.actor, "moderate", "review", String(id), { status: before.status }, { status });
    return Response.json({ ok: true });
  }

  if (action === "saveSettings") {
    const values = payload.values && typeof payload.values === "object" ? payload.values as Record<string, unknown> : {};
    const entries = Object.entries(values).filter(([key]) => key in PUBLIC_SETTING_DEFAULTS).map(([key, value]) => {
      const cleaned = cleanText(value, 500);
      return [key as PublicSettingKey, key.endsWith("_enabled") ? cleaned.toLowerCase() : cleaned] as const;
    });
    if (!entries.length) return jsonError("لا توجد إعدادات صالحة");
    for (const [key, value] of entries) {
      if (key.startsWith("social_") && !safeUrl(value)) return jsonError(`رابط ${SETTING_META[key].label} يجب أن يبدأ بـ https`);
      if (key === "support_email" && value && !validEmail(value)) return jsonError("بريد الدعم غير صالح");
      if (key === "whatsapp_number" && value && !/^\+?[0-9\s-]{9,20}$/.test(value)) return jsonError("رقم واتساب غير صالح");
      if (key.endsWith("_enabled") && !["true", "false"].includes(value)) return jsonError(`قيمة ${SETTING_META[key].label} يجب أن تكون true أو false`);
    }
    await db.transaction(async (tx) => {
      for (const [key, value] of entries) {
        await tx.insert(platformSettings).values({ key, value, category: SETTING_META[key].category, isPublic: true, updatedBy: authorization.actor, updatedAt: now }).onConflictDoUpdate({ target: platformSettings.key, set: { value, category: SETTING_META[key].category, isPublic: true, updatedBy: authorization.actor, updatedAt: now } });
      }
      await tx.insert(auditLogs).values({ actorEmail: authorization.actor, action: "update", entityType: "platform_settings", entityId: "public", beforeJson: null, afterJson: asJson(Object.fromEntries(entries)), ipAddress: clientIp(request) });
    });
    invalidatePublicSettingsCache();
    return Response.json({ ok: true });
  }

  if (action === "createNotification") {
    const audience = cleanText(payload.audience, 30) || "student";
    const title = cleanText(payload.title, 160);
    const body = cleanText(payload.body, 1000);
    const userEmail = cleanText(payload.userEmail, 180).toLowerCase() || null;
    const requestedActionUrl = cleanText(payload.actionUrl, 300);
    const actionUrl = requestedActionUrl ? normalizeInternalActionPath(requestedActionUrl) : null;
    const actionLabel = cleanText(payload.actionLabel, 80) || null;
    const presentation = cleanText(payload.presentation, 20) || "inbox";
    const requestedPush = payload.pushEnabled !== false;
    const startsAt = cleanText(payload.startsAt, 40) || null;
    const expiresAt = cleanText(payload.expiresAt, 40) || null;
    const dismissible = payload.dismissible !== false;
    if (!["student", "public", "supervisor", "admin", "user"].includes(audience) || !["inbox", "banner", "modal", "all"].includes(presentation) || title.length < 3 || body.length < 3 || (requestedActionUrl && !actionUrl) || (startsAt && Number.isNaN(new Date(startsAt).getTime())) || (expiresAt && Number.isNaN(new Date(expiresAt).getTime()))) return jsonError("تحقق من بيانات الإشعار والرابط الداخلي المدعوم");
    if (!dismissible && !actionUrl) return jsonError("الإعلان غير القابل للإخفاء يحتاج زرًا يقود إلى رابط داخلي مدعوم");
    if (startsAt && expiresAt && new Date(expiresAt).getTime() <= new Date(startsAt).getTime()) return jsonError("فترة الإعلان غير صحيحة");
    if (requestedPush && startsAt && new Date(startsAt).getTime() > Date.now()) return jsonError("الإرسال المجدول للتنبيهات الفورية غير مفعّل على الخادم. عطّل Push لحفظ الإعلان المجدول داخل التطبيق.", 409);
    if ((audience === "user") !== Boolean(userEmail) || (audience === "public" && userEmail)) return jsonError("الإشعار الفردي يتطلب بريدًا، والإشعار العام لا يقبل بريدًا محددًا");
    if (userEmail) {
      const [target] = await db.select({ role: users.role, status: users.status }).from(users).where(eq(users.email, userEmail)).limit(1);
      if (!target || target.status !== "active" || (audience !== "user" && target.role !== audience)) return jsonError("الحساب المستهدف غير موجود أو لا يطابق فئة الإشعار");
    }
    const pushEnabled = requestedPush && (!startsAt || new Date(startsAt).getTime() <= Date.now());
    const [created] = await db.insert(notificationsDb).values({ audience, title, body, userEmail, actionUrl, actionLabel, presentation, pushEnabled, startsAt, expiresAt, dismissible, createdAt: now }).returning({ id: notificationsDb.id });
    if (pushEnabled) await sendPushNotification({ userEmail, audience }, title, body, { route: actionUrl || "/notifications", notificationId: created.id });
    await audit(request, authorization.actor, "create", "notification", String(created.id), null, { audience, title, userEmail });
    return Response.json({ ok: true, id: created.id }, { status: 201 });
  }

  if (action === "saveCoupon") {
    const code = cleanText(payload.code, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    const type = cleanText(payload.type, 20);
    const value = Number(payload.value);
    const courseSlug = cleanText(payload.courseSlug, 80) || null;
    const usageLimitValue = Number(payload.usageLimit);
    const usageLimit = Number.isFinite(usageLimitValue) && usageLimitValue > 0 ? Math.floor(usageLimitValue) : null;
    const startsAt = cleanText(payload.startsAt, 40) || null;
    const expiresAt = cleanText(payload.expiresAt, 40) || null;
    const status = cleanText(payload.status, 20) || "active";
    const startsTime = startsAt ? new Date(startsAt).getTime() : null;
    const expiresTime = expiresAt ? new Date(expiresAt).getTime() : null;
    if (code.length < 3 || !["percent", "fixed"].includes(type) || !Number.isFinite(value) || value <= 0 || (type === "percent" && value > 95) || !["active", "disabled"].includes(status) || (startsAt && startsTime !== null && Number.isNaN(startsTime)) || (expiresAt && expiresTime !== null && Number.isNaN(expiresTime)) || (startsTime !== null && expiresTime !== null && expiresTime <= startsTime)) return jsonError("تحقق من بيانات الكوبون (النسبة حتى 95% والتواريخ متسقة)");
    if (courseSlug && (!validSlug(courseSlug) || !await getCourseCatalog(courseSlug, true))) return jsonError("المادة المحددة للكوبون غير موجودة");
    const couponValues = { type, value, courseSlug, usageLimit, startsAt, expiresAt, status };
    await db.insert(couponsDb).values({ code, ...couponValues, createdAt: now }).onConflictDoUpdate({ target: couponsDb.code, set: couponValues });
    await audit(request, authorization.actor, "save", "coupon", code, null, couponValues);
    return Response.json({ ok: true, coupon: { code, ...couponValues } });
  }

  return jsonError("الإجراء غير معروف", 404);
}
