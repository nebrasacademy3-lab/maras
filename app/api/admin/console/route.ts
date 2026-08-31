import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs, authSessions, catalogCourses, catalogInstitutions, catalogSpecialties, couponsDb, courseAccess, courseAccessEvents, courseRequestFiles, courseRequests,
  courseReviews, courseUnitsDb, institutionSpecialties, lessonsDb, notificationsDb, orderItems, orders, paymentEvents, platformSettings,
  pushDevices, supervisorAssignments, supportReplyFiles, supportReplies, supportTickets, users, videoAssets,
} from "@/db/schema";
import { cleanText, isAdminRequest, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, getSessionUser, roleAllowed, sameOriginRequest, validEmail } from "@/lib/auth";
import { getCourseCatalog, getCoursesCatalog, getInstitutionCatalog, getInstitutionsCatalog, invalidateCatalogCache } from "@/lib/catalog-store";
import { ADMIN_SETTING_DEFAULTS, invalidatePublicSettingsCache, PUBLIC_SETTING_DEFAULTS, SETTING_META, type SettingKey } from "@/lib/platform-settings";
import { createAndSendNotification } from "@/lib/notifications";
import { sendPushNotification } from "@/lib/push";
import { dispatchDuePushNotifications } from "@/lib/push-campaigns";
import { syncCatalogTemplates } from "@/lib/catalog-sync";
import { syncOfficialInstitutionPrograms } from "@/lib/catalog-official-sync";
import { courseSlug, institutionSlug as makeInstitutionSlug, lessonId, specialtySlug } from "@/lib/catalog-templates";
import { deleteAdminEntity, DeletionPolicyError, type AdminDeletionType } from "@/lib/admin-deletion";
import { accessExpiryIso, normalizeAccessDurationDays } from "@/lib/course-access";

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

const courseRequestStatusArabic: Record<string, string> = {
  new: "جديد",
  assigned: "تم الإسناد",
  reviewing: "قيد المراجعة",
  planned: "ضمن الخطة",
  producing: "قيد التجهيز",
  available: "متاح",
  declined: "متعذر حاليًا",
};

const supportStatusArabic: Record<string, string> = {
  new: "جديدة",
  open: "مفتوحة",
  waiting: "بانتظار الرد",
  resolved: "تم الحل",
  closed: "مغلقة",
};

