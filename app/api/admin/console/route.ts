import { supervisorConsoleMutationAllowed } from "@/lib/supervisor-console-policy";
import { supervisorCourseAllowed, supervisorScopeId, scopedInstitutionSql, scopedSubjectSql, scopedCourseSql, scopedStudentSql, scopedOrderSql, scopedRequestSql } from "@/lib/supervisor-data-scope";
import {adminConsoleNeeds} from "@/lib/admin-console-scope";
import { revalidatePath } from "next/cache";
import { CONSOLE_VIEWS, consoleActionPermissions, permissionsCover } from "@/lib/staff-policy";
import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  aiApiKeys, auditLogs, authDevices, authSessions, catalogCourses, catalogInstitutions, catalogSpecialties, couponsDb, courseAccess, courseAccessEvents, courseRequestFiles, courseRequests,
  courseReviews, courseUnitsDb, courseWaitlist, institutionSpecialties, lessonsDb, notificationsDb, orderItems, orders, paymentEvents, platformSettings,
  pushDevices, supervisorAssignments, supportReplyFiles, supportReplies, supportTickets, users, videoAssets,
} from "@/db/schema";
import { cleanText, finiteNumber, isAdminRequest, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, getSessionUser, roleAllowed, sameOriginRequest, validEmail } from "@/lib/auth";
import { AdminMfaError, adminMfaConfigured, requireAdminStepUp } from "@/lib/admin-mfa";
import { geminiEnvironmentKeys } from "@/lib/ai-keys";
import { getCourseCatalog, getCoursesCatalog, getInstitutionCatalog, getInstitutionsCatalog, invalidateCatalogCache } from "@/lib/catalog-store";
import { ADMIN_SETTING_DEFAULTS, invalidatePublicSettingsCache, PUBLIC_SETTING_DEFAULTS, SETTING_META, type SettingKey } from "@/lib/platform-settings";
import { createAndSendNotification } from "@/lib/notifications";
import { sendPushNotification } from "@/lib/push";
import { dispatchDuePushNotifications } from "@/lib/push-campaigns";
import { syncCatalogTemplates } from "@/lib/catalog-sync";
import { syncOfficialInstitutionPrograms } from "@/lib/catalog-official-sync";
import { automaticIdentifier } from "@/lib/public-identifiers";
import { deleteAdminEntity, DeletionPolicyError, type AdminDeletionType } from "@/lib/admin-deletion";
import { accessExpiryIso, normalizeAccessDurationDays, effectiveAccessRows } from "@/lib/course-access";
import { ADMIN_PERMISSIONS, hasPermission, permissionsForUser, type AdminPermission } from "@/lib/permissions";
import { getSupervisorScopes, supervisorScopesAllow } from "@/lib/supervisor-scope";
import { adminPage, adminUserTransitionError, extendAccessExpiry } from "@/lib/admin-operations";
import { fulfillPaidOrderTx, type FulfillmentNotice } from "@/lib/order-fulfillment";
import { readBoundedJsonObject } from "@/lib/request-body";
import { isSocialSettingKey, normalizeSocialUrl, normalizeWhatsappNumber } from "@/lib/social-links";

import { enqueuePublicSeoUrls, indexNowConfig } from "@/lib/seo-indexnow";
import { seoSegment } from "@/lib/seo";

async function notifyCatalogDiscovery(paths: string[]) {
  for (const path of [...new Set(["/sitemap.xml", "/llms.txt", ...paths])]) {
    try { revalidatePath(path); } catch { /* Non-Next isolated workers use the catalog TTL instead. */ }
  }
  try { if (indexNowConfig().enabled) await enqueuePublicSeoUrls(paths); }
  catch { console.error("[seo] Catalog saved; discovery queue unavailable"); }
}

