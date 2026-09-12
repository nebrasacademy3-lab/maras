import { and, count, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  aiEntitlements,
  aiSubscriptionOrders,
  aiUsageEvents,
  authSessions,
  cartItems,
  couponsDb,
  courseAccess,
  courseAccessEvents,
  courseRequests,
  courseWaitlist,
  favorites,
  invoices,
  learningTrackInterests,
  learningTracks,
  lessonNotes,
  lessonProgress,
  notificationsDb,
  orderItems,
  orders,
  pushDevices,
  referralAttributions,
  referralCodes,
  refundRequests,
  supportReplies,
  supportTickets,
  userRewards,
  users,
} from "@/db/schema";
import { jsonError } from "@/lib/api";
import { validEmail } from "@/lib/auth";
import { adminControlGuard } from "@/lib/admin-control-guard";
import { ACADEMIC_LEVELS } from "@/lib/academic-levels";
import { getAiEntitlement } from "@/lib/ai-platform";
import { STUDENT_CONTROL_ACTIONS } from "@/lib/student-control-contract";
import { activeUserAccessWhere } from "@/lib/course-access";
import { getCoursesCatalog, getInstitutionsCatalog } from "@/lib/catalog-store";
import { publicRewardLabel } from "@/lib/referrals";

type Props = { params: Promise<{ email: string }> };