export async function GET(request: Request) {
  const authorization = await authorize(request);
  if (!authorization) return jsonError("غير مصرح", 403);
  const identity = authorization.user ? `user:${authorization.user.id}` : `machine:${clientIp(request)}`;
  if (!await checkRateLimit("admin-console-read", identity, 30, 60)) return jsonError("طلبات إدارية كثيرة. حاول بعد دقيقة.", 429);
  const db = getDb();
  const compactMobile = new URL(request.url).searchParams.get("client") === "mobile";
  const limits = compactMobile
    ? { videos: 120, users: 160, sessions: 600, orders: 180, requests: 160, files: 600, tickets: 120, replies: 700, reviews: 180, access: 400, assignments: 250, notifications: 120, coupons: 120, audits: 60 }
    : { videos: 500, users: 500, sessions: 3000, orders: 300, requests: 300, files: 3000, tickets: 300, replies: 2000, reviews: 300, access: 500, assignments: 500, notifications: 200, coupons: 200, audits: 120 };
  const [institutionRows, courses, specialtyRows, links, unitRows, lessonRows, videoRows, studentRows, sessionRows, orderRows, requestRows, requestFileRows, ticketRows, replyRows, supportFileRows, reviewRows, accessRows, supervisorRows, notificationRows, couponRows, settingRows, audits] = await Promise.all([
    getInstitutionsCatalog(true),
    getCoursesCatalog(true),
    db.select().from(catalogSpecialties).orderBy(catalogSpecialties.name),
    db.select().from(institutionSpecialties),
    db.select().from(courseUnitsDb).orderBy(courseUnitsDb.position),
    db.select().from(lessonsDb).orderBy(lessonsDb.position),
    db.select().from(videoAssets).orderBy(desc(videoAssets.createdAt)).limit(limits.videos),
    db.select({ id: users.id, email: users.email, phone: users.phone, fullName: users.fullName, role: users.role, universitySlug: users.universitySlug, specialty: users.specialty, academicLevel: users.academicLevel, profileCompletedAt: users.profileCompletedAt, onboardingCompletedAt: users.onboardingCompletedAt, lastLoginAt: users.lastLoginAt, status: users.status, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt)).limit(limits.users),
    db.select({ id: authSessions.id, userId: authSessions.userId, deviceId: authSessions.deviceId, deviceLabel: authSessions.deviceLabel, platform: authSessions.platform, ipAddress: authSessions.ipAddress, userAgent: authSessions.userAgent, lastSeenAt: authSessions.lastSeenAt, expiresAt: authSessions.expiresAt, revokedAt: authSessions.revokedAt, createdAt: authSessions.createdAt }).from(authSessions).orderBy(desc(authSessions.lastSeenAt)).limit(limits.sessions),
    db.select().from(orders).orderBy(desc(orders.createdAt)).limit(limits.orders),
    db.select().from(courseRequests).orderBy(desc(courseRequests.createdAt)).limit(limits.requests),
    db.select().from(courseRequestFiles).orderBy(desc(courseRequestFiles.createdAt)).limit(limits.files),
    db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt)).limit(limits.tickets),
    db.select().from(supportReplies).orderBy(asc(supportReplies.createdAt)).limit(limits.replies),
    db.select().from(supportReplyFiles).limit(limits.files),
    db.select().from(courseReviews).orderBy(desc(courseReviews.createdAt)).limit(limits.reviews),
    db.select().from(courseAccess).orderBy(desc(courseAccess.startsAt)).limit(limits.access),
    db.select().from(supervisorAssignments).orderBy(desc(supervisorAssignments.createdAt)).limit(limits.assignments),
    db.select().from(notificationsDb).orderBy(desc(notificationsDb.createdAt)).limit(limits.notifications),
    db.select().from(couponsDb).orderBy(desc(couponsDb.createdAt)).limit(limits.coupons),
    db.select().from(platformSettings),
    db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limits.audits),
  ]);
  const settings = { ...PUBLIC_SETTING_DEFAULTS, ...ADMIN_SETTING_DEFAULTS } as Record<string, string>;
  for (const row of settingRows) settings[row.key] = row.value;
  const [managedInstitutionRows, managedCourseRows] = await Promise.all([
    db.select().from(catalogInstitutions),
    db.select().from(catalogCourses),
  ]);
  const managedInstitutionMap = new Map(managedInstitutionRows.map((row) => [row.slug, row]));
  const managedCourseMap = new Map(managedCourseRows.map((row) => [row.slug, row]));
  const paid = orderRows.filter((row) => row.status === "paid");
  const revenue = paid.reduce((sum, row) => sum + row.total, 0);
  return Response.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    metrics: {
      students: studentRows.filter((row) => row.role === "student").length,
      activeStudents: studentRows.filter((row) => row.role === "student" && row.status === "active").length,
      institutions: institutionRows.length,
      publishedCourses: courses.filter((row) => row.lessons > 0).length,
      orders: orderRows.length,
      paidOrders: paid.length,
      revenue,
      openRequests: requestRows.filter((row) => !["available", "declined"].includes(row.status)).length,
      openTickets: ticketRows.filter((row) => !["resolved", "closed"].includes(row.status)).length,
      pendingReviews: reviewRows.filter((row) => row.status === "pending").length,
    },
    institutions: institutionRows.map((row) => ({ ...row, status: managedInstitutionMap.get(row.slug)?.status || "published" })),
    courses: courses.map((row) => ({ ...row, status: managedCourseMap.get(row.slug)?.status || "published", specialtySlug: managedCourseMap.get(row.slug)?.specialtySlug || "", coverTheme: managedCourseMap.get(row.slug)?.coverTheme || "blue-violet" })),
    specialties: specialtyRows,
    specialtyLinks: links,
    units: unitRows,
    lessons: lessonRows,
    videos: videoRows,
    users: studentRows.map((student) => {
      const activeSessions = sessionRows.filter((session) => session.userId === student.id && !session.revokedAt && new Date(session.expiresAt).getTime() > Date.now());
      const deviceKeys = new Set(activeSessions.map((session) => session.deviceId || `session:${session.id}`));
      return {
        ...student,
        deviceCount: deviceKeys.size,
        sessions: activeSessions.map((session) => ({ id: session.id, deviceId: session.deviceId, deviceLabel: session.deviceLabel || (session.platform === "mobile" ? "تطبيق مراس" : "متصفح ويب"), platform: session.platform, ipAddress: session.ipAddress, lastSeenAt: session.lastSeenAt, expiresAt: session.expiresAt, createdAt: session.createdAt })),
      };
    }),
    deviceLimit: Math.max(1, Math.min(10, Number(settings.max_student_devices) || 2)),
    orders: orderRows,
    requests: requestRows.map((request) => ({ ...request, student: request.userId ? (() => { const student = studentRows.find((user) => user.id === request.userId); return student ? { fullName: student.fullName, email: student.email, phone: student.phone, universitySlug: student.universitySlug, specialty: student.specialty, academicLevel: student.academicLevel, status: student.status } : null; })() : null, files: requestFileRows.filter((file) => file.requestId === request.id).map((file) => ({ id: file.id, requestId: file.requestId, originalName: file.originalName, contentType: file.contentType, sizeBytes: file.sizeBytes, createdAt: file.createdAt })) })),
    tickets: ticketRows.map((ticket) => {
      const ticketReplies = replyRows
        .filter((reply) => reply.ticketId === ticket.id)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map((reply) => ({
          ...reply,
          files: supportFileRows
            .filter((file) => file.replyId === reply.id)
            .map((file) => ({ id: file.id, replyId: file.replyId, ticketId: file.ticketId, originalName: file.originalName, contentType: file.contentType, sizeBytes: file.sizeBytes, createdAt: file.createdAt })),
        }));
      const first = ticketReplies[0];
      const legacyAttachmentOnly = first && !first.body?.trim() && first.authorRole === "student" && first.files.length > 0;
      const replies = legacyAttachmentOnly
        ? [{ ...first, body: ticket.message || "" }, ...ticketReplies.slice(1)]
        : ticketReplies.length
          ? ticketReplies
          : [{ id: -ticket.id, ticketId: ticket.id, replyToId: null, authorEmail: ticket.userEmail, authorRole: "student", body: ticket.message || "", internal: false, createdAt: ticket.createdAt, files: [] }];
      return {
        ...ticket,
        student: ticket.userEmail ? (() => {
          const student = studentRows.find((user) => user.email.toLowerCase() === ticket.userEmail!.toLowerCase());
          return student ? { fullName: student.fullName, email: student.email, phone: student.phone, universitySlug: student.universitySlug, specialty: student.specialty, academicLevel: student.academicLevel, status: student.status } : null;
        })() : null,
        replies,
      };
    }),
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

  if (action === "dispatchNotifications") {
    const result = await dispatchDuePushNotifications(50);
    await audit(request, authorization.actor, "dispatch", "notification_campaigns", "due", null, result);
    return Response.json({ ok: true, push: { scheduled: false, ...result } });
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

  if (action === "syncOfficialPrograms") {
    const institutionSlug = cleanText(payload.institutionSlug, 80);
    if (!validSlug(institutionSlug)) return jsonError("حدد جامعة صالحة للتحقق من برامجها");
    try {
      const result = await syncOfficialInstitutionPrograms(institutionSlug);
      await audit(request, authorization.actor, "sync", "official_programs", institutionSlug, null, result);
      return Response.json({ ok: true, result }, { headers: { "cache-control": "no-store" } });
    } catch (error) {
      if (error instanceof Error && error.message === "institution_not_found") return jsonError("الجامعة غير موجودة", 404);
      console.error("[official-programs-sync] failed", error instanceof Error ? error.message : "unknown error");
      return jsonError("تعذر الاتصال بالمصدر الرسمي الآن. لم تتغير البيانات الحالية.", 502);
    }
  }

  if (action === "saveInstitution") {
    const name = cleanText(payload.name, 140);
    const suppliedSlug = cleanText(payload.slug, 80).toLowerCase();
    const slug = suppliedSlug || makeInstitutionSlug(name);
    const nameEn = cleanText(payload.nameEn, 140);
    const region = cleanText(payload.region, 80);
    const type = cleanText(payload.type, 30);
    const domain = cleanText(payload.domain, 180).replace(/^https?:\/\//, "").replace(/\/$/, "");
    const logoUrl = cleanText(payload.logoUrl, 500);
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
    const values = { slug, name, nameEn, region, type, domain: domain || null, logoUrl: logoUrl || before?.logoUrl || null, directorySourceUrl: directorySourceUrl || before?.directorySourceUrl || null, verificationStatus: verificationStatus === "pending-review" && before?.verificationStatus === "official-directory" ? "official-directory" : verificationStatus, aliasesJson: aliasesJson ?? before?.aliasesJson ?? "[]", status, featured: payload.featured === true, sortOrder: Number.isFinite(Number(payload.sortOrder)) ? Math.floor(Number(payload.sortOrder)) : 0, updatedAt: now };
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
    const coverImageUrl = cleanText(payload.coverImageUrl, 1000);
    const [specialty] = await db.select().from(catalogSpecialties).where(eq(catalogSpecialties.slug, specialtySlug)).limit(1);
    if (!specialty) return jsonError("أنشئ التخصص أو اربطه أولًا");
    const slug = suppliedSlug || courseSlug(institutionSlug, specialty.name, title);
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
      accessDurationDays: normalizeAccessDurationDays(payload.accessDurationDays, cleanText(payload.accessLabel, 80)),
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
    if (before.email === authorization.actor && (status !== "active" || role !== "admin")) return jsonError("لا يمكنك تعطيل صلاحية حسابك الإداري الحالي");
    await db.update(users).set({ status, role, updatedAt: now }).where(eq(users.id, id));
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
    const [supervisor] = await db.select({ id: users.id, role: users.role, email: users.email }).from(users).where(eq(users.id, supervisorId)).limit(1);
    if (!supervisor || supervisor.role !== "supervisor") return jsonError("الحساب المحدد ليس مشرفًا");
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
    const course = await getCourseCatalog(courseSlug, true);
    if (!validEmail(userEmail) || !course) return jsonError("تحقق من الطالب والمادة");
    const [student] = await db.select({ id: users.id, fullName: users.fullName, phone: users.phone, role: users.role }).from(users).where(eq(users.email, userEmail)).limit(1);
    if (!student || student.role !== "student") return jsonError("الطالب غير موجود", 404);
    const expiresAt = cleanText(payload.expiresAt, 40) || null;
    if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) return jsonError("تاريخ انتهاء الصلاحية غير صحيح");
    const suppliedPrice = Number(payload.price);
    const grantType = cleanText(payload.grantType, 30) === "manual_payment" ? "manual_payment" : "complimentary";
    const price = grantType === "manual_payment" && Number.isFinite(suppliedPrice) && suppliedPrice >= 0 ? Math.round(suppliedPrice * 100) / 100 : 0;
    const orderNumber = grantType === "manual_payment" ? `MANUAL-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}` : null;
    const resolvedExpiry = expiresAt || accessExpiryIso(normalizeAccessDurationDays(course.accessDurationDays, course.access), new Date(now));
    let grantedExpiry: string | null = resolvedExpiry;
    let accessId: number | undefined;
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`course-access:${userEmail}:${courseSlug}`}))`);
      if (orderNumber) {
        await tx.insert(orders).values({ orderNumber, customerEmail: userEmail, customerName: student.fullName, customerPhone: student.phone, courseSlug, subtotal: price, discount: 0, total: price, currency: "SAR", status: "paid", paymentMethod: "manual", createdAt: now, paidAt: now, updatedAt: now });
        await tx.insert(orderItems).values({ orderNumber, courseSlug, unitPrice: price, discount: 0, total: price, accessDurationDays: normalizeAccessDurationDays(course.accessDurationDays, course.access), createdAt: now });
        await tx.insert(paymentEvents).values({ provider: "admin", providerEventId: `admin-payment:${orderNumber}`, orderNumber, status: "paid", payload: JSON.stringify({ source: "manual_payment", actor: authorization.actor, price, courseSlug, userEmail }), receivedAt: now });
      }
      const [existingAccess] = await tx.select().from(courseAccess).where(and(eq(courseAccess.userEmail, userEmail), eq(courseAccess.courseSlug, courseSlug))).limit(1);
      if (existingAccess && !existingAccess.revokedAt) {
        if (!existingAccess.expiresAt) grantedExpiry = null;
        else if (grantedExpiry && Date.parse(existingAccess.expiresAt) > Date.parse(grantedExpiry)) grantedExpiry = existingAccess.expiresAt;
      }
      const startAt = existingAccess && !existingAccess.revokedAt ? existingAccess.startsAt : now;
      const [access] = await tx.insert(courseAccess).values({ userEmail, courseSlug, source: grantType === "manual_payment" ? "admin_payment" : "admin_complimentary", orderNumber, expiresAt: grantedExpiry, startsAt: startAt, suspendedAt: null, suspensionReason: null, revokedAt: null, revocationReason: null, updatedAt: now }).onConflictDoUpdate({ target: [courseAccess.userEmail, courseAccess.courseSlug], set: { revokedAt: null, revocationReason: null, suspendedAt: null, suspensionReason: null, source: grantType === "manual_payment" ? "admin_payment" : "admin_complimentary", orderNumber, expiresAt: grantedExpiry, startsAt: startAt, updatedAt: now } }).returning({ id: courseAccess.id });
      accessId = access?.id;
      await tx.insert(courseAccessEvents).values({ eventKey: `admin:${crypto.randomUUID()}`, accessId, userEmail, courseSlug, action: grantType === "manual_payment" ? "manual_payment_granted" : "complimentary_granted", actorEmail: authorization.actor, reason: cleanText(payload.reason, 500) || "منحة إدارية", orderNumber, beforeJson: existingAccess ? JSON.stringify(existingAccess) : null, afterJson: JSON.stringify({ expiresAt: grantedExpiry, price, grantType }), createdAt: now });
    });
    const notificationTitle = "تم تفعيل المادة";
    const notificationBody = `أصبحت مادة «${course.title || courseSlug}» متاحة في حسابك.`;
    const [notice] = await db.insert(notificationsDb).values({ userEmail, audience: "student", title: notificationTitle, body: notificationBody, actionUrl: `/learn/${courseSlug}`, actionLabel: "فتح المادة", template: "success", dedupeKey: `access:${accessId}:grant:${now}`, pushStatus: "processing", pushClaimedAt: now, createdAt: now }).returning({ id: notificationsDb.id }).catch(() => []);
    const push = await sendPushNotification({ userEmail }, notificationTitle, notificationBody, { route: `/learn/${courseSlug}`, notificationId: notice?.id || 0 });
    if (notice) await db.update(notificationsDb).set({ pushStatus: push.accepted > 0 ? "accepted" : push.attempted === 0 ? "no_devices" : "failed", pushAttempts: 1, pushLastError: push.providerErrors.join(" | ").slice(0, 1000) || null, pushDeliveredAt: push.accepted > 0 ? new Date().toISOString() : null }).where(eq(notificationsDb.id, notice.id));
    await audit(request, authorization.actor, "grant", "course_access", `${userEmail}:${courseSlug}`, null, { expiresAt: grantedExpiry, price, orderNumber, grantType });
    return Response.json({ ok: true, orderNumber, price, grantType, push });
  }

  if (action === "updateAccess") {
    const accessId = Math.floor(Number(payload.id));
    const operation = cleanText(payload.operation, 30);
    const reason = cleanText(payload.reason, 500);
    const suppliedOperationKey = cleanText(payload.operationKey, 100);
    const operationKey = /^[A-Za-z0-9_-]{12,90}$/.test(suppliedOperationKey) ? suppliedOperationKey : crypto.randomUUID();
    if (!accessId || !["pause", "resume", "extend", "revoke"].includes(operation)) return jsonError("إجراء الاشتراك غير صالح");
    if (["pause", "revoke"].includes(operation) && reason.length < 3) return jsonError("اكتب سبب الإجراء ليظهر في سجل الاشتراك");
    const [before] = await db.select().from(courseAccess).where(eq(courseAccess.id, accessId)).limit(1);
    if (!before) return jsonError("الاشتراك غير موجود", 404);
    const [course] = await Promise.all([getCourseCatalog(before.courseSlug, true)]);
    const changes: Partial<typeof courseAccess.$inferInsert> = { updatedAt: now };
    let extensionDays = 0;
    let notificationTitle = "تم تحديث اشتراكك";
    let notificationBody = `تم تحديث الوصول إلى مادة «${course?.title || before.courseSlug}».`;
    if (operation === "pause") {
      if (before.revokedAt) return jsonError("الاشتراك ملغي ولا يمكن إيقافه مؤقتًا", 409);
      changes.suspendedAt = now; changes.suspensionReason = reason;
      notificationTitle = "تم إيقاف الوصول مؤقتًا"; notificationBody = `أُوقف الوصول إلى مادة «${course?.title || before.courseSlug}» مؤقتًا. السبب: ${reason}`;
    } else if (operation === "resume") {
      if (before.revokedAt) return jsonError("الاشتراك ملغي؛ امنح صلاحية جديدة بدل الاستئناف", 409);
      if (before.suspendedAt && before.expiresAt) {
        const pauseDuration = Math.max(0, Date.now() - Date.parse(before.suspendedAt));
        if (Number.isFinite(pauseDuration)) changes.expiresAt = new Date(Date.parse(before.expiresAt) + pauseDuration).toISOString();
      }
      changes.suspendedAt = null; changes.suspensionReason = null;
      notificationTitle = "تم استئناف الوصول"; notificationBody = `يمكنك متابعة مادة «${course?.title || before.courseSlug}» الآن.`;
    } else if (operation === "extend") {
      const days = Math.floor(Number(payload.days));
      extensionDays = days;
      if (!Number.isInteger(days) || days < 1 || days > 3650) return jsonError("مدة التمديد يجب أن تكون بين يوم و3650 يومًا");
      const currentEnd = before.expiresAt && Date.parse(before.expiresAt) > Date.now() ? new Date(before.expiresAt) : new Date();
      changes.expiresAt = accessExpiryIso(days, currentEnd);
      notificationTitle = "تم تمديد اشتراكك"; notificationBody = `مُدّد وصولك إلى مادة «${course?.title || before.courseSlug}» لمدة ${days} يومًا.`;
    } else {
      changes.revokedAt = now; changes.revocationReason = reason; changes.suspendedAt = null; changes.suspensionReason = null;
      notificationTitle = "تم إيقاف الوصول"; notificationBody = `تم إيقاف الوصول إلى مادة «${course?.title || before.courseSlug}». السبب: ${reason}`;
    }
    let noticeId: number | undefined;
    let transactionError: { message: string; status: number } | null = null;
    let committedBefore = before;
    let committedChanges = changes;
    let replayed = false;
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`course-access:${accessId}`}))`);
      const [current] = await tx.select().from(courseAccess).where(eq(courseAccess.id, accessId)).limit(1);
      if (!current) { transactionError = { message: "الاشتراك غير موجود", status: 404 }; return; }
      const eventKey = `admin-access:${accessId}:${operationKey}`;
      const [previousEvent] = await tx.select({ id: courseAccessEvents.id }).from(courseAccessEvents).where(eq(courseAccessEvents.eventKey, eventKey)).limit(1);
      if (previousEvent) { replayed = true; committedBefore = current; return; }
      if (operation === "pause" && current.revokedAt) { transactionError = { message: "الاشتراك ملغي ولا يمكن إيقافه مؤقتًا", status: 409 }; return; }
      if (operation === "pause" && current.suspendedAt) { transactionError = { message: "الاشتراك متوقف مؤقتًا بالفعل", status: 409 }; return; }
      if (operation === "resume" && current.revokedAt) { transactionError = { message: "الاشتراك ملغي؛ امنح صلاحية جديدة بدل الاستئناف", status: 409 }; return; }
      if (operation === "resume" && !current.suspendedAt) { transactionError = { message: "الاشتراك غير متوقف مؤقتًا", status: 409 }; return; }
      if (operation === "extend" && current.revokedAt) { transactionError = { message: "لا يمكن تمديد اشتراك ملغي", status: 409 }; return; }
      if (operation === "revoke" && current.revokedAt) { transactionError = { message: "الاشتراك ملغي بالفعل", status: 409 }; return; }

      const lockedChanges: Partial<typeof courseAccess.$inferInsert> = { ...changes, updatedAt: now };
      if (operation === "resume") {
        delete lockedChanges.expiresAt;
        if (current.suspendedAt && current.expiresAt) {
          const pauseDuration = Math.max(0, Date.now() - Date.parse(current.suspendedAt));
          if (Number.isFinite(pauseDuration)) lockedChanges.expiresAt = new Date(Date.parse(current.expiresAt) + pauseDuration).toISOString();
        }
      } else if (operation === "extend") {
        const currentEnd = current.expiresAt && Date.parse(current.expiresAt) > Date.now() ? new Date(current.expiresAt) : new Date();
        lockedChanges.expiresAt = accessExpiryIso(extensionDays, currentEnd);
      }
      const [after] = await tx.update(courseAccess).set(lockedChanges).where(eq(courseAccess.id, accessId)).returning();
      if (!after) { transactionError = { message: "تعذر تحديث الاشتراك", status: 409 }; return; }
      committedBefore = current;
      committedChanges = lockedChanges;
      await tx.insert(courseAccessEvents).values({ eventKey, accessId, userEmail: current.userEmail, courseSlug: current.courseSlug, action: operation, actorEmail: authorization.actor, reason: reason || null, orderNumber: current.orderNumber, beforeJson: JSON.stringify(current), afterJson: JSON.stringify(after), createdAt: now });
      const [notice] = await tx.insert(notificationsDb).values({ userEmail: current.userEmail, audience: "student", title: notificationTitle, body: notificationBody, actionUrl: operation === "revoke" ? "/dashboard?view=orders" : `/learn/${current.courseSlug}`, actionLabel: operation === "revoke" ? "عرض الطلبات" : "فتح المادة", template: operation === "revoke" || operation === "pause" ? "urgent" : "success", dedupeKey: `access:${accessId}:${operationKey}`, pushStatus: "processing", pushClaimedAt: now, createdAt: now }).onConflictDoNothing({ target: notificationsDb.dedupeKey }).returning({ id: notificationsDb.id });
      noticeId = notice?.id;
    });
    const accessError = transactionError as { message: string; status: number } | null;
    if (accessError) return jsonError(accessError.message, accessError.status);
    if (replayed) return Response.json({ ok: true, replayed: true });
    const push = await sendPushNotification({ userEmail: committedBefore.userEmail }, notificationTitle, notificationBody, { route: operation === "revoke" ? "/dashboard?view=orders" : `/learn/${committedBefore.courseSlug}`, notificationId: noticeId || 0 });
    if (noticeId) await db.update(notificationsDb).set({ pushStatus: push.accepted > 0 ? "accepted" : push.attempted === 0 ? "no_devices" : "failed", pushAttempts: 1, pushLastError: push.providerErrors.join(" | ").slice(0, 1000) || null, pushDeliveredAt: push.accepted > 0 ? new Date().toISOString() : null }).where(eq(notificationsDb.id, noticeId));
    await audit(request, authorization.actor, operation, "course_access", String(accessId), committedBefore, committedChanges);
    return Response.json({ ok: true, push });
  }

  if (action === "revokeUserSession") {
    const sessionId = Math.floor(Number(payload.sessionId));
    if (!sessionId) return jsonError("الجلسة غير صحيحة");
    const [target] = await db.select({ id: authSessions.id, userId: authSessions.userId, deviceId: authSessions.deviceId, revokedAt: authSessions.revokedAt }).from(authSessions).where(eq(authSessions.id, sessionId)).limit(1);
    if (!target) return jsonError("الجهاز غير موجود", 404);
    const [targetUser] = await db.select({ id: users.id, email: users.email, role: users.role }).from(users).where(eq(users.id, target.userId)).limit(1);
    if (!targetUser) return jsonError("المستخدم غير موجود", 404);
    if (targetUser.role === "admin" && authorization.user?.id === targetUser.id) return jsonError("لا يمكن تسجيل خروج جلستك الإدارية الحالية من هنا", 409);
    await db.transaction(async (tx) => {
      await tx.update(authSessions).set({ revokedAt: now }).where(eq(authSessions.id, sessionId));
      if (target.deviceId) await tx.update(pushDevices).set({ status: "revoked", lastSeenAt: now }).where(and(eq(pushDevices.userId, target.userId), eq(pushDevices.deviceId, target.deviceId)));
    });
    await audit(request, authorization.actor, "revoke", "auth_session", String(sessionId), { userId: target.userId, revokedAt: target.revokedAt }, { userId: target.userId, revokedAt: now });
    return Response.json({ ok: true });
  }

  if (action === "prepareRequest") {
    const id = Math.floor(Number(payload.id));
    const courseSlug = cleanText(payload.courseSlug, 80);
    if (!id || !courseSlug || !validSlug(courseSlug)) return jsonError("اختر طلبًا ومادة صالحة");
    const [before] = await db.select().from(courseRequests).where(eq(courseRequests.id, id)).limit(1);
    if (!before) return jsonError("الطلب غير موجود", 404);
    const course = await getCourseCatalog(courseSlug, true);
    if (!course) return jsonError("المادة غير موجودة أو غير منشورة", 404);
    if (before.universitySlug && course.universitySlug && before.universitySlug !== course.universitySlug) return jsonError("المادة لا تتبع جامعة الطلب");
    if (before.specialty && course.specialty && before.specialty !== course.specialty) return jsonError("المادة لا تتبع تخصص الطلب");
    await db.update(courseRequests).set({ status: "available", preparedCourseSlug: course.slug, updatedAt: now }).where(eq(courseRequests.id, id));
    if (before.userId) {
      const [student] = await db.select({ email: users.email }).from(users).where(eq(users.id, before.userId)).limit(1);
      if (student) {
        const title = "تم تجهيز المادة المطلوبة";
        const body = `تم تجهيز مادة «${course.title}» وأصبحت متاحة الآن في حسابك.`;
        await createAndSendNotification({
          values: { userEmail: student.email, audience: "student", title, body, actionUrl: `/learn/${course.slug}`, actionLabel: "فتح المادة", createdAt: now },
          target: { userEmail: student.email },
          data: { route: `/learn/${course.slug}` },
        });
      }
    }
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
    const selectedCourse = status === "available" && selectedCourseSlug ? await getCourseCatalog(selectedCourseSlug, true) : null;
    const matchedCourse = status === "available" ? selectedCourse || (await getCoursesCatalog()).find((course) => course.title.trim() === before.courseName.trim() && (!before.universitySlug || course.universitySlug === before.universitySlug) && (!before.specialty || course.specialty === before.specialty)) : null;
    if (status === "available" && selectedCourseSlug && !selectedCourse) return jsonError("المادة المختارة غير موجودة أو غير منشورة", 404);
    await db.update(courseRequests).set({ status, preparedCourseSlug: matchedCourse?.slug || before.preparedCourseSlug || null, updatedAt: now }).where(eq(courseRequests.id, id));
    if (before.userId) {
      const [student] = await db.select({ email: users.email }).from(users).where(eq(users.id, before.userId)).limit(1);
      if (student) {
        const title = matchedCourse ? "مادتك أصبحت متاحة" : "تحديث طلب المادة";
        const body = matchedCourse ? `أصبحت مادة «${matchedCourse.title}» متاحة الآن في مراس.` : `تغيرت حالة طلب «${before.courseName}» إلى «${courseRequestStatusArabic[status] || status}».`;
        const actionUrl = matchedCourse ? `/learn/${matchedCourse.slug}` : "/dashboard?view=requests";
        await createAndSendNotification({
          values: { userEmail: student.email, audience: "student", title, body, actionUrl, actionLabel: matchedCourse ? "افتح المادة" : "عرض الطلب", createdAt: now },
          target: { userEmail: student.email },
          data: { route: matchedCourse ? `/learn/${matchedCourse.slug}` : "/requests" },
        });
      }
    }
    await audit(request, authorization.actor, "update", "course_request", String(id), { status: before.status }, { status });
    return Response.json({ ok: true });
  }

  if (action === "updateTicket") {
    const id = Math.floor(Number(payload.id));
    const status = cleanText(payload.status, 30);
    const reply = cleanText(payload.reply, 4000);
    if (!id || !["new", "open", "waiting", "resolved", "closed"].includes(status)) return jsonError("حالة التذكرة غير صالحة");
    const [before] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
    if (!before) return jsonError("التذكرة غير موجودة", 404);
    await db.update(supportTickets).set({ status, assignedTo: authorization.actor, updatedAt: now }).where(eq(supportTickets.id, id));
    if (reply) await db.insert(supportReplies).values({ ticketId: id, authorEmail: authorization.actor, authorRole: authorization.user?.role || "admin", body: reply, internal: payload.internal === true, createdAt: now });
    if (before.userEmail && (reply || before.status !== status)) {
      const title = reply ? "رد جديد من دعم مراس" : "تحديث تذكرة الدعم";
      const body = reply ? reply.slice(0, 240) : `تغيرت حالة التذكرة ${before.ticketNumber} إلى «${supportStatusArabic[status] || status}».`;
      await createAndSendNotification({
        values: { userEmail: before.userEmail, audience: "student", title, body, actionUrl: "/support", actionLabel: "فتح المحادثة", createdAt: now },
        target: { userEmail: before.userEmail },
        data: { route: "/support" },
      });
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
    const allowed = [...Object.keys(PUBLIC_SETTING_DEFAULTS), ...Object.keys(ADMIN_SETTING_DEFAULTS)] as SettingKey[];
    const entries = Object.entries(values)
      .filter(([key]) => allowed.includes(key as SettingKey))
      .map(([key, value]) => [key as SettingKey, cleanText(value, key === "announcement" || key.endsWith("description") ? 500 : 300)] as const);
    if (!entries.length) return jsonError("لا توجد إعدادات صالحة");
    for (const [key, value] of entries) {
      if ((key.startsWith("social_") || key === "ios_app_url" || key === "android_app_url") && value && !safeUrl(value)) return jsonError(`رابط ${SETTING_META[key].label} يجب أن يبدأ بـ https`);
      if (key === "support_email" && value && !validEmail(value)) return jsonError("بريد الدعم غير صالح");
      if (key === "whatsapp_number" && value && !/^\+?[0-9\s-]{9,20}$/.test(value)) return jsonError("رقم واتساب غير صالح");
      if (key === "max_student_devices" && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 10)) return jsonError("حد أجهزة الطالب يجب أن يكون بين 1 و10");
      if (key === "content_view_mode" && !["both", "app_only", "web_only"].includes(value)) return jsonError("اختر طريقة مشاهدة محتوى صالحة");
      const meta = SETTING_META[key];
      await db.insert(platformSettings).values({ key, value, category: meta.category, isPublic: meta.isPublic, updatedBy: authorization.actor, updatedAt: now }).onConflictDoUpdate({ target: platformSettings.key, set: { value, category: meta.category, isPublic: meta.isPublic, updatedBy: authorization.actor, updatedAt: now } });
    }
    invalidatePublicSettingsCache();
    await audit(request, authorization.actor, "update", "platform_settings", "settings", null, Object.fromEntries(entries));
    return Response.json({ ok: true });
  }

  if (action === "createNotification") {
    const audience = cleanText(payload.audience, 30) || "student";
    const title = cleanText(payload.title, 160);
    const body = cleanText(payload.body, 1000);
    const userEmail = cleanText(payload.userEmail, 180).toLowerCase() || null;
    const actionUrl = cleanText(payload.actionUrl, 500) || null;
    const actionLabel = cleanText(payload.actionLabel, 80) || null;
    const presentation = cleanText(payload.presentation, 20) || "inbox";
    const template = cleanText(payload.template, 30) || "general";
    const pushEnabled = payload.pushEnabled !== false;
    const startsAt = cleanText(payload.startsAt, 40) || null;
    const expiresAt = cleanText(payload.expiresAt, 40) || null;
    const dismissible = payload.dismissible !== false;
    const actionIsValid = !actionUrl || (actionUrl.startsWith("/") && !actionUrl.startsWith("//")) || (() => { try { return new URL(actionUrl).protocol === "https:"; } catch { return false; } })();
    if (!["student", "public", "supervisor", "admin", "user"].includes(audience) || !["inbox", "banner", "modal", "all"].includes(presentation) || !["general", "discount", "new-course", "new-service", "urgent", "success"].includes(template) || title.length < 3 || body.length < 3 || (userEmail && !validEmail(userEmail)) || (audience === "user" && !userEmail) || !actionIsValid || (startsAt && Number.isNaN(new Date(startsAt).getTime())) || (expiresAt && Number.isNaN(new Date(expiresAt).getTime()))) return jsonError("تحقق من بيانات الإشعار");
    if (startsAt && expiresAt && new Date(expiresAt).getTime() <= new Date(startsAt).getTime()) return jsonError("فترة الإعلان غير صحيحة");
    const pushScheduled = Boolean(pushEnabled && startsAt && new Date(startsAt).getTime() > Date.now());
    const [created] = await db.insert(notificationsDb).values({ audience, title, body, userEmail, actionUrl, actionLabel, presentation, template, pushEnabled, pushStatus: !pushEnabled ? "disabled" : pushScheduled ? "pending" : "processing", pushClaimedAt: pushEnabled && !pushScheduled ? now : null, startsAt, expiresAt, dismissible, createdAt: now }).returning({ id: notificationsDb.id });
    const push = pushScheduled
      ? { scheduled: true, attempted: 0, accepted: 0, rejected: 0, invalidated: 0, providerErrors: [] as string[] }
      : pushEnabled
        ? { scheduled: false, ...await sendPushNotification({ userEmail, audience }, title, body, { ...(actionUrl?.startsWith("https://") ? { url: actionUrl } : { route: actionUrl || "/notifications" }), notificationId: created.id }) }
        : { scheduled: false, attempted: 0, accepted: 0, rejected: 0, invalidated: 0, providerErrors: [] as string[] };
    if (!pushScheduled && pushEnabled) await db.update(notificationsDb).set({ pushStatus: push.accepted > 0 ? "accepted" : push.attempted === 0 ? "no_devices" : "failed", pushAttempts: 1, pushLastError: push.providerErrors.join(" | ").slice(0, 1000) || null, pushDeliveredAt: push.accepted > 0 ? new Date().toISOString() : null }).where(eq(notificationsDb.id, created.id));
    await audit(request, authorization.actor, "create", "notification", String(created.id), null, { audience, title, userEmail, template, actionUrl, push });
    return Response.json({ ok: true, id: created.id, push }, { status: 201 });
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