async function authorize(request: Request, delegatedPermission?: AdminPermission) {
  const user = await getSessionUser(request);
  if (roleAllowed(user, ["admin", "supervisor"])) return { actor: user!.email, user };
  if (user && delegatedPermission && await hasPermission(user, delegatedPermission)) return { actor: user.email, user };
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
  const query = new URL(request.url).searchParams;
  const grants = authorization.user ? await permissionsForUser(authorization.user) : new Set(Object.values(ADMIN_PERMISSIONS));
  const owner = Boolean(authorization.user?.isPlatformOwner);
  const scopeId = await supervisorScopeId(authorization.user);
  const scopedSupervisor = scopeId !== null;
  const supervisorScopes = scopedSupervisor ? await getSupervisorScopes(scopeId) : [];
  const can = (permission: string) => permissionsCover(grants, [permission]);
  const compactMobile = query.get("client") === "mobile";
  const view = query.get("view") || "overview";
  if (!CONSOLE_VIEWS[view] || !permissionsCover(grants, CONSOLE_VIEWS[view])) return jsonError("هذا القسم غير متاح ضمن صلاحياتك", 403);
  const scoped=query.get("scope")==="screen";
  const needs=(key:string)=>adminConsoleNeeds(view,key,scoped);
  const page = adminPage(query.get("page"));
  const needle = (query.get("q") || "").trim().slice(0, 160);
  const pattern = `%${needle.replace(/[\\%_]/g, "\\$&")}%`;
  const userFilter = and(scopedStudentSql(scopeId, users.id, "id"), !owner ? and(eq(users.role, "student"), needle ? or(ilike(users.fullName, pattern), ilike(users.email, pattern), ilike(users.phone, pattern)) : undefined) : ["students", "staff"].includes(view) ? and(view === "students" ? eq(users.role, "student") : inArray(users.role, ["admin", "supervisor"]), needle ? or(ilike(users.fullName, pattern), ilike(users.email, pattern), ilike(users.phone, pattern), ilike(users.specialty, pattern)) : undefined) : undefined);
  const orderFilter = and(scopedOrderSql(scopeId, orders.orderNumber), view === "orders" && needle ? or(ilike(orders.orderNumber, pattern), ilike(orders.customerEmail, pattern), ilike(orders.customerName, pattern), ilike(orders.courseSlug, pattern), ilike(orders.status, pattern)) : undefined);
  const requestFilter = and(scopedRequestSql(scopeId, courseRequests.id), view === "requests" && needle ? or(sql`${courseRequests.id}::text = ${needle}`, ilike(courseRequests.name, pattern), ilike(courseRequests.courseName, pattern), ilike(courseRequests.phone, pattern), ilike(courseRequests.university, pattern), ilike(courseRequests.specialty, pattern), sql`${courseRequests.userId} IN (SELECT id FROM users WHERE email ILIKE ${pattern})`) : undefined);
  const ticketFilter = and(scopedStudentSql(scopeId, supportTickets.userEmail), view === "support" && needle ? or(ilike(supportTickets.ticketNumber, pattern), ilike(supportTickets.userEmail, pattern), ilike(supportTickets.title, pattern), ilike(supportTickets.message, pattern)) : undefined);
  const accessFilter = and(and(scopedCourseSql(scopeId, courseAccess.courseSlug), scopedStudentSql(scopeId, courseAccess.userEmail)), view === "subscriptions" && needle ? or(ilike(courseAccess.userEmail, pattern), ilike(courseAccess.courseSlug, pattern), ilike(courseAccess.orderNumber, pattern), sql`${courseAccess.userEmail} IN (SELECT email FROM users WHERE full_name ILIKE ${pattern} OR phone ILIKE ${pattern})`) : undefined);
  const reviewFilter = and(scopedCourseSql(scopeId, courseReviews.courseSlug), view === "reviews" && needle ? or(ilike(courseReviews.userEmail, pattern), ilike(courseReviews.courseSlug, pattern), ilike(courseReviews.body, pattern), ilike(courseReviews.status, pattern)) : undefined);
  const auditFilter = view === "audit" && needle ? or(ilike(auditLogs.actorEmail, pattern), ilike(auditLogs.action, pattern), ilike(auditLogs.entityType, pattern), ilike(auditLogs.entityId, pattern)) : undefined;
  const take = (target: string, fallback: number) => view === target || target === "students" && view === "staff" ? page.pageSize : fallback;
  const skip = (target: string) => view === target || target === "students" && view === "staff" ? page.offset : 0;
  const limits = compactMobile
    ? { videos: 120, users: 160, sessions: 600, orders: 180, requests: 160, files: 600, tickets: 120, replies: 700, reviews: 180, access: 400, assignments: 250, notifications: 120, coupons: 120, audits: 60 }
    : { videos: 500, users: 500, sessions: 3000, orders: 300, requests: 300, files: 3000, tickets: 300, replies: 2000, reviews: 300, access: 500, assignments: 500, notifications: 200, coupons: 200, audits: 120 };
  const [institutionRows, courses, specialtyRows, links, unitRows, lessonRows, videoRows, studentRows, sessionRows, orderRows, requestRows, ticketRows, reviewRows, accessRows, supervisorRows, notificationRows, couponRows, settingRows, audits] = await Promise.all([
    needs("institutions") && can("catalog.view") ? getInstitutionsCatalog(true) : [],
    needs("courses") && can("catalog.view") ? getCoursesCatalog(true) : [],
    needs("specialties") && can("catalog.view") ? db.select().from(catalogSpecialties).orderBy(catalogSpecialties.name) : [],
    needs("links") && can("catalog.view") ? db.select().from(institutionSpecialties).where(scopedSubjectSql(scopeId, institutionSpecialties.institutionSlug, sql`(SELECT name FROM catalog_specialties WHERE slug = ${institutionSpecialties.specialtySlug})`, institutionSpecialties.specialtySlug)) : [],
    needs("units") && can("catalog.view") ? db.select().from(courseUnitsDb).where(scopedCourseSql(scopeId, courseUnitsDb.courseSlug)).orderBy(courseUnitsDb.position) : [],
    needs("lessons") && can("catalog.view") ? db.select().from(lessonsDb).where(scopedCourseSql(scopeId, lessonsDb.courseSlug)).orderBy(lessonsDb.position) : [],
    needs("videos") && can("catalog.view") ? db.select().from(videoAssets).where(scopedCourseSql(scopeId, videoAssets.courseSlug)).orderBy(desc(videoAssets.createdAt)).limit(limits.videos) : [],
    needs("users") && (can("students.view") || view === "staff" && can("staff.manage")) ? db.select({ id: users.id, mfaEnabled: sql<boolean>`EXISTS (SELECT 1 FROM admin_mfa_factors f WHERE f.user_id = ${users.id} AND f.verified_at IS NOT NULL AND f.disabled_at IS NULL)`, email: users.email, phone: users.phone, fullName: users.fullName, role: users.role, universitySlug: users.universitySlug, specialty: users.specialty, academicLevel: users.academicLevel, profileCompletedAt: users.profileCompletedAt, onboardingCompletedAt: users.onboardingCompletedAt, lastLoginAt: users.lastLoginAt, status: users.status, createdAt: users.createdAt }).from(users).where(userFilter).orderBy(desc(users.createdAt), desc(users.id)).limit(take("students", limits.users)).offset(skip("students")) : [],
    needs("sessions") && can("students.devices.view") ? db.select({ id: authSessions.id, userId: authSessions.userId, deviceId: authSessions.deviceId, deviceLabel: authSessions.deviceLabel, platform: authSessions.platform, ipAddress: authSessions.ipAddress, userAgent: authSessions.userAgent, lastSeenAt: authSessions.lastSeenAt, expiresAt: authSessions.expiresAt, revokedAt: authSessions.revokedAt, createdAt: authSessions.createdAt }).from(authSessions).where(and(scopedStudentSql(scopeId, authSessions.userId, "id"), owner ? undefined : sql`${authSessions.userId} IN (SELECT id FROM users WHERE role = 'student')`)).orderBy(desc(authSessions.lastSeenAt)).limit(limits.sessions) : [],
    needs("orders") && can("finance.view") ? db.select().from(orders).where(orderFilter).orderBy(desc(orders.createdAt), desc(orders.id)).limit(scoped && view==="overview" ? 5 : take("orders", limits.orders)).offset(skip("orders")) : [],
    needs("requests") && can("requests.manage") ? db.select().from(courseRequests).where(requestFilter).orderBy(desc(courseRequests.createdAt), desc(courseRequests.id)).limit(take("requests", limits.requests)).offset(skip("requests")) : [],
    needs("tickets") && can("support.manage") ? db.select().from(supportTickets).where(ticketFilter).orderBy(desc(supportTickets.createdAt), desc(supportTickets.id)).limit(take("support", limits.tickets)).offset(skip("support")) : [],
    needs("reviews") && can("catalog.manage") ? db.select().from(courseReviews).where(reviewFilter).orderBy(desc(courseReviews.createdAt), desc(courseReviews.id)).limit(take("reviews", limits.reviews)).offset(skip("reviews")) : [],
    needs("access") && can("subscriptions.manage") ? db.select().from(courseAccess).where(accessFilter).orderBy(desc(courseAccess.startsAt), desc(courseAccess.id)).limit(take("subscriptions", limits.access)).offset(skip("subscriptions")) : [],
    needs("assignments") && can("staff.manage") ? db.select().from(supervisorAssignments).orderBy(desc(supervisorAssignments.createdAt)).limit(limits.assignments) : [],
    needs("notifications") && can("notifications.manage") && can("data.all") ? db.select().from(notificationsDb).orderBy(desc(notificationsDb.createdAt)).limit(limits.notifications) : [],
    needs("coupons") && can("finance.manage") ? db.select().from(couponsDb).where(scopedCourseSql(scopeId, couponsDb.courseSlug)).orderBy(desc(couponsDb.createdAt)).limit(limits.coupons) : [],
    needs("settings") && can("settings.manage") ? db.select().from(platformSettings) : [],
    needs("audit") && can("audit.view") ? db.select().from(auditLogs).where(auditFilter).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(take("audit", limits.audits)).offset(skip("audit")) : [],
  ]);

  const visibleCourses = scopedSupervisor ? courses.filter((course) => supervisorScopesAllow(supervisorScopes, course)) : courses;
  const visibleInstitutionRows = scopedSupervisor ? institutionRows.filter(row => supervisorScopes.some(scope => scope.institutionSlug === null || scope.institutionSlug === row.slug)) : institutionRows;
  const visibleSpecialtyRows = scopedSupervisor ? specialtyRows.filter(row => links.some(link => link.specialtySlug === row.slug)) : specialtyRows;
  const visibleStudentRows = studentRows;
  const visibleUnitRows = unitRows, visibleLessonRows = lessonRows, visibleVideoRows = videoRows;
  const visibleOrderRows = orderRows, visibleRequestRows = requestRows, visibleReviewRows = reviewRows, visibleTicketRows = ticketRows;
  const [requestFileRows, replyRows, supportFileRows] = await Promise.all([
    visibleRequestRows.length ? db.select().from(courseRequestFiles).where(inArray(courseRequestFiles.requestId, visibleRequestRows.map(row=>row.id))).orderBy(asc(courseRequestFiles.id)).limit(limits.files) : [],
    visibleTicketRows.length ? db.select().from(supportReplies).where(inArray(supportReplies.ticketId,visibleTicketRows.map(row=>row.id))).orderBy(asc(supportReplies.id)).limit(limits.replies) : [],
    visibleTicketRows.length ? db.select().from(supportReplyFiles).where(inArray(supportReplyFiles.ticketId,visibleTicketRows.map(row=>row.id))).limit(limits.files) : [],
  ]);
  const paginatedTotal = view === "students" || view === "staff" ? await db.select({ total: count() }).from(users).where(userFilter)
    : view === "orders" ? await db.select({ total: count() }).from(orders).where(orderFilter)
    : view === "requests" ? await db.select({ total: count() }).from(courseRequests).where(requestFilter)
    : view === "support" ? await db.select({ total: count() }).from(supportTickets).where(ticketFilter)
    : view === "subscriptions" ? await db.select({ total: count() }).from(courseAccess).where(accessFilter)
    : view === "reviews" ? await db.select({ total: count() }).from(courseReviews).where(reviewFilter)
    : view === "audit" ? await db.select({ total: count() }).from(auditLogs).where(auditFilter) : null;
  const relatedUserIds = visibleRequestRows.flatMap((row) => row.userId ? [row.userId] : []);
  const relatedUserEmails = visibleTicketRows.flatMap((row) => row.userEmail ? [row.userEmail] : []);
  const relatedStudents = can("students.view") && (relatedUserIds.length || relatedUserEmails.length) ? await db.select({ id: users.id, email: users.email, fullName: users.fullName, phone: users.phone, universitySlug: users.universitySlug, specialty: users.specialty, academicLevel: users.academicLevel, status: users.status }).from(users).where(and(scopedStudentSql(scopeId, users.id, "id"), or(relatedUserIds.length ? inArray(users.id, relatedUserIds) : undefined, relatedUserEmails.length ? inArray(users.email, relatedUserEmails) : undefined))) : [];
  const effectiveAccess = await effectiveAccessRows(accessRows);
  const registeredDeviceRows = needs("devices") && can("students.devices.view") && studentRows.length ? await db.select({ id: authDevices.id, userId: authDevices.userId, deviceLabel: authDevices.deviceLabel, platform: authDevices.platform, firstSeenAt: authDevices.firstSeenAt, lastSeenAt: authDevices.lastSeenAt }).from(authDevices).where(and(inArray(authDevices.userId, studentRows.map(student => student.id)), isNull(authDevices.revokedAt))) : [];
  const settings = { ...PUBLIC_SETTING_DEFAULTS, ...ADMIN_SETTING_DEFAULTS } as Record<string, string>;
  for (const row of settingRows) if (row.key in SETTING_META) settings[row.key] = row.value;
  const [managedInstitutionRows, managedCourseRows, totals, waitlistRows, activeAiKeys] = await Promise.all([
    needs("institutions") && can("catalog.view") ? db.select().from(catalogInstitutions).where(scopedInstitutionSql(scopeId, catalogInstitutions.slug)) : [],
    needs("courses") && can("catalog.view") ? db.select().from(catalogCourses).where(scopedCourseSql(scopeId, catalogCourses.slug)) : [],
    needs("metrics") ? db.execute(sql`SELECT
      (SELECT count(*)::int FROM users WHERE role = 'student' AND ${can("students.view")} AND ${scopedStudentSql(scopeId, sql`users.id`, "id")}) AS students,
      (SELECT count(*)::int FROM users WHERE role = 'student' AND status = 'active' AND ${can("students.view")} AND ${scopedStudentSql(scopeId, sql`users.id`, "id")}) AS active_students,
      (SELECT count(*)::int FROM orders WHERE ${can("finance.view")} AND ${scopedOrderSql(scopeId, sql`orders.order_number`)}) AS orders,
      (SELECT count(*)::int FROM orders WHERE status = 'paid' AND ${can("finance.view")} AND ${scopedOrderSql(scopeId, sql`orders.order_number`)}) AS paid_orders,
      (SELECT coalesce(sum(total), 0)::float FROM orders WHERE status = 'paid' AND ${can("finance.view")} AND ${scopedOrderSql(scopeId, sql`orders.order_number`)}) AS revenue,
      (SELECT count(*)::int FROM orders WHERE status IN ('verification_pending', 'payment_review') AND ${can("finance.view")} AND ${scopedOrderSql(scopeId, sql`orders.order_number`)}) AS review_orders,
      (SELECT count(*)::int FROM course_requests WHERE status NOT IN ('available', 'declined') AND ${can("requests.manage")} AND ${scopedRequestSql(scopeId, sql`course_requests.id`)}) AS open_requests,
      (SELECT count(*)::int FROM support_tickets WHERE status NOT IN ('resolved', 'closed') AND ${can("support.manage")} AND ${scopedStudentSql(scopeId, sql`support_tickets.user_email`)}) AS open_tickets,
      (SELECT count(*)::int FROM course_reviews WHERE status = 'pending' AND ${can("catalog.manage")} AND ${scopedCourseSql(scopeId, sql`course_reviews.course_slug`)}) AS pending_reviews`) : {rows:[]},
    needs("courses") && can("students.view") ? db.select({ courseSlug: courseWaitlist.courseSlug, total: count() }).from(courseWaitlist).where(and(eq(courseWaitlist.status, "active"), scopedCourseSql(scopeId, courseWaitlist.courseSlug), scopedStudentSql(scopeId, courseWaitlist.userEmail))).groupBy(courseWaitlist.courseSlug) : [],
    needs("services") && can("operations.manage") && can("data.all") ? db.select({ total: count() }).from(aiApiKeys).where(eq(aiApiKeys.status, "active")) : [],
  ]);
  const managedInstitutionMap = new Map(managedInstitutionRows.map((row) => [row.slug, row]));
  const managedCourseMap = new Map(managedCourseRows.map((row) => [row.slug, row]));
  const totalRow = (totals.rows[0] || {}) as Record<string, unknown>;
  const waitlistByCourse = new Map(waitlistRows.map((row) => [row.courseSlug, Number(row.total)]));
  const environmentAiKeys = needs("services") && can("operations.manage") && can("data.all") ? geminiEnvironmentKeys().length : 0;
  return Response.json({
    ok: true,
    permissions: [...grants], isPlatformOwner: owner,
    generatedAt: new Date().toISOString(),
    pagination: paginatedTotal ? { view, page: page.page, pageSize: page.pageSize, total: Number(paginatedTotal[0]?.total || 0) } : null,
    metrics: {
      students: can("students.view") ? Number(totalRow.students || 0) : 0,
      activeStudents: can("students.view") ? Number(totalRow.active_students || 0) : 0,
      institutions: can("catalog.view") ? visibleInstitutionRows.length : 0,
      publishedCourses: can("catalog.view") ? visibleCourses.filter((row) => row.lessons > 0).length : 0,
      orders: can("finance.view") ? Number(totalRow.orders || 0) : 0,
      paidOrders: can("finance.view") ? Number(totalRow.paid_orders || 0) : 0,
      revenue: can("finance.view") ? Number(totalRow.revenue || 0) : 0,
      reviewOrders: can("finance.view") ? Number(totalRow.review_orders || 0) : 0,
      openRequests: can("requests.manage") ? Number(totalRow.open_requests || 0) : 0,
      openTickets: can("support.manage") ? Number(totalRow.open_tickets || 0) : 0,
      pendingReviews: can("catalog.manage") ? Number(totalRow.pending_reviews || 0) : 0,
    },
    institutions: visibleInstitutionRows.map((row) => ({ ...row, status: managedInstitutionMap.get(row.slug)?.status || "published" })),
    courses: visibleCourses.map((row) => ({ ...row, status: managedCourseMap.get(row.slug)?.status || "published", specialtySlug: managedCourseMap.get(row.slug)?.specialtySlug || "", audienceScope: managedCourseMap.get(row.slug)?.audienceScope === "institution" ? "institution" : "specialty", coverTheme: managedCourseMap.get(row.slug)?.coverTheme || "blue-violet", waitlistCount: waitlistByCourse.get(row.slug) || 0 })),
    specialties: visibleSpecialtyRows,
    specialtyLinks: links,
    units: visibleUnitRows,
    lessons: visibleLessonRows,
    videos: visibleVideoRows,
    users: visibleStudentRows.map((student) => {
      const activeSessions = sessionRows.filter((session) => session.userId === student.id && !session.revokedAt && new Date(session.expiresAt).getTime() > Date.now());
      const registeredDevices = registeredDeviceRows.filter((device) => device.userId === student.id);
      return {
        ...student,
        deviceCount: registeredDevices.length,
        registeredDevices,
        sessions: activeSessions.map((session) => ({ id: session.id, deviceId: session.deviceId, deviceLabel: session.deviceLabel || (session.platform === "mobile" ? "تطبيق مراس" : "متصفح ويب"), platform: session.platform, ipAddress: session.ipAddress, lastSeenAt: session.lastSeenAt, expiresAt: session.expiresAt, createdAt: session.createdAt })),
      };
    }),
    deviceLimit: 2,
    orders: visibleOrderRows,
    requests: visibleRequestRows.map((request) => ({ ...request, student: request.userId ? (() => { const student = relatedStudents.find((user) => user.id === request.userId); return student ? { fullName: student.fullName, email: student.email, phone: student.phone, universitySlug: student.universitySlug, specialty: student.specialty, academicLevel: student.academicLevel, status: student.status } : null; })() : null, files: requestFileRows.filter((file) => file.requestId === request.id).map((file) => ({ id: file.id, requestId: file.requestId, originalName: file.originalName, contentType: file.contentType, sizeBytes: file.sizeBytes, createdAt: file.createdAt })) })),
    tickets: visibleTicketRows.map((ticket) => {
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
          const student = relatedStudents.find((user) => user.email.toLowerCase() === ticket.userEmail!.toLowerCase());
          return student ? { fullName: student.fullName, email: student.email, phone: student.phone, universitySlug: student.universitySlug, specialty: student.specialty, academicLevel: student.academicLevel, status: student.status } : null;
        })() : null,
        replies,
      };
    }),
    reviews: visibleReviewRows,
    access: effectiveAccess,
    supervisorAssignments: supervisorRows,
    notifications: notificationRows,
    coupons: couponRows,
    settings: needs("settings") && can("settings.manage") ? settings : {},
    audit: audits,
    services: needs("services") && can("operations.manage") && can("data.all") ? {
      assistant: true,
      merasAi: environmentAiKeys > 0 || Number(activeAiKeys[0]?.total || 0) > 0,
      payments: Boolean(process.env.TAP_SECRET_KEY?.trim()),
      email: Boolean(process.env.RESEND_API_KEY?.trim()),
      videoSigning: Boolean(process.env.VIDEO_SIGNING_SECRET?.trim() && process.env.VIDEO_SIGNING_SECRET!.trim().length >= 24),
      mfaConfigured: adminMfaConfigured(),
    } : {},
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const machineAuthorized = isAdminRequest(request);
  if (!machineAuthorized && !sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  let payload: Record<string, unknown>;
  try { payload = await readBoundedJsonObject(request, 128 * 1024); } catch { return jsonError("بيانات غير صالحة"); }
  const action = cleanText(payload.action, 50);
  const delegatedPermission = action === "deleteEntity"
    ? ADMIN_PERMISSIONS.RECORDS_DELETE
    : action === "dispatchNotifications"
      ? ADMIN_PERMISSIONS.NOTIFICATIONS_DISPATCH
      : action === "createNotification"
        ? ADMIN_PERMISSIONS.NOTIFICATIONS_MANAGE
      : undefined;
  const authorization = await authorize(request, delegatedPermission);
  if (!authorization) return jsonError("غير مصرح", 403);
  const required = consoleActionPermissions(action, payload.entityType);
  if (!required) return jsonError("عملية إدارية غير معروفة", 400);
  const grants = authorization.user ? await permissionsForUser(authorization.user) : new Set(Object.values(ADMIN_PERMISSIONS));
  if (!permissionsCover(grants, required)) return jsonError("لا تملك صلاحية تنفيذ هذه العملية", 403);
  if (action === "grantAccess" && payload.grantType === "manual_payment" && !permissionsCover(grants, ["finance.manage"])) return jsonError("تسجيل دفعة يدوية يتطلب صلاحية إدارة المالية أيضًا", 403);
  const identity = authorization.user ? `user:${authorization.user.id}` : `machine:${clientIp(request)}`;
  if (!await checkRateLimit("admin-console-write", identity, 60, 60)) return jsonError("طلبات إدارية كثيرة. حاول بعد دقيقة.", 429);
  if (!await supervisorConsoleMutationAllowed(authorization.user, payload)) return jsonError("السجل أو الوجهة خارج نطاق إشرافك المحدد", 403);
  const db = getDb();
  const now = new Date().toISOString();
  if (["updateUser", "updateStudentProfile"].includes(action) || action === "deleteEntity" && payload.entityType === "user") {
    const id = finiteNumber(action === "deleteEntity" ? payload.entityId : payload.id);
    if (!Number.isSafeInteger(id) || id < 1) return jsonError("معرف مستخدم غير صالح");
    const [target] = await db.select({ role: users.role, isPlatformOwner: users.isPlatformOwner }).from(users).where(eq(users.id, id));
    if (!target) return jsonError("الحساب غير موجود", 404);
    if (target.isPlatformOwner) return jsonError("حساب المدير الأعلى محمي؛ تستخدم إعدادات حسابه الشخصية", 403);
    if ((target.role !== "student" || action === "updateUser" && payload.role !== "student") && !authorization.user?.isPlatformOwner) return jsonError("إدارة المشرفين متاحة للمدير الأعلى فقط", 403);
    if (action === "updateUser" && payload.role === "admin") return jsonError("أضف مشرفًا بصلاحيات محددة بدل إنشاء مدير أعلى آخر", 400);
  }
  if (action === "revokeUserSession") {
    const [target] = await db.select({ userId: authSessions.userId }).from(authSessions).where(eq(authSessions.id, finiteNumber(payload.sessionId ?? payload.id) || -1));
    const [subject] = target ? await db.select({ role: users.role, isPlatformOwner: users.isPlatformOwner }).from(users).where(eq(users.id, target.userId)) : [];
    if (subject && (subject.isPlatformOwner || subject.role !== "student" && !authorization.user?.isPlatformOwner)) return jsonError("لا تملك إدارة جلسات هذا الحساب", 403);
  }
  if (["updateUser", "updateStudentProfile", "grantAccess", "updateAccess", "revokeUserSession", "saveSupervisorAssignment"].includes(action)) {
    if (!authorization.user) return jsonError("هذا الإجراء يتطلب جلسة مدير موثقة", 403);
    try { await requireAdminStepUp(request, authorization.user); }
    catch (error) {
      if (error instanceof AdminMfaError) return jsonError(error.message, error.status, error.code);
      throw error;
    }
  }

  if (action === "deleteEntity") {
    if (!authorization.user || !await hasPermission(authorization.user, ADMIN_PERMISSIONS.RECORDS_DELETE)) return jsonError("غير مصرح بتنفيذ الحذف", 403);
    try {
      await requireAdminStepUp(request, authorization.user);
    } catch (error) {
      if (error instanceof AdminMfaError) {
        return Response.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
      }
      throw error;
    }
    const entityType = cleanText(payload.entityType, 50) as AdminDeletionType;
    const entityId = cleanText(payload.entityId, 180);
    const confirmation = typeof payload.confirmation === "string" ? payload.confirmation.trim() : "";
    if (!entityType || !entityId) return jsonError("حدد السجل المراد حذفه");
    try {
      const result = await deleteAdminEntity(db, { entityType, entityId, actor: authorization.actor, ipAddress: clientIp(request), confirmation });
      if (["institution", "specialty", "course", "unit", "lesson", "video"].includes(entityType)) {
        invalidateCatalogCache();
        await notifyCatalogDiscovery(["/", "/universities", "/courses", "/bundles", ...(entityType === "course" ? [`/courses/${seoSegment(entityId)}`] : entityType === "institution" ? [`/universities/${seoSegment(entityId)}`] : [])]);
      }
      return Response.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
    } catch (error) {
      if (error instanceof DeletionPolicyError) return jsonError(error.message, error.status);
      console.error("[admin-delete] transaction failed", error instanceof Error ? error.message : "unknown error");
      return jsonError("تعذر تنفيذ الحذف بأمان. لم يتم اعتماد التغييرات.", 500);
    }
  }

  if (action === "dispatchNotifications") {
    if (!authorization.user || !await hasPermission(authorization.user, ADMIN_PERMISSIONS.NOTIFICATIONS_DISPATCH)) return jsonError("غير مصرح بإرسال الإشعارات", 403);
    try {
      await requireAdminStepUp(request, authorization.user);
    } catch (error) {
      if (error instanceof AdminMfaError) {
        return Response.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
      }
      throw error;
    }
    const result = await dispatchDuePushNotifications(50);
    await audit(request, authorization.actor, "dispatch", "notification_campaigns", "due", null, result);
    return Response.json({ ok: true, push: { scheduled: false, ...result } });
  }

  if (action === "syncCatalogTemplates") {
    const rawPrice = finiteNumber(payload.templatePrice);
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
    const slug = suppliedSlug || automaticIdentifier(name, "university");
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
    const creating = payload.intent === "create" || !suppliedSlug;
    if (creating && before) return jsonError("المعرّف مستخدم مسبقًا. اختر معرّفًا آخر أو اتركه فارغًا للتوليد التلقائي.", 409);
    const values = { slug, name, nameEn, region, type, domain: domain || null, logoUrl: logoUrl || before?.logoUrl || null, directorySourceUrl: directorySourceUrl || before?.directorySourceUrl || null, verificationStatus: verificationStatus === "pending-review" && before?.verificationStatus === "official-directory" ? "official-directory" : verificationStatus, aliasesJson: aliasesJson ?? before?.aliasesJson ?? "[]", status, featured: payload.featured === true, sortOrder: Number.isFinite(finiteNumber(payload.sortOrder)) ? Math.floor(finiteNumber(payload.sortOrder)) : 0, updatedAt: now };
    if (creating) {
      const created = await db.insert(catalogInstitutions).values({ ...values, createdAt: now }).onConflictDoNothing().returning({ key: catalogInstitutions.slug });
      if (!created.length) return jsonError("المعرّف مستخدم مسبقًا. اختر معرّفًا آخر.", 409);
    } else await db.insert(catalogInstitutions).values({ ...values, createdAt: before?.createdAt || now }).onConflictDoUpdate({ target: catalogInstitutions.slug, set: values });
    invalidateCatalogCache();
    await audit(request, authorization.actor, before ? "update" : "create", "institution", slug, before, values);
    await notifyCatalogDiscovery(["/", "/universities", `/universities/${seoSegment(slug)}`, "/courses"]);
    return Response.json({ ok: true, institution: values });
  }

  if (action === "saveSpecialty") {
    const name = cleanText(payload.name, 140);
    const suppliedSlug = cleanText(payload.slug, 80).toLowerCase();
    const slug = suppliedSlug || automaticIdentifier(name, "specialty");
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
    const creating = payload.intent === "create" || !suppliedSlug;
    if (creating && before) return jsonError("المعرّف مستخدم مسبقًا. اختر معرّفًا آخر أو اتركه فارغًا للتوليد التلقائي.", 409);
    const values = { slug, name, description, sourceUrl: sourceUrl || before?.sourceUrl || null, verifiedAt: verifiedAt || before?.verifiedAt || null, verificationStatus, faculty, degree, status, updatedAt: now };
    if (creating) {
      const created = await db.insert(catalogSpecialties).values({ ...values, createdAt: now }).onConflictDoNothing().returning({ key: catalogSpecialties.slug });
      if (!created.length) return jsonError("المعرّف مستخدم مسبقًا. اختر معرّفًا آخر.", 409);
    } else await db.insert(catalogSpecialties).values({ ...values, createdAt: before?.createdAt || now }).onConflictDoUpdate({ target: catalogSpecialties.slug, set: values });
    if (institutionSlug) await db.insert(institutionSpecialties).values({ institutionSlug, specialtySlug: slug, status: "published", sortOrder: 0 }).onConflictDoUpdate({ target: [institutionSpecialties.institutionSlug, institutionSpecialties.specialtySlug], set: { status: "published" } });
    invalidateCatalogCache();
    await audit(request, authorization.actor, before ? "update" : "create", "specialty", slug, before, { ...values, institutionSlug });
    await notifyCatalogDiscovery(["/universities", "/courses", ...(institutionSlug ? [`/universities/${seoSegment(institutionSlug)}`, `/universities/${seoSegment(institutionSlug)}/specialties/${seoSegment(slug)}`] : [])]);
    return Response.json({ ok: true, specialty: values });
  }

  if (action === "saveCourse") {
    const institutionSlug = cleanText(payload.institutionSlug, 80).toLowerCase();
    const specialtySlug = cleanText(payload.specialtySlug, 80).toLowerCase();
    const title = cleanText(payload.title, 160);
    const suppliedSlug = cleanText(payload.slug, 80).toLowerCase();
    const status = cleanText(payload.status, 20) || "draft";
    const audienceScope = cleanText(payload.audienceScope, 20) === "institution" ? "institution" : "specialty";
    const price = finiteNumber(payload.price);
    const oldPriceValue = finiteNumber(payload.oldPrice);
    const coverImageUrl = cleanText(payload.coverImageUrl, 1000);
    const [specialty] = await db.select().from(catalogSpecialties).where(eq(catalogSpecialties.slug, specialtySlug)).limit(1);
    if (!specialty) return jsonError("أنشئ التخصص أو اربطه أولًا");
    const slug = suppliedSlug || automaticIdentifier(title, "course");
    if (!validSlug(slug) || title.length < 3 || !await getInstitutionCatalog(institutionSlug, true) || !validSlug(specialtySlug) || !Number.isFinite(price) || price < 0 || price > 50_000 || !["draft", "published", "hidden"].includes(status)) return jsonError("تحقق من بيانات المادة وربطها");
    if (coverImageUrl && !safeUrl(coverImageUrl) && !coverImageUrl.startsWith("r2:")) return jsonError("رابط غلاف المادة يجب أن يبدأ بـ https");
    const [specialtyLink] = await db.select().from(institutionSpecialties).where(and(eq(institutionSpecialties.institutionSlug, institutionSlug), eq(institutionSpecialties.specialtySlug, specialtySlug), eq(institutionSpecialties.status, "published"))).limit(1);
    if (!specialtyLink) return jsonError("التخصص غير مربوط بهذه الجهة");
    const [before] = await db.select().from(catalogCourses).where(eq(catalogCourses.slug, slug)).limit(1);
    const creating = payload.intent === "create" || !suppliedSlug;
    if (creating && before) return jsonError("المعرّف مستخدم مسبقًا. اختر معرّفًا آخر أو اتركه فارغًا للتوليد التلقائي.", 409);
    const values = {
      slug, institutionSlug, specialtySlug, title,
      titleEn: cleanText(payload.titleEn, 160), code: cleanText(payload.code, 50) || null,
      description: cleanText(payload.description, 3000), coverImageUrl: coverImageUrl || before?.coverImageUrl || null, price,
      oldPrice: Number.isFinite(oldPriceValue) && oldPriceValue > price ? oldPriceValue : null,
      accessLabel: cleanText(payload.accessLabel, 80) || "90 يومًا",
      accessDurationDays: normalizeAccessDurationDays(payload.accessDurationDays, cleanText(payload.accessLabel, 80)),
      sourceUrl: cleanText(payload.sourceUrl, 500) || before?.sourceUrl || null,
      verifiedAt: cleanText(payload.verifiedAt, 30) || before?.verifiedAt || null,
      status, audienceScope, featured: payload.featured === true, coverTheme: cleanText(payload.coverTheme, 40) || "blue-violet", updatedAt: now,
    };
    if (creating) {
      const created = await db.insert(catalogCourses).values({ ...values, createdAt: now }).onConflictDoNothing().returning({ key: catalogCourses.slug });
      if (!created.length) return jsonError("المعرّف مستخدم مسبقًا. اختر معرّفًا آخر.", 409);
    } else await db.insert(catalogCourses).values({ ...values, createdAt: before?.createdAt || now }).onConflictDoUpdate({ target: catalogCourses.slug, set: values });
    invalidateCatalogCache();
    await audit(request, authorization.actor, before ? "update" : "create", "course", slug, before, values);
    await notifyCatalogDiscovery(["/", "/courses", "/bundles", `/courses/${seoSegment(slug)}`, `/universities/${seoSegment(institutionSlug)}`, `/universities/${seoSegment(institutionSlug)}/specialties/${seoSegment(specialtySlug)}`]);
    return Response.json({ ok: true, course: values });
  }

  if (action === "saveUnit") {
    const id = Math.floor(finiteNumber(payload.id));
    const courseSlug = cleanText(payload.courseSlug, 80);
    const title = cleanText(payload.title, 160);
    const description = cleanText(payload.description, 2000);
    const status = cleanText(payload.status, 20) || "draft";
    if (!validSlug(courseSlug) || title.length < 2 || !["draft", "published", "hidden"].includes(status)) return jsonError("تحقق من الوحدة");
    const [course] = await db.select().from(catalogCourses).where(eq(catalogCourses.slug, courseSlug)).limit(1);
    if (!course) return jsonError("يجب إنشاء المادة في الإدارة أولًا");
    const position = Math.max(0, Math.floor(finiteNumber(payload.position) || 0));
    if (id) {
      const [before] = await db.select().from(courseUnitsDb).where(eq(courseUnitsDb.id, id)).limit(1);
      if (!before || before.courseSlug !== courseSlug) return jsonError("الوحدة غير موجودة", 404);
      await db.update(courseUnitsDb).set({ title, description: description || before.description, position, status, updatedAt: now }).where(eq(courseUnitsDb.id, id));
      invalidateCatalogCache();
      await audit(request, authorization.actor, "update", "unit", String(id), before, { title, description: description || before.description, position, status });
      await notifyCatalogDiscovery(["/courses", "/bundles", `/courses/${seoSegment(courseSlug)}`]);
      return Response.json({ ok: true, id });
    }
    const [created] = await db.insert(courseUnitsDb).values({ courseSlug, title, description, position, status, createdAt: now, updatedAt: now }).returning({ id: courseUnitsDb.id });
    invalidateCatalogCache();
    await audit(request, authorization.actor, "create", "unit", String(created.id), null, { courseSlug, title, description, position, status });
    await notifyCatalogDiscovery(["/courses", "/bundles", `/courses/${seoSegment(courseSlug)}`]);
    return Response.json({ ok: true, id: created.id }, { status: 201 });
  }

  if (action === "saveLesson") {
    const suppliedId = cleanText(payload.id, 100);
    const courseSlug = cleanText(payload.courseSlug, 80);
    const unitId = Math.floor(finiteNumber(payload.unitId));
    const title = cleanText(payload.title, 160);
    const description = cleanText(payload.description, 2000);
    const status = cleanText(payload.status, 20) || "draft";
    const position = Math.max(0, Math.floor(finiteNumber(payload.position) || 0));
    const id = suppliedId || automaticIdentifier(title, "lesson", 100);
    if (!validSlug(courseSlug) || !/^[a-z0-9][a-z0-9._-]{1,99}$/i.test(id) || !unitId || title.length < 2 || !["draft", "published", "hidden"].includes(status)) return jsonError("تحقق من بيانات الدرس");
    const [unit] = await db.select().from(courseUnitsDb).where(and(eq(courseUnitsDb.id, unitId), eq(courseUnitsDb.courseSlug, courseSlug))).limit(1);
    if (!unit) return jsonError("الوحدة لا تتبع هذه المادة");
    const [before] = await db.select().from(lessonsDb).where(eq(lessonsDb.id, id)).limit(1);
    const creating = payload.intent === "create" || !suppliedId;
    if (creating && before) return jsonError("المعرّف مستخدم مسبقًا. اختر معرّفًا آخر أو اتركه فارغًا للتوليد التلقائي.", 409);
    if (before && before.courseSlug !== courseSlug) return jsonError("معرّف الدرس يتبع مادة أخرى؛ اختر معرّفًا مختلفًا.", 409);
    const values = { id, courseSlug, unitId, title, description: description || before?.description || "", position, durationSeconds: Math.max(0, Math.floor(finiteNumber(payload.durationSeconds) || 0)), freePreview: payload.freePreview === true, status, videoAssetId: before?.videoAssetId || null, updatedAt: now };
    if (creating) {
      const created = await db.insert(lessonsDb).values({ ...values, createdAt: now }).onConflictDoNothing().returning({ key: lessonsDb.id });
      if (!created.length) return jsonError("المعرّف مستخدم مسبقًا. اختر معرّفًا آخر.", 409);
    } else await db.insert(lessonsDb).values({ ...values, createdAt: before?.createdAt || now }).onConflictDoUpdate({ target: lessonsDb.id, set: values });
    invalidateCatalogCache();
    await audit(request, authorization.actor, before ? "update" : "create", "lesson", id, before, values);
    await notifyCatalogDiscovery(["/courses", "/bundles", `/courses/${seoSegment(courseSlug)}`]);
    return Response.json({ ok: true, lesson: values });
  }

  if (action === "updateUser") {
    const id = finiteNumber(payload.id);
    const status = cleanText(payload.status, 20);
    const role = cleanText(payload.role, 20);
    if (!Number.isSafeInteger(id) || id < 1 || !["active", "suspended"].includes(status) || !["student", "supervisor", "admin"].includes(role)) return jsonError("بيانات المستخدم غير صالحة");
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'active-admin-membership'}))`);
      const [before] = await tx.select().from(users).where(eq(users.id, id)).limit(1);
      if (!before) return { error: "المستخدم غير موجود", status: 404 };
      if (payload.expectedUpdatedAt && payload.expectedUpdatedAt !== before.updatedAt) return { error: "تغير الحساب أثناء التحرير. حدث الملف ثم حاول مجددًا", status: 409 };
      const activeAdmins = await tx.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active")));
      const invalid = adminUserTransitionError(before, { role, status }, authorization.user?.id || null, activeAdmins.length);
      if (invalid) return { error: invalid, status: 409 };
      await tx.update(users).set({ status, role, updatedAt: now }).where(eq(users.id, id));
      if (status !== "active" || role !== before.role) {
        await tx.update(authSessions).set({ revokedAt: now }).where(and(eq(authSessions.userId, id), isNull(authSessions.revokedAt)));
        await tx.update(pushDevices).set({ status: "revoked", lastSeenAt: now }).where(eq(pushDevices.userId, id));
      }
      await tx.insert(auditLogs).values({ actorEmail: authorization.actor, action: "update", entityType: "user", entityId: String(id), beforeJson: asJson({ status: before.status, role: before.role }), afterJson: asJson({ status, role, reason: cleanText(payload.reason, 500) }), ipAddress: clientIp(request), createdAt: now });
      return { updatedAt: now };
    });
    if ("error" in result) return jsonError(result.error!, result.status);
    return Response.json({ ok: true, ...result });
  }

  if (action === "updateStudentProfile") {
    const id = finiteNumber(payload.id);
    const fullName = cleanText(payload.fullName, 120);
    const universitySlug = cleanText(payload.universitySlug, 120);
    const specialty = cleanText(payload.specialty, 140);
    const academicLevel = cleanText(payload.academicLevel, 80);
    if (!Number.isSafeInteger(id) || id < 1 || fullName.length < 3) return jsonError("تحقق من اسم الطالب");
    if (universitySlug && !await getInstitutionCatalog(universitySlug, true)) return jsonError("الجامعة غير موجودة");
    const result = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(users).where(eq(users.id, id)).for("update");
      if (!before || before.role !== "student") return { error: "الطالب غير موجود", status: 404 };
      if (payload.expectedUpdatedAt !== before.updatedAt) return { error: "تغير الملف أثناء التحرير. حدّث الصفحة ثم حاول مجددًا", status: 409 };
      const changes = { fullName, universitySlug: universitySlug || null, specialty: specialty || null, academicLevel: academicLevel || null, updatedAt: now };
      await tx.update(users).set(changes).where(eq(users.id, id));
      await tx.insert(auditLogs).values({ actorEmail: authorization.actor, action: "update", entityType: "student_profile", entityId: String(id), beforeJson: asJson({ fullName: before.fullName, universitySlug: before.universitySlug, specialty: before.specialty, academicLevel: before.academicLevel }), afterJson: asJson(changes), ipAddress: clientIp(request), createdAt: now });
      return { updatedAt: now };
    });
    if ("error" in result) return jsonError(result.error!, result.status);
    return Response.json({ ok: true, ...result });
  }

  if (action === "saveSupervisorAssignment") {
    const id = payload.id === undefined ? 0 : finiteNumber(payload.id);
    const supervisorId = finiteNumber(payload.supervisorId);
    const institutionSlug = cleanText(payload.institutionSlug, 80).toLowerCase();
    const specialty = cleanText(payload.specialty, 140);
    const active = payload.active !== false;
    if (!Number.isSafeInteger(id) || id < 0 || !Number.isSafeInteger(supervisorId) || supervisorId <= 0 || !institutionSlug || !specialty) return jsonError("اختر المشرف والجامعة والتخصص بمعرفات صحيحة");
    const [supervisor] = await db.select({ id: users.id, role: users.role, email: users.email }).from(users).where(eq(users.id, supervisorId)).limit(1);
    if (!supervisor || supervisor.role !== "supervisor") return jsonError("الحساب المحدد ليس مشرفًا");
    if (!await getInstitutionCatalog(institutionSlug, true)) return jsonError("الجهة غير موجودة");
    const [managedSpecialty] = await db.select({ slug: catalogSpecialties.slug }).from(catalogSpecialties).where(eq(catalogSpecialties.name, specialty)).limit(1);
    if (!managedSpecialty) return jsonError("أنشئ التخصص الإداري أولًا");
    const [specialtyLink] = await db.select({ id: institutionSpecialties.id }).from(institutionSpecialties).where(and(eq(institutionSpecialties.institutionSlug, institutionSlug), eq(institutionSpecialties.specialtySlug, managedSpecialty.slug), eq(institutionSpecialties.status, "published"))).limit(1);
    if (!specialtyLink) return jsonError("التخصص غير مربوط بهذه الجهة");
    const saved = await db.transaction(async tx => {
      const [before] = id ? await tx.select().from(supervisorAssignments).where(eq(supervisorAssignments.id, id)).limit(1).for("update") : [];
      if (id && !before) return null;
      const affected = [...new Set([supervisorId, ...(before ? [before.supervisorId] : [])])].sort((a, b) => a - b);
      for (const userId of affected) await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId})`);
      const values = { supervisorId, institutionSlug, specialty, active };
      const [changed] = id
        ? await tx.update(supervisorAssignments).set(values).where(eq(supervisorAssignments.id, id)).returning({ id: supervisorAssignments.id })
        : await tx.insert(supervisorAssignments).values({ ...values, createdAt: now }).onConflictDoUpdate({ target: [supervisorAssignments.supervisorId, supervisorAssignments.institutionSlug, supervisorAssignments.specialty], set: { active } }).returning({ id: supervisorAssignments.id });
      await tx.update(authSessions).set({ revokedAt: now }).where(and(inArray(authSessions.userId, affected), isNull(authSessions.revokedAt)));
      await tx.update(pushDevices).set({ status: "revoked", lastSeenAt: now }).where(inArray(pushDevices.userId, affected));
      await tx.insert(auditLogs).values({ actorEmail: authorization.actor, action: id ? "update" : "create", entityType: "supervisor_assignment", entityId: String(changed.id), beforeJson: before ? asJson(before) : null, afterJson: asJson(values), ipAddress: clientIp(request), createdAt: now });
      return changed;
    });
    if (!saved) return jsonError("نطاق الإشراف غير موجود", 404);
    return Response.json({ ok: true, id: saved.id }, { status: id ? 200 : 201, headers: { "cache-control": "no-store" } });
  }

  if (action === "grantAccess") {
    const userEmail = cleanText(payload.userEmail, 180).toLowerCase();
    const courseSlug = cleanText(payload.courseSlug, 80);
    const course = await getCourseCatalog(courseSlug, true);
    if (!validEmail(userEmail) || !course) return jsonError("تحقق من الطالب والمادة");
    const [student] = await db.select({ id: users.id, fullName: users.fullName, phone: users.phone, role: users.role }).from(users).where(eq(users.email, userEmail)).limit(1);
    if (!student || student.role !== "student") return jsonError("الطالب غير موجود", 404);
    const rawExpiry = cleanText(payload.expiresAt, 40);
    if (rawExpiry && (!Number.isFinite(Date.parse(rawExpiry)) || Date.parse(rawExpiry) <= Date.parse(now))) return jsonError("يجب أن يكون تاريخ الانتهاء في المستقبل");
    const grantType = cleanText(payload.grantType, 30) === "manual_payment" ? "manual_payment" : "complimentary";
    const suppliedPrice = typeof payload.price === "string" || typeof payload.price === "number" ? finiteNumber(payload.price) : Number.NaN;
    if (grantType === "manual_payment" && (!Number.isFinite(suppliedPrice) || suppliedPrice <= 0 || suppliedPrice > 1_000_000)) return jsonError("اكتب مبلغ الدفعة اليدوية الصحيح");
    const price = grantType === "manual_payment" ? Math.round(suppliedPrice * 100) / 100 : 0;
    const suppliedKey = cleanText(payload.operationKey, 100);
    if (suppliedKey && !/^[A-Za-z0-9_-]{12,90}$/.test(suppliedKey)) return jsonError("معرّف العملية غير صالح");
    // Legacy clients may omit the key; modern clients retain it across a retry.
    const operationKey = suppliedKey || crypto.randomUUID();
    const fingerprint = createHash("sha256").update(JSON.stringify({ userEmail, courseSlug, grantType, price, rawExpiry })).digest("hex");
    const eventKey = `admin-grant:${authorization.actor}:${operationKey}`;
    const orderNumber = grantType === "manual_payment" ? `MANUAL-${createHash("sha256").update(eventKey).digest("hex").slice(0, 24).toUpperCase()}` : null;
    const days = rawExpiry ? Math.max(1, Math.ceil((Date.parse(rawExpiry) - Date.parse(now)) / 86_400_000)) : normalizeAccessDurationDays(course.accessDurationDays, course.access);
    const resolvedExpiry = rawExpiry ? new Date(rawExpiry).toISOString() : accessExpiryIso(days, new Date(now));
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${eventKey}))`);
      const [previous] = await tx.select().from(courseAccessEvents).where(eq(courseAccessEvents.eventKey, eventKey)).limit(1);
      if (previous) {
        const prior = JSON.parse(previous.afterJson || "{}") as { fingerprint?: string };
        if (prior.fingerprint !== fingerprint) return { error: "معرّف العملية مستخدم لبيانات مختلفة", status: 409 };
        return { replayed: true, notice: null as FulfillmentNotice | null };
      }
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`course-access:${userEmail}:${courseSlug}`}))`);
      const [existing] = await tx.select().from(courseAccess).where(and(eq(courseAccess.userEmail, userEmail), eq(courseAccess.courseSlug, courseSlug))).limit(1);
      if (existing?.suspendedAt) return { error: "استأنف الاشتراك المتوقف أولًا قبل منح وصول إضافي", status: 409 };
      if (existing?.storeAccessBlockedAt) await tx.update(courseAccess).set({ storeAccessBlockedAt: null }).where(eq(courseAccess.id, existing.id));
      let notice: FulfillmentNotice | null = null;
      let accessId = existing?.id;
      if (orderNumber) {
        const [order] = await tx.insert(orders).values({ orderNumber, customerEmail: userEmail, customerName: student.fullName, customerPhone: student.phone, courseSlug, subtotal: price, discount: 0, total: price, subtotalMinor: Math.round(price * 100), discountMinor: 0, totalMinor: Math.round(price * 100), currency: "SAR", status: "pending", paymentMethod: "manual", createdAt: now, updatedAt: now }).returning();
        await tx.insert(orderItems).values({ orderNumber, courseSlug, unitPrice: price, discount: 0, total: price, accessDurationDays: days, createdAt: now });
        await tx.insert(paymentEvents).values({ provider: "admin", providerEventId: `admin-payment:${orderNumber}`, orderNumber, status: "paid", payload: asJson({ actor: authorization.actor, price, fingerprint }), receivedAt: now });
        const fulfillment = await fulfillPaidOrderTx(tx, order, [{ courseSlug, accessDurationDays: days, expiresAt: resolvedExpiry }], { actorEmail: authorization.actor, chargeId: null, now, accessSource: "admin_payment", extendDuplicates: true });
        notice = fulfillment.notice;
        const [granted] = await tx.select({ id: courseAccess.id }).from(courseAccess).where(and(eq(courseAccess.userEmail, userEmail), eq(courseAccess.courseSlug, courseSlug))).limit(1);
        accessId = granted?.id;
      } else {
        const expiresAt = existing && existing.source !== "revenuecat" && !existing.revokedAt ? !existing.expiresAt ? null : Date.parse(existing.expiresAt) > Date.parse(resolvedExpiry) ? existing.expiresAt : resolvedExpiry : resolvedExpiry;
        const values = { userEmail, courseSlug, source: existing && existing.source !== "revenuecat" && !existing.revokedAt ? existing.source : "admin_complimentary", orderNumber: existing && existing.source !== "revenuecat" && !existing.revokedAt ? existing.orderNumber : null, startsAt: existing && existing.source !== "revenuecat" && !existing.revokedAt ? existing.startsAt : now, expiresAt, suspendedAt: null, suspensionReason: null, revokedAt: null, revocationReason: null, updatedAt: now };
        const [access] = await tx.insert(courseAccess).values(values).onConflictDoUpdate({ target: [courseAccess.userEmail, courseAccess.courseSlug], set: values }).returning({ id: courseAccess.id });
        accessId = access.id;
        await tx.update(courseWaitlist).set({ status: "converted", convertedAt: now, updatedAt: now }).where(and(eq(courseWaitlist.userEmail, userEmail), eq(courseWaitlist.courseSlug, courseSlug)));
        const title = "تم تفعيل المادة"; const body = `أصبحت مادة «${course.title}» متاحة في حسابك.`;
        const [saved] = await tx.insert(notificationsDb).values({ userEmail, audience: "student", title, body, actionUrl: `/learn/${courseSlug}`, actionLabel: "فتح المادة", template: "success", dedupeKey: eventKey, pushStatus: "pending", createdAt: now }).returning({ id: notificationsDb.id });
        notice = { id: saved.id, title, body, route: `/learn/${courseSlug}` };
      }
      await tx.insert(courseAccessEvents).values({ eventKey, accessId, userEmail, courseSlug, action: grantType === "manual_payment" ? "manual_payment_granted" : "complimentary_granted", actorEmail: authorization.actor, reason: cleanText(payload.reason, 500) || "منحة إدارية", orderNumber, beforeJson: existing ? asJson(existing) : null, afterJson: asJson({ fingerprint, price, grantType, expiresAt: resolvedExpiry }), createdAt: now });
      await tx.insert(auditLogs).values({ actorEmail: authorization.actor, action: "grant", entityType: "course_access", entityId: `${userEmail}:${courseSlug}`, afterJson: asJson({ orderNumber, grantType, price, operationKey }), ipAddress: clientIp(request), createdAt: now });
      return { replayed: false, notice };
    });
    if ("error" in result) return jsonError(result.error!, result.status);
    // Persisted notifications are dispatched by the retryable worker.
    if (result.notice) await db.update(notificationsDb).set({ pushStatus: "pending", pushClaimedAt: null }).where(eq(notificationsDb.id, result.notice.id));
    return Response.json({ ok: true, orderNumber, price, grantType, replayed: result.replayed, operationKey });
  }

  if (action === "updateAccess") {
    const accessId = Math.floor(finiteNumber(payload.id));
    const operation = cleanText(payload.operation, 30);
    const reason = cleanText(payload.reason, 500);
    const suppliedOperationKey = cleanText(payload.operationKey, 100);
    const operationKey = /^[A-Za-z0-9_-]{12,90}$/.test(suppliedOperationKey) ? suppliedOperationKey : crypto.randomUUID();
    if (!Number.isSafeInteger(accessId) || accessId < 1 || !["pause", "resume", "extend", "revoke"].includes(operation)) return jsonError("إجراء الاشتراك غير صالح");
    if (["pause", "revoke"].includes(operation) && reason.length < 3) return jsonError("اكتب سبب الإجراء ليظهر في سجل الاشتراك");
    const [before] = await db.select().from(courseAccess).where(eq(courseAccess.id, accessId)).limit(1);
    if (!before) return jsonError("الاشتراك غير موجود", 404);
    const [decisionBefore] = await effectiveAccessRows([{ ...before, suspendedAt: null }], now);
    const [course] = await Promise.all([getCourseCatalog(before.courseSlug, true)]);
    const changes: Partial<typeof courseAccess.$inferInsert> = { updatedAt: now };
    let extensionDays = 0;
    let notificationTitle = "تم تحديث اشتراكك";
    let notificationBody = `تم تحديث الوصول إلى مادة «${course?.title || before.courseSlug}».`;
    if (operation === "pause") {
      if (decisionBefore.revokedAt) return jsonError("الاشتراك ملغي ولا يمكن إيقافه مؤقتًا", 409);
      changes.suspendedAt = now; changes.suspensionReason = reason;
      notificationTitle = "تم إيقاف الوصول مؤقتًا"; notificationBody = `أُوقف الوصول إلى مادة «${course?.title || before.courseSlug}» مؤقتًا. السبب: ${reason}`;
    } else if (operation === "resume") {
      if (decisionBefore.revokedAt) return jsonError("الاشتراك ملغي؛ امنح صلاحية جديدة بدل الاستئناف", 409);
      if (before.suspendedAt && before.expiresAt) {
        const pauseDuration = Math.max(0, Date.now() - Date.parse(before.suspendedAt));
        if (Number.isFinite(pauseDuration)) changes.expiresAt = new Date(Date.parse(before.expiresAt) + pauseDuration).toISOString();
      }
      changes.suspendedAt = null; changes.suspensionReason = null;
      notificationTitle = "تم استئناف الوصول"; notificationBody = `يمكنك متابعة مادة «${course?.title || before.courseSlug}» الآن.`;
    } else if (operation === "extend") {
      const days = Math.floor(finiteNumber(payload.days));
      extensionDays = days;
      if (!Number.isInteger(days) || days < 1 || days > 3650) return jsonError("مدة التمديد يجب أن تكون بين يوم و3650 يومًا");
      changes.expiresAt = extendAccessExpiry(decisionBefore.expiresAt, days, now);
      notificationTitle = "تم تمديد اشتراكك"; notificationBody = `مُدّد وصولك إلى مادة «${course?.title || before.courseSlug}» لمدة ${days} يومًا.`;
    } else {
      changes.revokedAt = now; changes.storeAccessBlockedAt = now; changes.revocationReason = reason; changes.suspendedAt = null; changes.suspensionReason = null;
      notificationTitle = "تم إيقاف الوصول"; notificationBody = `تم إيقاف الوصول إلى مادة «${course?.title || before.courseSlug}». السبب: ${reason}`;
    }
    let noticeId: number | undefined;
    let transactionError: { message: string; status: number } | null = null;
    let committedBefore = before;
    let committedChanges = changes;
    let replayed = false;
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`course-access:${before.userEmail}:${before.courseSlug}`}))`);
      const [current] = await tx.select().from(courseAccess).where(eq(courseAccess.id, accessId)).limit(1);
      if (!current) { transactionError = { message: "الاشتراك غير موجود", status: 404 }; return; }
      const eventKey = `admin-access:${accessId}:${operationKey}`;
      const [previousEvent] = await tx.select({ id: courseAccessEvents.id }).from(courseAccessEvents).where(eq(courseAccessEvents.eventKey, eventKey)).limit(1);
      if (previousEvent) { replayed = true; committedBefore = current; return; }
      if (payload.expectedUpdatedAt && payload.expectedUpdatedAt !== current.updatedAt) { transactionError = { message: "تغير الاشتراك أثناء التحرير. حدّث الملف وحاول مجددًا", status: 409 }; return; }
      // Ignore the global pause only to inspect underlying rights; writes retain the raw baseline.
      const [decisionCurrent] = await effectiveAccessRows([{ ...current, suspendedAt: null }], now);
      if (operation === "pause" && decisionCurrent.revokedAt) { transactionError = { message: "الاشتراك ملغي ولا يمكن إيقافه مؤقتًا", status: 409 }; return; }
      if (operation === "pause" && current.suspendedAt) { transactionError = { message: "الاشتراك متوقف مؤقتًا بالفعل", status: 409 }; return; }
      if (operation === "resume" && decisionCurrent.revokedAt) { transactionError = { message: "الاشتراك ملغي؛ امنح صلاحية جديدة بدل الاستئناف", status: 409 }; return; }
      if (operation === "resume" && !current.suspendedAt) { transactionError = { message: "الاشتراك غير متوقف مؤقتًا", status: 409 }; return; }
      if (operation === "extend" && decisionCurrent.revokedAt) { transactionError = { message: "لا يمكن تمديد اشتراك ملغي", status: 409 }; return; }
      if (operation === "revoke" && decisionCurrent.revokedAt) { transactionError = { message: "الاشتراك ملغي بالفعل", status: 409 }; return; }

      const lockedChanges: Partial<typeof courseAccess.$inferInsert> = { ...changes, updatedAt: now };
      if (operation === "resume") {
        delete lockedChanges.expiresAt;
        if (current.suspendedAt && current.expiresAt) {
          const pauseDuration = Math.max(0, Date.now() - Date.parse(current.suspendedAt));
          if (Number.isFinite(pauseDuration)) lockedChanges.expiresAt = new Date(Date.parse(current.expiresAt) + pauseDuration).toISOString();
        }
      } else if (operation === "extend") {
        lockedChanges.expiresAt = extendAccessExpiry(decisionCurrent.expiresAt, extensionDays, now);
        const baselineUnavailable = current.source === "revenuecat" || current.revokedAt || (current.expiresAt && Date.parse(current.expiresAt) <= Date.parse(now));
        if (baselineUnavailable) {
          lockedChanges.source = "admin_complimentary"; lockedChanges.startsAt = now; lockedChanges.orderNumber = null;
          lockedChanges.revokedAt = null; lockedChanges.revocationReason = null;
        }
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
    const sessionId = Math.floor(finiteNumber(payload.sessionId));
    if (!Number.isSafeInteger(sessionId) || sessionId < 1) return jsonError("الجلسة غير صحيحة");
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
    const id = Math.floor(finiteNumber(payload.id));
    const courseSlug = cleanText(payload.courseSlug, 80);
    if (!id || !courseSlug || !validSlug(courseSlug)) return jsonError("اختر طلبًا ومادة صالحة");
    const [before] = await db.select().from(courseRequests).where(eq(courseRequests.id, id)).limit(1);
    if (!before) return jsonError("الطلب غير موجود", 404);
    const course = await getCourseCatalog(courseSlug, true);
    if (!course) return jsonError("المادة غير موجودة أو غير منشورة", 404);
    if (before.universitySlug && course.universitySlug && before.universitySlug !== course.universitySlug) return jsonError("المادة لا تتبع جامعة الطلب");
    if (course.audienceScope !== "institution" && before.specialty && course.specialty && before.specialty !== course.specialty) return jsonError("المادة لا تتبع تخصص الطلب");
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
    const id = Math.floor(finiteNumber(payload.id));
    const status = cleanText(payload.status, 30);
    const selectedCourseSlug = cleanText(payload.courseSlug, 80);
    if (!id || !["new", "assigned", "reviewing", "planned", "producing", "available", "declined"].includes(status)) return jsonError("الحالة غير صالحة");
    const [before] = await db.select().from(courseRequests).where(eq(courseRequests.id, id)).limit(1);
    if (!before) return jsonError("الطلب غير موجود", 404);
    const selectedCourse = status === "available" && selectedCourseSlug ? await getCourseCatalog(selectedCourseSlug, true) : null;
    const matchedCourse = status === "available" ? selectedCourse || (await getCoursesCatalog()).find((course) => course.title.trim() === before.courseName.trim() && (!before.universitySlug || course.universitySlug === before.universitySlug) && (course.audienceScope === "institution" || !before.specialty || course.specialty === before.specialty)) : null;
    if (status === "available" && selectedCourseSlug && !selectedCourse) return jsonError("المادة المختارة غير موجودة أو غير منشورة", 404);
    if (matchedCourse && !await supervisorCourseAllowed(authorization.user, matchedCourse.slug)) return jsonError("المادة المرتبطة خارج نطاق الإشراف", 403);
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
    const id = Math.floor(finiteNumber(payload.id));
    const status = cleanText(payload.status, 30);
    const reply = cleanText(payload.reply, 4000);
    if (!id || !["new", "open", "waiting", "resolved", "closed"].includes(status)) return jsonError("حالة التذكرة غير صالحة");
    const [before] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
    if (!before) return jsonError("التذكرة غير موجودة", 404);
    await db.update(supportTickets).set({ status, assignedTo: authorization.actor, updatedAt: now }).where(eq(supportTickets.id, id));
    if (reply) await db.insert(supportReplies).values({ ticketId: id, authorEmail: authorization.actor, authorRole: authorization.user?.role || "admin", body: reply, internal: payload.internal === true, createdAt: now });
    const visibleReply = payload.internal === true ? "" : reply;
    if (before.userEmail && (visibleReply || before.status !== status)) {
      const title = visibleReply ? "رد جديد من دعم مراس" : "تحديث تذكرة الدعم";
      const body = visibleReply ? visibleReply.slice(0, 240) : `تغيرت حالة التذكرة ${before.ticketNumber} إلى «${supportStatusArabic[status] || status}».`;
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
    const id = Math.floor(finiteNumber(payload.id));
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
    const submittedSettings = Object.fromEntries(entries);
    if (Object.hasOwn(submittedSettings, "first_platform_claim_enabled") && !["true", "false"].includes(submittedSettings.first_platform_claim_enabled)) return jsonError("حالة عبارة الأولوية غير صالحة");
    if (Object.hasOwn(submittedSettings, "payment_methods_marketing_enabled") && !["true", "false"].includes(submittedSettings.payment_methods_marketing_enabled)) return jsonError("حالة إظهار خيارات الدفع غير صالحة");
    for (const [key, value] of entries) {
      if (isSocialSettingKey(key) && key !== "whatsapp_number" && value && !normalizeSocialUrl(key, value)) return jsonError(`${SETTING_META[key].label}: أدخل رابط HTTPS صحيحًا من موقع الشبكة نفسها، دون بيانات دخول.`);
      if ((key.startsWith("social_") || key === "ios_app_url" || key === "android_app_url" || key.endsWith("_verify_url") || key === "first_platform_claim_evidence_url") && value && !safeUrl(value)) return jsonError(`رابط ${SETTING_META[key].label} يجب أن يبدأ بـ https`);
      if (key === "support_email" && value && !validEmail(value)) return jsonError("بريد الدعم غير صالح");
      if (key === "whatsapp_number" && value && !normalizeWhatsappNumber(value)) return jsonError("رقم واتساب غير صالح. أدخل رقم الجوال السعودي أو الرقم الدولي مع رمز الدولة.");
      if (["commercial_registration_number", "ecommerce_authentication_number", "vat_number"].includes(key) && value && !/^[0-9 -]{5,30}$/.test(value)) return jsonError(`${SETTING_META[key].label} غير صالح`);
      if (key === "max_student_devices" && value !== "2") return jsonError("يرتبط حساب الطالب بجهازين معتمدين دائمًا. لاستبدال جهاز استخدم إدارة أجهزة الطالب.");
      if (key === "content_view_mode" && !["both", "app_only", "web_only"].includes(value)) return jsonError("اختر طريقة مشاهدة محتوى صالحة");
    }
    // Validate the entire form first, then save atomically (never a partial settings update).
    await db.transaction(async (tx) => {
      for (const [key, value] of entries) {
        const meta = SETTING_META[key];
        await tx.insert(platformSettings).values({ key, value, category: meta.category, isPublic: meta.isPublic, updatedBy: authorization.actor, updatedAt: now }).onConflictDoUpdate({ target: platformSettings.key, set: { value, category: meta.category, isPublic: meta.isPublic, updatedBy: authorization.actor, updatedAt: now } });
      }
      await tx.insert(auditLogs).values({
        actorEmail: authorization.actor, action: "update", entityType: "platform_settings", entityId: "settings",
        beforeJson: null, afterJson: asJson(Object.fromEntries(entries)),
        ipAddress: (request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown").slice(0, 80),
      });
    });
    invalidatePublicSettingsCache();
    return Response.json({ ok: true });
  }

  if (action === "createNotification") {
    if (!authorization.user || !await hasPermission(authorization.user, ADMIN_PERMISSIONS.NOTIFICATIONS_MANAGE)) return jsonError("غير مصرح بإنشاء الإشعارات", 403);
    try {
      await requireAdminStepUp(request, authorization.user);
    } catch (error) {
      if (error instanceof AdminMfaError) {
        return Response.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
      }
      throw error;
    }
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
    if (!["student", "public", "supervisor", "admin", "user", "segment"].includes(audience) || !["inbox", "banner", "modal", "all"].includes(presentation) || !["general", "discount", "new-course", "new-service", "urgent", "success"].includes(template) || title.length < 3 || body.length < 3 || (userEmail && !validEmail(userEmail)) || (audience === "user" && !userEmail) || !actionIsValid || (startsAt && Number.isNaN(new Date(startsAt).getTime())) || (expiresAt && Number.isNaN(new Date(expiresAt).getTime()))) return jsonError("تحقق من بيانات الإشعار");
    if (startsAt && expiresAt && new Date(expiresAt).getTime() <= new Date(startsAt).getTime()) return jsonError("فترة الإعلان غير صحيحة");
    if (audience === "segment") {
      const universitySlug = cleanText(payload.segmentUniversity, 120);
      const specialty = cleanText(payload.segmentSpecialty, 160);
      const segmentCourse = cleanText(payload.segmentCourse, 120);
      const accessState = cleanText(payload.segmentAccessState, 30);
      const inactiveDays = Math.min(3650, Math.max(0, Math.floor(finiteNumber(payload.segmentInactiveDays) || 0)));
      if (!universitySlug && !specialty && !segmentCourse && !accessState && !inactiveDays) return jsonError("اختر معيارًا واحدًا على الأقل للشريحة المستهدفة");
      const candidates = await db.select({ id: users.id, email: users.email, universitySlug: users.universitySlug, specialty: users.specialty, lastLoginAt: users.lastLoginAt }).from(users).where(and(eq(users.role, "student"), eq(users.status, "active"))).limit(10_000);
      const accessRows = segmentCourse || accessState ? await db.select().from(courseAccess).limit(50_000) : [];
      const accessByEmail = new Map<string, typeof accessRows>();
      for (const row of accessRows) accessByEmail.set(row.userEmail.toLowerCase(), [...(accessByEmail.get(row.userEmail.toLowerCase()) || []), row]);
      const threshold = inactiveDays ? Date.now() - inactiveDays * 86_400_000 : 0;
      const recipients = candidates.filter((candidate) => {
        if (universitySlug && candidate.universitySlug !== universitySlug) return false;
        if (specialty && candidate.specialty !== specialty) return false;
        if (inactiveDays && candidate.lastLoginAt && Date.parse(candidate.lastLoginAt) > threshold) return false;
        const grants = accessByEmail.get(candidate.email.toLowerCase()) || [];
        if (segmentCourse && !grants.some((grant) => grant.courseSlug === segmentCourse)) return false;
        if (accessState) {
          const active = grants.some((grant) => !grant.revokedAt && !grant.suspendedAt && (!grant.expiresAt || Date.parse(grant.expiresAt) > Date.now()));
          const expired = grants.some((grant) => Boolean(grant.revokedAt || grant.suspendedAt || (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now())));
          if (accessState === "active" && !active) return false;
          if (accessState === "expired" && !expired) return false;
          if (accessState === "none" && grants.length) return false;
        }
        return true;
      }).slice(0, 5_000);
      if (!recipients.length) return jsonError("لا يوجد طلاب مطابقون للشريحة المختارة", 409);
      const campaignId = crypto.randomUUID();
      for (let offset = 0; offset < recipients.length; offset += 250) {
        await db.insert(notificationsDb).values(recipients.slice(offset, offset + 250).map((recipient) => ({
          audience: "user",
          userEmail: recipient.email.toLowerCase(),
          title,
          body,
          actionUrl,
          actionLabel,
          presentation,
          template,
          pushEnabled,
          pushStatus: pushEnabled ? "pending" : "disabled",
          startsAt,
          expiresAt,
          dismissible,
          dedupeKey: `segment:${campaignId}:${recipient.id}`,
          createdAt: now,
        })));
      }
      const segment = { universitySlug, specialty, courseSlug: segmentCourse, accessState, inactiveDays, recipients: recipients.length };
      await audit(request, authorization.actor, "create", "notification_segment", campaignId, null, { title, template, actionUrl, segment });
      return Response.json({ ok: true, campaignId, recipients: recipients.length, queued: pushEnabled }, { status: 201 });
    }
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
    const value = finiteNumber(payload.value);
    const courseSlug = cleanText(payload.courseSlug, 80) || null;
    const usageLimitValue = finiteNumber(payload.usageLimit);
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
