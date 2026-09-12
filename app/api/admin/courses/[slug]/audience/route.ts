import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, catalogCourses, courseAccess, courseWaitlist, users } from "@/db/schema";
import { adminControlGuard } from "@/lib/admin-control-guard";
import { cleanText, jsonError } from "@/lib/api";
import { clientIp } from "@/lib/auth";
import { getCourseCatalog, invalidateCatalogCache } from "@/lib/catalog-store";
import { audienceQuery, escapedLike } from "@/lib/course-audience-contract";
import { ENROLLMENT_MODES, enrollmentMode } from "@/lib/course-enrollment";
import { queueCourseLaunchNotifications } from "@/lib/course-launch-notifications";
import { dispatchDuePushNotifications } from "@/lib/push-campaigns";
import { readBoundedJsonObject, RequestBodyTooLargeError } from "@/lib/request-body";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string }> };
const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
const validSlug = (value: string) => /^[a-z0-9][a-z0-9._-]{1,119}$/i.test(value);

export async function GET(request: Request, context: Context) {
  const guarded = await adminControlGuard(request);
  if (guarded.response) return guarded.response;
  const { slug } = await context.params;
  if (!validSlug(slug)) return jsonError("معرّف المادة غير صالح");
  try {
    const course = await getCourseCatalog(slug, true);
    if (!course) return jsonError("المادة غير موجودة", 404);
    const query = audienceQuery(new URL(request.url).searchParams);
    const now = new Date().toISOString();
    const state = sql<string>`CASE WHEN ${courseAccess.revokedAt} IS NOT NULL THEN 'revoked' WHEN ${courseAccess.suspendedAt} IS NOT NULL THEN 'suspended' WHEN ${courseAccess.startsAt}::timestamptz > ${now}::timestamptz THEN 'scheduled' WHEN ${courseAccess.expiresAt} IS NOT NULL AND ${courseAccess.expiresAt}::timestamptz <= ${now}::timestamptz THEN 'expired' ELSE 'active' END`;
    return await getDb().transaction(async tx => {
      const [[managed], groupedAccess, groupedWaitlist] = await Promise.all([
        tx.select({ status: catalogCourses.status, enrollmentMode: catalogCourses.enrollmentMode, updatedAt: catalogCourses.updatedAt }).from(catalogCourses).where(eq(catalogCourses.slug, slug)).limit(1),
        tx.select({ status: state, total: count() }).from(courseAccess).where(eq(courseAccess.courseSlug, slug)).groupBy(state),
        tx.select({ status: courseWaitlist.status, total: count() }).from(courseWaitlist).where(eq(courseWaitlist.courseSlug, slug)).groupBy(courseWaitlist.status),
      ]);
      const accessCounts = new Map(groupedAccess.map(row => [row.status, Number(row.total)]));
      const waitCounts = new Map(groupedWaitlist.map(row => [row.status, Number(row.total)]));
      const summary = { subscriptions: groupedAccess.reduce((n, row) => n + Number(row.total), 0), active: accessCounts.get("active") || 0, suspended: accessCounts.get("suspended") || 0, expired: accessCounts.get("expired") || 0, scheduled: accessCounts.get("scheduled") || 0, revoked: accessCounts.get("revoked") || 0, waiting: waitCounts.get("active") || 0, notified: waitCounts.get("notified") || 0, converted: waitCounts.get("converted") || 0, cancelled: waitCounts.get("cancelled") || 0 };
      const table = query.kind === "waitlist" ? courseWaitlist : courseAccess;
      const filter = and(eq(table.courseSlug, slug), query.status === "all" ? undefined : query.kind === "waitlist" ? eq(courseWaitlist.status, query.status) : sql`${state} = ${query.status}`, query.search ? or(ilike(table.userEmail, escapedLike(query.search)), ilike(users.fullName, escapedLike(query.search)), ilike(users.phone, escapedLike(query.search))) : undefined);
      const [totalRow] = await tx.select({ total: count() }).from(table).leftJoin(users, eq(users.email, table.userEmail)).where(filter);
      const total = Number(totalRow.total);
      const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
      const page = Math.min(query.page, totalPages);
      const common = { fullName: users.fullName, phone: users.phone, userId: users.id };
      const items = query.kind === "waitlist"
        ? await tx.select({ ...common, id: courseWaitlist.id, userEmail: courseWaitlist.userEmail, status: courseWaitlist.status, source: courseWaitlist.source, createdAt: courseWaitlist.createdAt, notifiedAt: courseWaitlist.notifiedAt, convertedAt: courseWaitlist.convertedAt }).from(courseWaitlist).leftJoin(users, eq(users.email, courseWaitlist.userEmail)).where(filter).orderBy(desc(courseWaitlist.id)).limit(query.pageSize).offset((page - 1) * query.pageSize)
        : await tx.select({ ...common, id: courseAccess.id, userEmail: courseAccess.userEmail, status: state, source: courseAccess.source, createdAt: courseAccess.startsAt, startsAt: courseAccess.startsAt, expiresAt: courseAccess.expiresAt, orderNumber: courseAccess.orderNumber }).from(courseAccess).leftJoin(users, eq(users.email, courseAccess.userEmail)).where(filter).orderBy(desc(courseAccess.id)).limit(query.pageSize).offset((page - 1) * query.pageSize);
      return Response.json({ ok: true, generatedAt: now, course: { slug, title: course.title, university: course.university, specialty: course.specialty, enrollmentMode: enrollmentMode(managed?.enrollmentMode), status: managed?.status || "published", availableForPurchase: Boolean(course.availableForPurchase), readyLessons: course.readyLessons || 0, updatedAt: managed?.updatedAt || null, managed: Boolean(managed) }, summary, items, pagination: { page, pageSize: query.pageSize, total, totalPages } }, { headers });
    }, { isolationLevel: "repeatable read", readOnly: true });
  } catch { return jsonError("تعذر تحميل بيانات المادة. راجع اتصال قاعدة البيانات وتطبيق التحديث 0029.", 503); }
}

