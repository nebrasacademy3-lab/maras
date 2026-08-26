import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs, catalogCourses, catalogInstitutions, catalogSpecialties, couponsDb, courseAccess, courseRequests,
  courseReviews, courseUnitsDb, institutionSpecialties, lessonsDb, notificationsDb, orders, platformSettings,
  supervisorAssignments, supportReplies, supportTickets, users, videoAssets,
} from "@/db/schema";
import { cleanText, isAdminRequest, jsonError } from "@/lib/api";
import { getSessionUser, roleAllowed, sameOriginRequest, validEmail } from "@/lib/auth";
import { getCourseCatalog, getCoursesCatalog, getInstitutionCatalog, getInstitutionsCatalog, getProgramsCatalog } from "@/lib/catalog-store";
import { PUBLIC_SETTING_DEFAULTS, SETTING_META, type PublicSettingKey } from "@/lib/platform-settings";
import { sendPushNotification } from "@/lib/push";

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

export async function GET(request: Request) {
  const authorization = await authorize(request);
  if (!authorization) return jsonError("غير مصرح", 403);
  const db = getDb();
  const [institutionRows, courses, specialtyRows, links, unitRows, lessonRows, videoRows, studentRows, orderRows, requestRows, ticketRows, replyRows, reviewRows, accessRows, supervisorRows, notificationRows, couponRows, settingRows, audits] = await Promise.all([
    getInstitutionsCatalog(true),
    getCoursesCatalog(true),
    db.select().from(catalogSpecialties).orderBy(catalogSpecialties.name),
    db.select().from(institutionSpecialties),
    db.select().from(courseUnitsDb).orderBy(courseUnitsDb.position),
    db.select().from(lessonsDb).orderBy(lessonsDb.position),
    db.select().from(videoAssets).orderBy(desc(videoAssets.createdAt)).limit(500),
    db.select({ id: users.id, email: users.email, phone: users.phone, fullName: users.fullName, role: users.role, universitySlug: users.universitySlug, specialty: users.specialty, profileCompletedAt: users.profileCompletedAt, onboardingCompletedAt: users.onboardingCompletedAt, lastLoginAt: users.lastLoginAt, status: users.status, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt)).limit(500),
    db.select().from(orders).orderBy(desc(orders.createdAt)).limit(300),
    db.select().from(courseRequests).orderBy(desc(courseRequests.createdAt)).limit(300),
    db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt)).limit(300),
    db.select().from(supportReplies).orderBy(desc(supportReplies.createdAt)).limit(500),
    db.select().from(courseReviews).orderBy(desc(courseReviews.createdAt)).limit(300),
    db.select().from(courseAccess).orderBy(desc(courseAccess.startsAt)).limit(500),
    db.select().from(supervisorAssignments).orderBy(desc(supervisorAssignments.createdAt)).limit(500),
    db.select().from(notificationsDb).orderBy(desc(notificationsDb.createdAt)).limit(200),
    db.select().from(couponsDb).orderBy(desc(couponsDb.createdAt)).limit(200),
    db.select().from(platformSettings),
    db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(120),
  ]);
  const settings = { ...PUBLIC_SETTING_DEFAULTS } as Record<string, string>;
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
    users: studentRows,
    orders: orderRows,
    requests: requestRows,
    tickets: ticketRows.map((ticket) => ({ ...ticket, replies: replyRows.filter((reply) => reply.ticketId === ticket.id) })),
    reviews: reviewRows,
    access: accessRows,
    supervisorAssignments: supervisorRows,
    notifications: notificationRows,
    coupons: couponRows,
    settings,
    audit: audits,
    services: {
      assistant: Boolean(process.env.GEMINI_API_KEY?.trim()),
      payments: Boolean(process.env.TAP_SECRET_KEY?.trim()),
      email: Boolean(process.env.RESEND_API_KEY?.trim()),
      videoSigning: Boolean(process.env.VIDEO_SIGNING_SECRET?.trim() && process.env.VIDEO_SIGNING_SECRET!.trim().length >= 24),
    },
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const authorization = await authorize(request);
  if (!authorization) return jsonError("غير مصرح", 403);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات غير صالحة"); }
  const action = cleanText(payload.action, 50);
  const db = getDb();
  const now = new Date().toISOString();

  if (action === "saveInstitution") {
    const slug = cleanText(payload.slug, 80).toLowerCase();
    const name = cleanText(payload.name, 140);
    const nameEn = cleanText(payload.nameEn, 140);
    const region = cleanText(payload.region, 80);
    const type = cleanText(payload.type, 30);
    const domain = cleanText(payload.domain, 180).replace(/^https?:\/\//, "").replace(/\/$/, "");
    const logoUrl = cleanText(payload.logoUrl, 500);
    const status = cleanText(payload.status, 20) || "published";
    if (!validSlug(slug) || name.length < 3 || !region || !["حكومية", "أهلية", "كلية", "تقنية"].includes(type) || !["published", "hidden"].includes(status)) return jsonError("تحقق من بيانات الجهة");
    if (logoUrl && !safeUrl(logoUrl) && !logoUrl.startsWith("r2:")) return jsonError("رابط الشعار يجب أن يبدأ بـ https");
    const [before] = await db.select().from(catalogInstitutions).where(eq(catalogInstitutions.slug, slug)).limit(1);
    const values = { slug, name, nameEn, region, type, domain: domain || null, logoUrl: logoUrl || before?.logoUrl || null, status, featured: payload.featured === true, sortOrder: Number.isFinite(Number(payload.sortOrder)) ? Math.floor(Number(payload.sortOrder)) : 0, updatedAt: now };
    await db.insert(catalogInstitutions).values({ ...values, createdAt: before?.createdAt || now }).onConflictDoUpdate({ target: catalogInstitutions.slug, set: values });
    await audit(request, authorization.actor, before ? "update" : "create", "institution", slug, before, values);
    return Response.json({ ok: true, institution: values });
  }

  if (action === "saveSpecialty") {
    const slug = cleanText(payload.slug, 80).toLowerCase();
    const name = cleanText(payload.name, 140);
    const description = cleanText(payload.description, 1000);
    const status = cleanText(payload.status, 20) || "published";
    const institutionSlug = cleanText(payload.institutionSlug, 80).toLowerCase();
    if (!validSlug(slug) || name.length < 2 || !["published", "hidden"].includes(status)) return jsonError("تحقق من بيانات التخصص");
    if (institutionSlug && !await getInstitutionCatalog(institutionSlug, true)) return jsonError("الجهة غير موجودة");
    const [before] = await db.select().from(catalogSpecialties).where(eq(catalogSpecialties.slug, slug)).limit(1);
    const values = { slug, name, description, status, updatedAt: now };
    await db.insert(catalogSpecialties).values({ ...values, createdAt: before?.createdAt || now }).onConflictDoUpdate({ target: catalogSpecialties.slug, set: values });
    if (institutionSlug) await db.insert(institutionSpecialties).values({ institutionSlug, specialtySlug: slug, status: "published", sortOrder: 0 }).onConflictDoUpdate({ target: [institutionSpecialties.institutionSlug, institutionSpecialties.specialtySlug], set: { status: "published" } });
    await audit(request, authorization.actor, before ? "update" : "create", "specialty", slug, before, { ...values, institutionSlug });
    return Response.json({ ok: true, specialty: values });
  }

  if (action === "saveCourse") {
    const slug = cleanText(payload.slug, 80).toLowerCase();
    const institutionSlug = cleanText(payload.institutionSlug, 80).toLowerCase();
    const specialtySlug = cleanText(payload.specialtySlug, 80).toLowerCase();
    const title = cleanText(payload.title, 160);
    const status = cleanText(payload.status, 20) || "draft";
    const price = Number(payload.price);
    const oldPriceValue = Number(payload.oldPrice);
    if (!validSlug(slug) || title.length < 3 || !await getInstitutionCatalog(institutionSlug, true) || !validSlug(specialtySlug) || !Number.isFinite(price) || price < 0 || price > 50_000 || !["draft", "published", "hidden"].includes(status)) return jsonError("تحقق من بيانات المادة وربطها");
    const [specialty] = await db.select().from(catalogSpecialties).where(eq(catalogSpecialties.slug, specialtySlug)).limit(1);
    if (!specialty) return jsonError("أنشئ التخصص أو اربطه أولًا");
    const [before] = await db.select().from(catalogCourses).where(eq(catalogCourses.slug, slug)).limit(1);
    const values = {
      slug, institutionSlug, specialtySlug, title,
      titleEn: cleanText(payload.titleEn, 160), code: cleanText(payload.code, 50) || null,
      description: cleanText(payload.description, 3000), price,
      oldPrice: Number.isFinite(oldPriceValue) && oldPriceValue > price ? oldPriceValue : null,
      accessLabel: cleanText(payload.accessLabel, 80) || "90 يومًا",
      status, featured: payload.featured === true, coverTheme: cleanText(payload.coverTheme, 40) || "blue-violet", updatedAt: now,
    };
    await db.insert(catalogCourses).values({ ...values, createdAt: before?.createdAt || now }).onConflictDoUpdate({ target: catalogCourses.slug, set: values });
    await audit(request, authorization.actor, before ? "update" : "create", "course", slug, before, values);
    return Response.json({ ok: true, course: values });
  }

  if (action === "saveUnit") {
    const id = Math.floor(Number(payload.id));
    const courseSlug = cleanText(payload.courseSlug, 80);
    const title = cleanText(payload.title, 160);
    const status = cleanText(payload.status, 20) || "draft";
    if (!validSlug(courseSlug) || title.length < 2 || !["draft", "published", "hidden"].includes(status)) return jsonError("تحقق من الوحدة");
    const [course] = await db.select().from(catalogCourses).where(eq(catalogCourses.slug, courseSlug)).limit(1);
    if (!course) return jsonError("يجب إنشاء المادة في الإدارة أولًا");
    const position = Math.max(0, Math.floor(Number(payload.position) || 0));
    if (id) {
      const [before] = await db.select().from(courseUnitsDb).where(eq(courseUnitsDb.id, id)).limit(1);
      if (!before || before.courseSlug !== courseSlug) return jsonError("الوحدة غير موجودة", 404);
      await db.update(courseUnitsDb).set({ title, position, status, updatedAt: now }).where(eq(courseUnitsDb.id, id));
      await audit(request, authorization.actor, "update", "unit", String(id), before, { title, position, status });
      return Response.json({ ok: true, id });
    }
    const [created] = await db.insert(courseUnitsDb).values({ courseSlug, title, position, status, createdAt: now, updatedAt: now }).returning({ id: courseUnitsDb.id });
    await audit(request, authorization.actor, "create", "unit", String(created.id), null, { courseSlug, title, position, status });
    return Response.json({ ok: true, id: created.id }, { status: 201 });
  }

  if (action === "saveLesson") {
    const id = cleanText(payload.id, 100);
    const courseSlug = cleanText(payload.courseSlug, 80);
    const unitId = Math.floor(Number(payload.unitId));
    const title = cleanText(payload.title, 160);
    const status = cleanText(payload.status, 20) || "draft";
    if (!validSlug(courseSlug) || !validSlug(id) || !unitId || title.length < 2 || !["draft", "published", "hidden"].includes(status)) return jsonError("تحقق من بيانات الدرس");
    const [unit] = await db.select().from(courseUnitsDb).where(and(eq(courseUnitsDb.id, unitId), eq(courseUnitsDb.courseSlug, courseSlug))).limit(1);
    if (!unit) return jsonError("الوحدة لا تتبع هذه المادة");
    const [before] = await db.select().from(lessonsDb).where(eq(lessonsDb.id, id)).limit(1);
    const values = { id, courseSlug, unitId, title, position: Math.max(0, Math.floor(Number(payload.position) || 0)), durationSeconds: Math.max(0, Math.floor(Number(payload.durationSeconds) || 0)), freePreview: payload.freePreview === true, status, videoAssetId: before?.videoAssetId || null, updatedAt: now };
    await db.insert(lessonsDb).values({ ...values, createdAt: before?.createdAt || now }).onConflictDoUpdate({ target: lessonsDb.id, set: values });
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
    const programs = await getProgramsCatalog(institutionSlug);
    if (!programs.programs.some((program) => program.name === specialty)) return jsonError("التخصص غير مرتبط بالجهة");
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
    const [student] = await db.select({ id: users.id }).from(users).where(eq(users.email, userEmail)).limit(1);
    if (!student) return jsonError("الطالب غير موجود", 404);
    const expiresAt = cleanText(payload.expiresAt, 40) || null;
    await db.insert(courseAccess).values({ userEmail, courseSlug, source: "admin", expiresAt, startsAt: now }).onConflictDoUpdate({ target: [courseAccess.userEmail, courseAccess.courseSlug], set: { revokedAt: null, source: "admin", expiresAt, startsAt: now } });
    const course = await getCourseCatalog(courseSlug, true);
    const notificationTitle = "تم تفعيل المادة";
    const notificationBody = `أصبحت مادة «${course?.title || courseSlug}» متاحة في حسابك.`;
    await db.insert(notificationsDb).values({ userEmail, audience: "student", title: notificationTitle, body: notificationBody, actionUrl: `/learn/${courseSlug}`, createdAt: now });
    await sendPushNotification({ userEmail }, notificationTitle, notificationBody, { route: `/learn/${courseSlug}` });
    await audit(request, authorization.actor, "grant", "course_access", `${userEmail}:${courseSlug}`, null, { expiresAt });
    return Response.json({ ok: true });
  }

  if (action === "updateRequest") {
    const id = Math.floor(Number(payload.id));
    const status = cleanText(payload.status, 30);
    if (!id || !["new", "assigned", "reviewing", "planned", "producing", "available", "declined"].includes(status)) return jsonError("الحالة غير صالحة");
    const [before] = await db.select().from(courseRequests).where(eq(courseRequests.id, id)).limit(1);
    if (!before) return jsonError("الطلب غير موجود", 404);
    await db.update(courseRequests).set({ status, updatedAt: now }).where(eq(courseRequests.id, id));
    if (before.userId) {
      const [student] = await db.select({ email: users.email }).from(users).where(eq(users.id, before.userId)).limit(1);
      if (student) {
        const title = "تحديث طلب المادة";
        const body = `تغيرت حالة طلب «${before.courseName}» إلى ${status}.`;
        await db.insert(notificationsDb).values({ userEmail: student.email, audience: "student", title, body, actionUrl: "/dashboard?view=requests", createdAt: now });
        await sendPushNotification({ userEmail: student.email }, title, body, { route: "/requests" });
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
    if (reply) await db.insert(supportReplies).values({ ticketId: id, authorEmail: authorization.actor, body: reply, internal: payload.internal === true, createdAt: now });
    if (before.userEmail && (reply || before.status !== status)) {
      const title = reply ? "رد جديد من دعم مراس" : "تحديث تذكرة الدعم";
      const body = reply ? reply.slice(0, 240) : `تغيرت حالة التذكرة ${before.ticketNumber} إلى ${status}.`;
      await db.insert(notificationsDb).values({ userEmail: before.userEmail, audience: "student", title, body, actionUrl: "/dashboard?view=support", createdAt: now });
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
    const entries = Object.entries(values).filter(([key]) => key in PUBLIC_SETTING_DEFAULTS).map(([key, value]) => [key as PublicSettingKey, cleanText(value, key === "announcement" ? 500 : 500)] as const);
    if (!entries.length) return jsonError("لا توجد إعدادات صالحة");
    for (const [key, value] of entries) {
      if (key.startsWith("social_") && !safeUrl(value)) return jsonError(`رابط ${SETTING_META[key].label} يجب أن يبدأ بـ https`);
      if (key === "support_email" && value && !validEmail(value)) return jsonError("بريد الدعم غير صالح");
      if (key === "whatsapp_number" && value && !/^\+?[0-9\s-]{9,20}$/.test(value)) return jsonError("رقم واتساب غير صالح");
      await db.insert(platformSettings).values({ key, value, category: SETTING_META[key].category, isPublic: true, updatedBy: authorization.actor, updatedAt: now }).onConflictDoUpdate({ target: platformSettings.key, set: { value, category: SETTING_META[key].category, isPublic: true, updatedBy: authorization.actor, updatedAt: now } });
    }
    await audit(request, authorization.actor, "update", "platform_settings", "public", null, Object.fromEntries(entries));
    return Response.json({ ok: true });
  }

  if (action === "createNotification") {
    const audience = cleanText(payload.audience, 30) || "student";
    const title = cleanText(payload.title, 160);
    const body = cleanText(payload.body, 1000);
    const userEmail = cleanText(payload.userEmail, 180).toLowerCase() || null;
    const actionUrl = cleanText(payload.actionUrl, 300) || null;
    if (!["student", "supervisor", "admin", "user"].includes(audience) || title.length < 3 || body.length < 3 || (actionUrl && (!actionUrl.startsWith("/") || actionUrl.startsWith("//")))) return jsonError("تحقق من بيانات الإشعار");
    const [created] = await db.insert(notificationsDb).values({ audience, title, body, userEmail, actionUrl, createdAt: now }).returning({ id: notificationsDb.id });
    await sendPushNotification({ userEmail, audience }, title, body, { route: actionUrl || "/notifications" });
    await audit(request, authorization.actor, "create", "notification", String(created.id), null, { audience, title, userEmail });
    return Response.json({ ok: true, id: created.id }, { status: 201 });
  }

  if (action === "saveCoupon") {
    const code = cleanText(payload.code, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    const type = cleanText(payload.type, 20);
    const value = Number(payload.value);
    if (code.length < 3 || !["percent", "fixed"].includes(type) || !Number.isFinite(value) || value <= 0 || (type === "percent" && value > 95)) return jsonError("تحقق من بيانات الكوبون (الحد الأقصى للنسبة 95%)");
    await db.insert(couponsDb).values({ code, type, value, courseSlug: cleanText(payload.courseSlug, 80) || null, usageLimit: Number(payload.usageLimit) > 0 ? Math.floor(Number(payload.usageLimit)) : null, startsAt: cleanText(payload.startsAt, 40) || null, expiresAt: cleanText(payload.expiresAt, 40) || null, status: "active", createdAt: now }).onConflictDoUpdate({ target: couponsDb.code, set: { type, value, courseSlug: cleanText(payload.courseSlug, 80) || null, usageLimit: Number(payload.usageLimit) > 0 ? Math.floor(Number(payload.usageLimit)) : null, startsAt: cleanText(payload.startsAt, 40) || null, expiresAt: cleanText(payload.expiresAt, 40) || null, status: "active" } });
    await audit(request, authorization.actor, "save", "coupon", code, null, { type, value });
    return Response.json({ ok: true });
  }

  return jsonError("الإجراء غير معروف", 404);
}