export async function GET(request: Request, { params }: Props) {
  const guarded = await adminControlGuard(request);
  if (guarded.response) return guarded.response;
  const email = (await params).email.trim().toLowerCase();
  if (!validEmail(email)) return jsonError("البريد غير صالح");
  const db = getDb();
  const [student] = await db.select({
    id: users.id,
    email: users.email,
    phone: users.phone,
    fullName: users.fullName,
    role: users.role,
    status: users.status,
    universitySlug: users.universitySlug,
    specialty: users.specialty,
    academicLevel: users.academicLevel,
    emailVerifiedAt: users.emailVerifiedAt,
    phoneVerifiedAt: users.phoneVerifiedAt,
    lastLoginAt: users.lastLoginAt,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
  }).from(users).where(eq(users.email, email)).limit(1);
  if (!student || student.role !== "student") return jsonError("الطالب غير موجود", 404);

  const [access, progress, orderRows, invoiceRows, tickets, requests, notices, sessions, accessEvents, courseCatalog, institutionCatalog] = await Promise.all([
    db.select().from(courseAccess).where(eq(courseAccess.userEmail, email)).orderBy(desc(courseAccess.updatedAt)).limit(300),
    db.select().from(lessonProgress).where(eq(lessonProgress.userEmail, email)).orderBy(desc(lessonProgress.updatedAt)).limit(1_000),
    db.select().from(orders).where(eq(orders.customerEmail, email)).orderBy(desc(orders.createdAt)).limit(300),
    db.select().from(invoices).where(eq(invoices.customerEmail, email)).orderBy(desc(invoices.issuedAt)).limit(300),
    db.select().from(supportTickets).where(eq(supportTickets.userEmail, email)).orderBy(desc(supportTickets.createdAt)).limit(200),
    db.select().from(courseRequests).where(eq(courseRequests.userId, student.id)).orderBy(desc(courseRequests.createdAt)).limit(200),
    db.select().from(notificationsDb).where(eq(notificationsDb.userEmail, email)).orderBy(desc(notificationsDb.createdAt)).limit(300),
    db.select({ id: authSessions.id, deviceId: authSessions.deviceId, deviceLabel: authSessions.deviceLabel, platform: authSessions.platform, ipAddress: authSessions.ipAddress, lastSeenAt: authSessions.lastSeenAt, expiresAt: authSessions.expiresAt, revokedAt: authSessions.revokedAt, createdAt: authSessions.createdAt }).from(authSessions).where(eq(authSessions.userId, student.id)).orderBy(desc(authSessions.lastSeenAt)).limit(100),
    db.select().from(courseAccessEvents).where(eq(courseAccessEvents.userEmail, email)).orderBy(desc(courseAccessEvents.createdAt)).limit(500),
    getCoursesCatalog(true),
    getInstitutionsCatalog(true),
  ]);

  const orderNumbers = orderRows.map((order) => order.orderNumber);
  const ticketIds = tickets.map((ticket) => ticket.id);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [items, replies, referralCode, attributionRows, rewardRows, ownedCoupons, aiEntitlementRows, aiOrderRows, aiUsageRows, waitlistRows, trackInterestRows, devices, refundRows, favoriteRows, cartRows, noteCount] = await Promise.all([
    orderNumbers.length ? db.select().from(orderItems).where(inArray(orderItems.orderNumber, orderNumbers)).orderBy(desc(orderItems.createdAt)) : Promise.resolve([]),
    ticketIds.length ? db.select().from(supportReplies).where(inArray(supportReplies.ticketId, ticketIds)).orderBy(desc(supportReplies.createdAt)).limit(1_000) : Promise.resolve([]),
    db.select().from(referralCodes).where(eq(referralCodes.userId, student.id)).limit(1).then((rows) => rows[0] || null),
    db.select().from(referralAttributions).where(or(eq(referralAttributions.referrerUserId, student.id), eq(referralAttributions.referredUserId, student.id))).orderBy(desc(referralAttributions.createdAt)).limit(200),
    db.select().from(userRewards).where(eq(userRewards.userId, student.id)).orderBy(desc(userRewards.issuedAt)).limit(100),
    db.select().from(couponsDb).where(eq(couponsDb.ownerUserId, student.id)).orderBy(desc(couponsDb.createdAt)).limit(100),
    db.select().from(aiEntitlements).where(eq(aiEntitlements.userId, student.id)).orderBy(desc(aiEntitlements.createdAt)).limit(50),
    db.select().from(aiSubscriptionOrders).where(eq(aiSubscriptionOrders.userId, student.id)).orderBy(desc(aiSubscriptionOrders.createdAt)).limit(50),
    db.select({ service: aiUsageEvents.service, status: aiUsageEvents.status, total: count() }).from(aiUsageEvents).where(and(eq(aiUsageEvents.userId, student.id), gte(aiUsageEvents.createdAt, thirtyDaysAgo))).groupBy(aiUsageEvents.service, aiUsageEvents.status),
    db.select().from(courseWaitlist).where(eq(courseWaitlist.userEmail, email)).orderBy(desc(courseWaitlist.createdAt)).limit(100),
    db.select({ id: learningTrackInterests.id, status: learningTrackInterests.status, source: learningTrackInterests.source, lastNotifiedVersion: learningTrackInterests.lastNotifiedVersion, createdAt: learningTrackInterests.createdAt, trackTitle: learningTracks.title, trackSlug: learningTracks.slug, trackStatus: learningTracks.status }).from(learningTrackInterests).innerJoin(learningTracks, eq(learningTrackInterests.trackId, learningTracks.id)).where(eq(learningTrackInterests.userId, student.id)).orderBy(desc(learningTrackInterests.createdAt)).limit(100),
    db.select({ id: pushDevices.id, deviceId: pushDevices.deviceId, platform: pushDevices.platform, deviceLabel: pushDevices.deviceLabel, status: pushDevices.status, lastSeenAt: pushDevices.lastSeenAt, createdAt: pushDevices.createdAt }).from(pushDevices).where(eq(pushDevices.userId, student.id)).orderBy(desc(pushDevices.lastSeenAt)).limit(50),
    orderNumbers.length ? db.select().from(refundRequests).where(inArray(refundRequests.orderNumber, orderNumbers)).orderBy(desc(refundRequests.createdAt)).limit(100) : Promise.resolve([]),
    db.select().from(favorites).where(eq(favorites.userEmail, email)).orderBy(desc(favorites.createdAt)).limit(200),
    db.select().from(cartItems).where(eq(cartItems.userEmail, email)).orderBy(desc(cartItems.createdAt)).limit(100),
    db.select({ total: count() }).from(lessonNotes).where(eq(lessonNotes.userEmail, email)).then((rows) => Number(rows[0]?.total || 0)),
  ]);
  const referredUserIds = [...new Set(attributionRows.flatMap((row) => [row.referrerUserId, row.referredUserId]).filter((id) => id !== student.id))];
  const relatedUsers = referredUserIds.length ? await db.select({ id: users.id, email: users.email, fullName: users.fullName }).from(users).where(inArray(users.id, referredUserIds)) : [];
  const relatedById = new Map(relatedUsers.map((row) => [row.id, row]));
  const couponById = new Map(ownedCoupons.map((coupon) => [coupon.id, coupon]));

  const now = new Date().toISOString();
  // Summary cards use database aggregates, never lengths of the capped detail lists.
  const [[accessTotals], [progressTotals], [orderTotals], [ticketTotals], [notificationTotals], [deviceTotals], entitlement, auditTrail] = await Promise.all([
    db.select({total:count()}).from(courseAccess).where(activeUserAccessWhere(email,now)),
    db.select({completed:sql<number>`count(*) FILTER (WHERE ${lessonProgress.completed})::int`,watched:sql<number>`coalesce(sum(greatest(${lessonProgress.watchedSeconds},0)),0)::float`,total:count()}).from(lessonProgress).where(eq(lessonProgress.userEmail,email)),
    db.select({paid:sql<number>`count(*) FILTER (WHERE ${orders.status} IN ('paid','partially_refunded'))::int`,value:sql<number>`coalesce(sum(${orders.total}) FILTER (WHERE ${orders.status} IN ('paid','partially_refunded')),0)::float`,total:count()}).from(orders).where(eq(orders.customerEmail,email)),
    db.select({open:sql<number>`count(*) FILTER (WHERE ${supportTickets.status} NOT IN ('resolved','closed'))::int`,total:count()}).from(supportTickets).where(eq(supportTickets.userEmail,email)),
    db.select({unread:sql<number>`count(*) FILTER (WHERE ${notificationsDb.readAt} IS NULL AND (${notificationsDb.expiresAt} IS NULL OR ${notificationsDb.expiresAt}::timestamptz > ${now}::timestamptz) AND (${notificationsDb.startsAt} IS NULL OR ${notificationsDb.startsAt}::timestamptz <= ${now}::timestamptz))::int`,total:count()}).from(notificationsDb).where(eq(notificationsDb.userEmail,email)),
    db.select({active:sql<number>`count(*) FILTER (WHERE ${pushDevices.status} = 'active')::int`}).from(pushDevices).where(eq(pushDevices.userId,student.id)),
    getAiEntitlement(student),
    db.select({id:auditLogs.id,action:auditLogs.action,actorEmail:auditLogs.actorEmail,afterJson:auditLogs.afterJson,createdAt:auditLogs.createdAt}).from(auditLogs).where(and(eq(auditLogs.entityType,"student_control"),eq(auditLogs.entityId,String(student.id)))).orderBy(desc(auditLogs.id)).limit(100),
  ]);
  const courseLabels = new Map(courseCatalog.map(row=>[row.slug,row.title]));
  const option = (value:string|number,label:string) => ({value:String(value),label});
  const courseOption = (row:{id:number;courseSlug:string}) => option(row.id,courseLabels.get(row.courseSlug)||row.courseSlug);
  const relevantCourseSlugs = new Set([...access.map((item) => item.courseSlug), ...progress.map((item) => item.courseSlug), ...items.map((item) => item.courseSlug), ...waitlistRows.map((item) => item.courseSlug), ...favoriteRows.map((item) => item.courseSlug), ...cartRows.map((item) => item.courseSlug)]);
  return Response.json({
    ok: true,
    student,
    summary: {
      activeSubscriptions: Number(accessTotals.total),
      completedLessons: Number(progressTotals.completed),
      watchedSeconds: Number(progressTotals.watched),
      paidOrders: Number(orderTotals.paid),
      paidValue: Number(orderTotals.value),
      openTickets: Number(ticketTotals.open),
      unreadNotifications: Number(notificationTotals.unread),
      qualifiedReferrals: attributionRows.filter((row) => row.referrerUserId === student.id && row.status === "qualified").length,
      activeRewards: rewardRows.filter((row) => row.status === "active").length,
      aiActive: entitlement.tier === "subscriber",
      pushDevices: Number(deviceTotals.active),
      lessonNotes: noteCount,
    },
    generatedAt: now,
    controls: {
      actions: STUDENT_CONTROL_ACTIONS,
      profile: {fullName:student.fullName,phone:student.phone||"",universitySlug:student.universitySlug||"",specialty:student.specialty||"",academicLevel:student.academicLevel||"",expectedUpdatedAt:student.updatedAt},
      choices: {
        courses:courseCatalog.map(row=>option(row.slug,`${row.title} · ${row.university}`)),
        institutions:institutionCatalog.map(row=>option(row.slug,row.name)), levels:ACADEMIC_LEVELS.map(level=>option(level,level)),
        subscriptions:access.map(row=>option(row.id,`${courseLabels.get(row.courseSlug)||row.courseSlug} · #${row.id}`)),
        entitlements:aiEntitlementRows.map(row=>option(row.id,`${row.source} · ${row.status} · #${row.id}`)),
        waitlist:waitlistRows.map(courseOption),tracks:trackInterestRows.map(row=>option(row.id,row.trackTitle)),
        favorites:favoriteRows.map(courseOption),cart:cartRows.map(courseOption),
        support:tickets.map(row=>option(row.id,`${row.ticketNumber} · ${row.title}`)),
        requests:requests.map(row=>option(row.id,`${row.courseName} · #${row.id}`)),
        notifications:notices.map(row=>option(row.id,`${row.title} · #${row.id}`)),
        sessions:sessions.map(row=>option(row.id,`${row.deviceLabel||row.platform} · #${row.id}`)),
        pushDevices:devices.map(row=>option(row.id,`${row.deviceLabel||row.platform} · #${row.id}`)),
      },
    },
    detailWindow: {notice:"القوائم تعرض أحدث السجلات، بينما مؤشرات الاشتراكات والمدفوعات والدروس والدعم والإشعارات تُحسب من جميع سجلات الطالب.",limits:{subscriptions:300,progress:1000,orders:300,support:200,requests:200,notifications:300,waitlist:100,trackInterests:100,sessions:100,audit:100},totals:{progress:Number(progressTotals.total),orders:Number(orderTotals.total),support:Number(ticketTotals.total),notifications:Number(notificationTotals.total)}},
    auditTrail: auditTrail.map(row=>{let reason="";try{reason=String(JSON.parse(row.afterJson||"{}").reason||"");}catch{}return {id:row.id,action:row.action,actorEmail:row.actorEmail,reason,createdAt:row.createdAt};}),
    catalog: {
      institution: institutionCatalog.find((row) => row.slug === student.universitySlug) || null,
      courses: courseCatalog
        .filter((row) => relevantCourseSlugs.has(row.slug))
        .map((row) => ({ slug: row.slug, title: row.title, university: row.university, universitySlug: row.universitySlug, specialty: row.specialty })),
    },
    subscriptions: access,
    accessEvents,
    progress,
    orders: orderRows.map((order) => ({ ...order, items: items.filter((item) => item.orderNumber === order.orderNumber), invoice: invoiceRows.find((invoice) => invoice.orderNumber === order.orderNumber) || null })),
    requests,
    support: tickets.map((ticket) => ({ ...ticket, replies: replies.filter((reply) => reply.ticketId === ticket.id) })),
    notifications: notices,
    sessions,
    referrals: {
      code: referralCode ? { code: referralCode.code, shareCount: referralCode.shareCount, createdAt: referralCode.createdAt } : null,
      referredBy: attributionRows.filter((row) => row.referredUserId === student.id).map((row) => ({ id: row.id, status: row.status, referrer: relatedById.get(row.referrerUserId) || { id: row.referrerUserId, email: "", fullName: "طالب" }, createdAt: row.createdAt, qualifiedAt: row.qualifiedAt, reviewReason: row.reviewReason })),
      referred: attributionRows.filter((row) => row.referrerUserId === student.id).map((row) => ({ id: row.id, status: row.status, referred: relatedById.get(row.referredUserId) || { id: row.referredUserId, email: "", fullName: "طالب" }, createdAt: row.createdAt, qualifiedAt: row.qualifiedAt, reviewReason: row.reviewReason })),
      rewards: rewardRows.map((row) => ({ id: row.id, rewardType: row.rewardType, rewardValue: row.rewardValue, rewardLabel: publicRewardLabel(row.rewardType, row.rewardValue), sourceType: row.sourceType, status: row.status, issuedAt: row.issuedAt, expiresAt: row.expiresAt, redeemedAt: row.redeemedAt, note: row.note, coupon: row.couponId ? (() => { const coupon = couponById.get(row.couponId!); return coupon ? { id: coupon.id, code: coupon.code, status: coupon.status, usedCount: coupon.usedCount, courseSlug: coupon.courseSlug, expiresAt: coupon.expiresAt } : null; })() : null })),
      coupons: ownedCoupons.map((coupon) => ({ id: coupon.id, code: coupon.code, type: coupon.type, value: coupon.value, status: coupon.status, usedCount: coupon.usedCount, usageLimit: coupon.usageLimit, courseSlug: coupon.courseSlug, expiresAt: coupon.expiresAt, createdAt: coupon.createdAt })),
    },
    ai: {
      entitlements: aiEntitlementRows.map((row) => ({ id: row.id, source: row.source, status: row.status, startsAt: row.startsAt, expiresAt: row.expiresAt, createdBy: row.createdBy, externalRef: row.externalRef })),
      orders: aiOrderRows.map((row) => ({ id: row.id, orderNumber: row.orderNumber, amount: row.amount, currency: row.currency, status: row.status, paidAt: row.paidAt, entitlementExpiresAt: row.entitlementExpiresAt, createdAt: row.createdAt })),
      usage: aiUsageRows.map((row) => ({ service: row.service, status: row.status, total: Number(row.total) })),
    },
    waitlist: waitlistRows,
    trackInterests: trackInterestRows,
    pushDevices: devices,
    refunds: refundRows.map((row) => ({ id: row.id, requestNumber: row.requestNumber, orderNumber: row.orderNumber, amountMinor: row.amountMinor, currency: row.currency, status: row.status, reason: row.reason, createdAt: row.createdAt, completedAt: row.completedAt })),
    favorites: favoriteRows,
    cart: cartRows,
  }, { headers: { "cache-control": "private, no-store", "x-content-type-options":"nosniff" } });
}