export async function POST(request: Request, context: Context) {
  const guarded = await adminControlGuard(request, true);
  if (guarded.response) return guarded.response;
 if (!guarded.user) return jsonError("غير مصرح",403);
  const actor = guarded.user;
  const { slug } = await context.params;
  if (!validSlug(slug)) return jsonError("معرّف المادة غير صالح");
  let payload: Record<string, unknown>;
  try { payload = await readBoundedJsonObject(request, 16 * 1024); }
  catch (error) { return jsonError("بيانات غير صالحة أو أكبر من المسموح", error instanceof RequestBodyTooLargeError ? 413 : 400); }
  const action = cleanText(payload.action, 40);
  if (!["setEnrollment", "dispatchLaunch"].includes(action)) return jsonError("الإجراء غير مدعوم");
  const reason = cleanText(payload.reason, 500);
  if (reason.length < 3) return jsonError("اكتب سبب الإجراء من ثلاثة أحرف على الأقل");
  try {
    if (!await getCourseCatalog(slug, true)) return jsonError("المادة غير موجودة", 404);
    if (action === "setEnrollment") {
      if (!(ENROLLMENT_MODES as readonly unknown[]).includes(payload.enrollmentMode)) return jsonError("حالة الاشتراك غير صالحة");
      const result = await getDb().transaction(async tx => {
        const [before] = await tx.select({ status: catalogCourses.status, enrollmentMode: catalogCourses.enrollmentMode, updatedAt: catalogCourses.updatedAt }).from(catalogCourses).where(eq(catalogCourses.slug, slug)).limit(1).for("update");
        if (!before) return "unmanaged";
        if (typeof payload.expectedUpdatedAt !== "string" || payload.expectedUpdatedAt !== before.updatedAt) return "conflict";
        const values = { enrollmentMode: enrollmentMode(payload.enrollmentMode), updatedAt: new Date().toISOString() };
        await tx.update(catalogCourses).set(values).where(eq(catalogCourses.slug, slug));
        await tx.insert(auditLogs).values({ actorEmail: actor.email, action: "set_enrollment", entityType: "course", entityId: slug, beforeJson: JSON.stringify(before), afterJson: JSON.stringify({ ...values, reason }), ipAddress: clientIp(request) });
        return "saved";
      });
      if (result === "unmanaged") return jsonError("حوّل المادة لإدارة حية من زر تعديل المادة أولًا.", 409);
      if (result === "conflict") return jsonError("عُدلت المادة من جلسة أخرى. حدّث الصفحة ثم راجع التغيير.", 409, "STALE_RECORD");
    }
    invalidateCatalogCache();
    // Enrollment is already durably saved. A provider/queue outage must not turn a successful save into a false failure.
    const launch = await queueCourseLaunchNotifications(slug).catch(() => ({ queued: 0, processed: 0, hasMore: true, retryScheduled: true }));
    const push = action === "dispatchLaunch" ? await dispatchDuePushNotifications(100, { actionUrl: `/courses/${encodeURIComponent(slug)}` }).catch(() => null) : null;
    if (action === "dispatchLaunch") await getDb().insert(auditLogs).values({ actorEmail: actor.email, action: "dispatch_launch", entityType: "course", entityId: slug, afterJson: JSON.stringify({ reason, launch, push: push ? { campaigns: push.campaigns, accepted: push.accepted, rejected: push.rejected } : null }), ipAddress: clientIp(request) });
    return Response.json({ ok: true, launch, push: push ? { campaigns: push.campaigns, accepted: push.accepted, rejected: push.rejected } : null, message: action === "setEnrollment" ? `تم حفظ حالة الاشتراك. أُضيف ${launch.queued} تنبيه إلى الطابور؛ تُستكمل الدفعات تلقائيًا.` : `أُضيف ${launch.queued} تنبيه، وقبل مزود الإشعارات ${push?.accepted || 0} إرسالًا للجهاز. قبول المزود لا يعني تأكيد المشاهدة.` }, { headers });
  } catch { return jsonError("تعذر تنفيذ الإجراء. لم تُكشف تفاصيل الخادم.", 500); }
}
