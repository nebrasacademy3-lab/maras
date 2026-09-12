import { and, count, desc, eq, gt, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
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
  notificationReads,
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
import { checkRateLimit, getSessionUser, roleAllowed } from "@/lib/auth";
import { getCoursesCatalog, getInstitutionsCatalog } from "@/lib/catalog-store";
import { activeAccessCondition, effectiveAccessRows } from "@/lib/course-access";
import { adminPage } from "@/lib/admin-operations";
import { publicRewardLabel } from "@/lib/referrals";

type Props = { params: Promise<{ email: string }> };

export async function GET(request: Request, { params }: Props) {
  const admin = await getSessionUser(request);
  if (!roleAllowed(admin, ["admin"])) return jsonError("غير مصرح بعرض ملف الطالب", 403);
  if (!await checkRateLimit("student-360-read", `user:${admin!.id}`, 60, 60)) return jsonError("طلبات كثيرة، حاول بعد دقيقة", 429);
  let email: string;
  try { email = decodeURIComponent((await params).email).trim().toLowerCase(); } catch { return jsonError("البريد غير صالح"); }
  const query = new URL(request.url).searchParams;
  const now = new Date().toISOString();
  const pageFor = (key: string) => adminPage(query.get(`${key}Page`));
  const offset = (key: string) => pageFor(key).offset;
  if (!/^\S+@\S+\.\S+$/.test(email)) return jsonError("البريد غير صالح");
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
  if (!student) return jsonError("الطالب غير موجود", 404);

  const notificationVisibility = and(or(eq(notificationsDb.userEmail, email), and(isNull(notificationsDb.userEmail), or(eq(notificationsDb.audience, student.role), eq(notificationsDb.audience, "public")))), or(eq(notificationsDb.presentation, "inbox"), eq(notificationsDb.presentation, "all")), or(isNull(notificationsDb.startsAt), lte(notificationsDb.startsAt, now)), or(isNull(notificationsDb.expiresAt), gt(notificationsDb.expiresAt, now)));
  const readJoin = and(eq(notificationReads.notificationId, notificationsDb.id), eq(notificationReads.userId, student.id));
  const [access, progress, orderRows, tickets, requests, noticeRows, sessions, accessEvents, courseCatalog, institutionCatalog] = await Promise.all([
    db.select().from(courseAccess).where(eq(courseAccess.userEmail, email)).orderBy(desc(courseAccess.updatedAt), desc(courseAccess.id)).limit(50).offset(offset("subscriptions")),
    db.select().from(lessonProgress).where(eq(lessonProgress.userEmail, email)).orderBy(desc(lessonProgress.updatedAt), desc(lessonProgress.id)).limit(50).offset(offset("progress")),
    db.select().from(orders).where(eq(orders.customerEmail, email)).orderBy(desc(orders.createdAt), desc(orders.id)).limit(50).offset(offset("orders")),
    db.select().from(supportTickets).where(eq(supportTickets.userEmail, email)).orderBy(desc(supportTickets.createdAt), desc(supportTickets.id)).limit(50).offset(offset("support")),
    db.select().from(courseRequests).where(eq(courseRequests.userId, student.id)).orderBy(desc(courseRequests.createdAt), desc(courseRequests.id)).limit(50).offset(offset("requests")),
    db.select({ notice: notificationsDb, readAt: notificationReads.readAt }).from(notificationsDb).leftJoin(notificationReads, readJoin).where(notificationVisibility).orderBy(desc(notificationsDb.createdAt), desc(notificationsDb.id)).limit(50).offset(offset("notifications")),
    db.select({ id: authSessions.id, deviceId: authSessions.deviceId, deviceLabel: authSessions.deviceLabel, platform: authSessions.platform, ipAddress: authSessions.ipAddress, lastSeenAt: authSessions.lastSeenAt, expiresAt: authSessions.expiresAt, revokedAt: authSessions.revokedAt, createdAt: authSessions.createdAt }).from(authSessions).where(eq(authSessions.userId, student.id)).orderBy(desc(authSessions.lastSeenAt), desc(authSessions.id)).limit(50).offset(offset("sessions")),
    db.select().from(courseAccessEvents).where(eq(courseAccessEvents.userEmail, email)).orderBy(desc(courseAccessEvents.createdAt), desc(courseAccessEvents.id)).limit(50).offset(offset("accessEvents")),
    getCoursesCatalog(true),
    getInstitutionsCatalog(true),
  ]);

  const notices = noticeRows.map((row) => ({ ...row.notice, readAt: row.readAt }));
  const orderNumbers = orderRows.map((order) => order.orderNumber);
  const ticketIds = tickets.map((ticket) => ticket.id);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [items, invoiceRows, replies, referralCode, attributionRows, rewardRows, ownedCoupons, aiEntitlementRows, aiOrderRows, aiUsageRows, waitlistRows, trackInterestRows, devices, refundRows, favoriteRows, cartRows, noteCount] = await Promise.all([
    orderNumbers.length ? db.select().from(orderItems).where(inArray(orderItems.orderNumber, orderNumbers)).orderBy(desc(orderItems.createdAt)) : Promise.resolve([]),
    orderNumbers.length ? db.select().from(invoices).where(inArray(invoices.orderNumber, orderNumbers)) : Promise.resolve([]),
    ticketIds.length ? db.select().from(supportReplies).where(inArray(supportReplies.ticketId, ticketIds)).orderBy(desc(supportReplies.createdAt)).limit(1_000) : Promise.resolve([]),
    db.select().from(referralCodes).where(eq(referralCodes.userId, student.id)).limit(1).then((rows) => rows[0] || null),
    db.select().from(referralAttributions).where(or(eq(referralAttributions.referrerUserId, student.id), eq(referralAttributions.referredUserId, student.id))).orderBy(desc(referralAttributions.createdAt), desc(referralAttributions.id)).limit(50).offset(offset("referrals")),
    db.select().from(userRewards).where(eq(userRewards.userId, student.id)).orderBy(desc(userRewards.issuedAt), desc(userRewards.id)).limit(50).offset(offset("rewards")),
    db.select().from(couponsDb).where(eq(couponsDb.ownerUserId, student.id)).orderBy(desc(couponsDb.createdAt), desc(couponsDb.id)).limit(50).offset(offset("coupons")),
    db.select().from(aiEntitlements).where(eq(aiEntitlements.userId, student.id)).orderBy(desc(aiEntitlements.createdAt), desc(aiEntitlements.id)).limit(50).offset(offset("ai")),
    db.select().from(aiSubscriptionOrders).where(eq(aiSubscriptionOrders.userId, student.id)).orderBy(desc(aiSubscriptionOrders.createdAt), desc(aiSubscriptionOrders.id)).limit(50).offset(offset("aiOrders")),
    db.select({ service: aiUsageEvents.service, status: aiUsageEvents.status, total: count() }).from(aiUsageEvents).where(and(eq(aiUsageEvents.userId, student.id), gte(aiUsageEvents.createdAt, thirtyDaysAgo))).groupBy(aiUsageEvents.service, aiUsageEvents.status),
    db.select().from(courseWaitlist).where(eq(courseWaitlist.userEmail, email)).orderBy(desc(courseWaitlist.createdAt), desc(courseWaitlist.id)).limit(50).offset(offset("waitlist")),
    db.select({ id: learningTrackInterests.id, status: learningTrackInterests.status, source: learningTrackInterests.source, lastNotifiedVersion: learningTrackInterests.lastNotifiedVersion, createdAt: learningTrackInterests.createdAt, trackTitle: learningTracks.title, trackSlug: learningTracks.slug, trackStatus: learningTracks.status }).from(learningTrackInterests).innerJoin(learningTracks, eq(learningTrackInterests.trackId, learningTracks.id)).where(eq(learningTrackInterests.userId, student.id)).orderBy(desc(learningTrackInterests.createdAt), desc(learningTrackInterests.id)).limit(50).offset(offset("tracks")),
    db.select({ id: pushDevices.id, deviceId: pushDevices.deviceId, platform: pushDevices.platform, deviceLabel: pushDevices.deviceLabel, status: pushDevices.status, lastSeenAt: pushDevices.lastSeenAt, createdAt: pushDevices.createdAt }).from(pushDevices).where(eq(pushDevices.userId, student.id)).orderBy(desc(pushDevices.lastSeenAt), desc(pushDevices.id)).limit(50).offset(offset("pushDevices")),
    db.select({ refund: refundRequests }).from(refundRequests).innerJoin(orders, eq(refundRequests.orderNumber, orders.orderNumber)).where(eq(orders.customerEmail, email)).orderBy(desc(refundRequests.createdAt), desc(refundRequests.id)).limit(50).offset(offset("refunds")).then((rows) => rows.map((row) => row.refund)),
    db.select().from(favorites).where(eq(favorites.userEmail, email)).orderBy(desc(favorites.createdAt), desc(favorites.id)).limit(50).offset(offset("favorites")),
    db.select().from(cartItems).where(eq(cartItems.userEmail, email)).orderBy(desc(cartItems.createdAt), desc(cartItems.id)).limit(50).offset(offset("cart")),
    db.select({ total: count() }).from(lessonNotes).where(eq(lessonNotes.userEmail, email)).then((rows) => Number(rows[0]?.total || 0)),
  ]);
  const referredUserIds = [...new Set(attributionRows.flatMap((row) => [row.referrerUserId, row.referredUserId]).filter((id) => id !== student.id))];
  const relatedUsers = referredUserIds.length ? await db.select({ id: users.id, email: users.email, fullName: users.fullName }).from(users).where(inArray(users.id, referredUserIds)) : [];
  const relatedById = new Map(relatedUsers.map((row) => [row.id, row]));
  const couponById = new Map(ownedCoupons.map((coupon) => [coupon.id, coupon]));

  const [aggregate, unreadRows, ...counterRows] = await Promise.all([
    db.execute(sql`SELECT
      (SELECT count(*) FROM course_access WHERE user_email = ${email} AND ${activeAccessCondition(now)}) AS active_subscriptions,
      (SELECT count(*) FROM lesson_progress WHERE user_email = ${email} AND completed = true) AS completed_lessons,
      (SELECT coalesce(sum(greatest(watched_seconds, 0)), 0) FROM lesson_progress WHERE user_email = ${email}) AS watched_seconds,
      (SELECT count(*) FROM orders WHERE customer_email = ${email} AND status IN ('paid', 'partially_refunded')) AS paid_orders,
      (SELECT coalesce(sum(total), 0) FROM orders WHERE customer_email = ${email} AND status IN ('paid', 'partially_refunded')) AS paid_value,
      (SELECT count(*) FROM support_tickets WHERE user_email = ${email} AND status NOT IN ('closed', 'resolved')) AS open_tickets,
      (SELECT count(*) FROM referral_attributions WHERE referrer_user_id = ${student.id} AND status = 'qualified') AS qualified_referrals,
      (SELECT count(*) FROM user_rewards WHERE user_id = ${student.id} AND status = 'active' AND (expires_at IS NULL OR expires_at > ${now})) AS active_rewards,
      (SELECT count(*) FROM ai_entitlements WHERE user_id = ${student.id} AND status = 'active' AND starts_at <= ${now} AND (expires_at IS NULL OR expires_at > ${now})) AS ai_active,
      (SELECT count(*) FROM push_devices WHERE user_id = ${student.id} AND status = 'active') AS push_devices`),
    db.select({ total: count() }).from(notificationsDb).leftJoin(notificationReads, readJoin).where(and(notificationVisibility, isNull(notificationReads.readAt))),
    db.select({ total: count() }).from(courseAccess).where(eq(courseAccess.userEmail, email)),
    db.select({ total: count() }).from(lessonProgress).where(eq(lessonProgress.userEmail, email)),
    db.select({ total: count() }).from(orders).where(eq(orders.customerEmail, email)),
    db.select({ total: count() }).from(supportTickets).where(eq(supportTickets.userEmail, email)),
    db.select({ total: count() }).from(courseRequests).where(eq(courseRequests.userId, student.id)),
    db.select({ total: count() }).from(notificationsDb).where(notificationVisibility),
    db.select({ total: count() }).from(authSessions).where(eq(authSessions.userId, student.id)),
    db.select({ total: count() }).from(courseAccessEvents).where(eq(courseAccessEvents.userEmail, email)),
    db.select({ total: count() }).from(referralAttributions).where(or(eq(referralAttributions.referrerUserId, student.id), eq(referralAttributions.referredUserId, student.id))),
    db.select({ total: count() }).from(userRewards).where(eq(userRewards.userId, student.id)),
    db.select({ total: count() }).from(couponsDb).where(eq(couponsDb.ownerUserId, student.id)),
    db.select({ total: count() }).from(aiEntitlements).where(eq(aiEntitlements.userId, student.id)),
    db.select({ total: count() }).from(aiSubscriptionOrders).where(eq(aiSubscriptionOrders.userId, student.id)),
    db.select({ total: count() }).from(courseWaitlist).where(eq(courseWaitlist.userEmail, email)),
    db.select({ total: count() }).from(learningTrackInterests).where(eq(learningTrackInterests.userId, student.id)),
    db.select({ total: count() }).from(pushDevices).where(eq(pushDevices.userId, student.id)),
    db.select({ total: count() }).from(favorites).where(eq(favorites.userEmail, email)),
    db.select({ total: count() }).from(cartItems).where(eq(cartItems.userEmail, email)),
  ]);
  const summary = (aggregate.rows[0] || {}) as Record<string, unknown>;
  const countKeys = ["subscriptions", "progress", "orders", "support", "requests", "notifications", "sessions", "accessEvents", "referrals", "rewards", "coupons", "ai", "aiOrders", "waitlist", "tracks", "pushDevices", "favorites", "cart"];
  const pagination = Object.fromEntries(countKeys.map((key, index) => [key, { ...pageFor(key), total: Number(counterRows[index][0]?.total || 0) }]));
  const effectiveAccess = await effectiveAccessRows(access, now);
  return Response.json({
    ok: true,
    student,
    generatedAt: now,
    pagination,
    summary: {
      activeSubscriptions: Number(summary.active_subscriptions || 0),
      completedLessons: Number(summary.completed_lessons || 0),
      watchedSeconds: Number(summary.watched_seconds || 0),
      paidOrders: Number(summary.paid_orders || 0),
      paidValue: Number(summary.paid_value || 0),
      openTickets: Number(summary.open_tickets || 0),
      unreadNotifications: Number(unreadRows[0]?.total || 0),
      qualifiedReferrals: Number(summary.qualified_referrals || 0),
      activeRewards: Number(summary.active_rewards || 0),
      aiActive: Number(summary.ai_active || 0) > 0 || Number(summary.active_subscriptions || 0) > 0,
      pushDevices: Number(summary.push_devices || 0),
      lessonNotes: noteCount,
    },
    catalog: {
      institution: institutionCatalog.find((row) => row.slug === student.universitySlug) || null,
      institutions: institutionCatalog.map((row) => ({ slug: row.slug, name: row.name })),
      courses: courseCatalog
        .map((row) => ({ slug: row.slug, title: row.title, university: row.university, universitySlug: row.universitySlug, specialty: row.specialty })),
    },
    subscriptions: effectiveAccess,
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
  }, { headers: { "cache-control": "no-store" } });
}
