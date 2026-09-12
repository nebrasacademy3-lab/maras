import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { cartItems, courseAccess, courseWaitlist, learningTrackInterests, learningTracks, notificationsDb, orders, users } from "@/db/schema";
import { getCoursesCatalog } from "@/lib/catalog-store";
import { isInternalDestination } from "@/lib/learning-tracks";

type LifecycleResult = { cartReminders: number; paymentReminders: number; expiryReminders: number; launchNotifications: number };

function fingerprint(values: string[]) {
  return createHash("sha256").update([...values].sort().join("|")).digest("hex").slice(0, 16);
}

async function enqueue(values: typeof notificationsDb.$inferInsert) {
  const [created] = await getDb().insert(notificationsDb).values(values).onConflictDoNothing({ target: notificationsDb.dedupeKey }).returning({ id: notificationsDb.id });
  return Boolean(created);
}

export async function runLifecycleAutomations(now = new Date()): Promise<LifecycleResult> {
  const db = getDb();
  const nowIso = now.toISOString();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60_000).toISOString();
  const openStatuses = ["pending", "initiated", "in_progress", "authorized", "verification_pending", "payment_review"];

  const [staleCartRows, pendingOrders, expiringAccess, waitlistRows, courses, trackInterestRows] = await Promise.all([
    db.select().from(cartItems).where(lte(cartItems.createdAt, twoHoursAgo)).orderBy(desc(cartItems.createdAt)).limit(2_000),
    db.select().from(orders).where(and(inArray(orders.status, openStatuses), lte(orders.createdAt, twoHoursAgo))).orderBy(desc(orders.createdAt)).limit(500),
    db.select().from(courseAccess).where(and(isNull(courseAccess.revokedAt), sql`${courseAccess.expiresAt} IS NOT NULL`, lte(courseAccess.expiresAt, new Date(now.getTime() + 14 * 86_400_000).toISOString()))).limit(2_000),
    db.select().from(courseWaitlist).where(eq(courseWaitlist.status, "active")).orderBy(desc(courseWaitlist.createdAt)).limit(2_000),
    getCoursesCatalog(),
    db.select({
      interestId: learningTrackInterests.id,
      lastNotifiedVersion: learningTrackInterests.lastNotifiedVersion,
      userEmail: users.email,
      trackTitle: learningTracks.title,
      trackStatus: learningTracks.status,
      destination: learningTracks.destination,
      releaseVersion: learningTracks.releaseVersion,
    }).from(learningTrackInterests)
      .innerJoin(learningTracks, eq(learningTrackInterests.trackId, learningTracks.id))
      .innerJoin(users, eq(learningTrackInterests.userId, users.id))
      .where(and(
        eq(learningTrackInterests.status, "active"),
        inArray(learningTracks.status, ["enrollment_open", "available"]),
        sql`${learningTrackInterests.lastNotifiedVersion} < ${learningTracks.releaseVersion}`,
      ))
      .orderBy(learningTrackInterests.id)
      .limit(2_000),
  ]);

  let cartReminders = 0;
  let paymentReminders = 0;
  let expiryReminders = 0;
  let launchNotifications = 0;
  const carts = new Map<string, typeof staleCartRows>();
  for (const row of staleCartRows) carts.set(row.userEmail, [...(carts.get(row.userEmail) || []), row]);

  for (const [userEmail, rows] of carts) {
    const newest = Math.max(...rows.map((row) => Date.parse(row.createdAt)).filter(Number.isFinite));
    const ageHours = (now.getTime() - newest) / 3_600_000;
    const stage = ageHours >= 24 ? "24h" : "2h";
    const slugs = rows.map((row) => row.courseSlug);
    if (await enqueue({
      userEmail,
      audience: "student",
      title: stage === "24h" ? "موادك ما زالت محفوظة" : "هل تريد إكمال اشتراكك؟",
      body: stage === "24h" ? `لديك ${slugs.length} مواد في السلة. راجعها قبل انتهاء العروض المتاحة.` : "حفظنا موادك في السلة ويمكنك متابعة الدفع من حيث توقفت.",
      actionUrl: "/cart",
      actionLabel: "متابعة السلة",
      template: "general",
      dedupeKey: `lifecycle:cart:${userEmail}:${fingerprint(slugs)}:${stage}`,
      pushEnabled: true,
      pushStatus: "pending",
      startsAt: nowIso,
      createdAt: nowIso,
    })) cartReminders += 1;
  }

  for (const order of pendingOrders) {
    const ageHours = (now.getTime() - Date.parse(order.createdAt)) / 3_600_000;
    const stage = ageHours >= 24 ? "24h" : "2h";
    const pendingVerification = ["verification_pending", "payment_review"].includes(order.status);
    if (await enqueue({
      userEmail: order.customerEmail,
      audience: "student",
      title: pendingVerification ? "نتابع عملية الدفع" : "يمكنك استكمال الدفع بأمان",
      body: pendingVerification ? `الطلب ${order.orderNumber} قيد التحقق، ولا تحتاج إلى إنشاء عملية دفع أخرى.` : `طلبك ${order.orderNumber} لم يكتمل بعد. افتح الطلب لمتابعة الحالة أو استكمال المحاولة الحالية.`,
      actionUrl: "/dashboard?view=orders",
      actionLabel: "عرض الطلب",
      template: "general",
      dedupeKey: `lifecycle:order:${order.orderNumber}:${stage}:${order.status}`,
      pushEnabled: true,
      pushStatus: "pending",
      startsAt: nowIso,
      createdAt: nowIso,
    })) paymentReminders += 1;
  }

  for (const access of expiringAccess) {
    if (!access.expiresAt) continue;
    const remainingDays = Math.ceil((Date.parse(access.expiresAt) - now.getTime()) / 86_400_000);
    const stage = remainingDays <= 0 ? "expired" : remainingDays <= 3 ? "3d" : "14d";
    if (await enqueue({
      userEmail: access.userEmail,
      audience: "student",
      title: stage === "expired" ? "انتهت صلاحية المادة" : "صلاحية المادة تقترب من الانتهاء",
      body: stage === "expired" ? "يمكنك تجديد المادة مع الاحتفاظ بتقدمك وملاحظاتك." : `تبقى ${Math.max(1, remainingDays)} أيام على صلاحية المادة. يمكنك التجديد من صفحة اشتراكاتك.`,
      actionUrl: "/dashboard?view=courses",
      actionLabel: "عرض الاشتراكات",
      template: stage === "expired" ? "urgent" : "general",
      dedupeKey: `lifecycle:access:${access.id}:${stage}:${access.expiresAt}`,
      pushEnabled: true,
      pushStatus: "pending",
      startsAt: nowIso,
      createdAt: nowIso,
    })) expiryReminders += 1;
  }

  const launched = new Map(courses.filter((course) => course.availableForPurchase).map((course) => [course.slug, course]));
  for (const row of waitlistRows) {
    const course = launched.get(row.courseSlug);
    if (!course) continue;
    await db.transaction(async (tx) => {
      const [notice] = await tx.insert(notificationsDb).values({
        userEmail: row.userEmail,
        audience: "student",
        title: "المادة التي تنتظرها أصبحت متاحة",
        body: `فُتح الاشتراك في ${course.title} ونُشر أول درس جاهز للمشاهدة.`,
        actionUrl: `/courses/${course.slug}`,
        actionLabel: "عرض المادة",
        template: "success",
        dedupeKey: `waitlist:${row.id}:launched`,
        pushEnabled: true,
        pushStatus: "pending",
        startsAt: nowIso,
        createdAt: nowIso,
      }).onConflictDoNothing({ target: notificationsDb.dedupeKey }).returning({ id: notificationsDb.id });
      await tx.update(courseWaitlist).set({ status: "notified", notifiedAt: nowIso, updatedAt: nowIso }).where(eq(courseWaitlist.id, row.id));
      if (notice) launchNotifications += 1;
    });
  }

  for (const row of trackInterestRows) {
    await db.transaction(async (tx) => {
      const [claimed] = await tx.update(learningTrackInterests)
        .set({ lastNotifiedVersion: row.releaseVersion, updatedAt: nowIso })
        .where(and(
          eq(learningTrackInterests.id, row.interestId),
          eq(learningTrackInterests.status, "active"),
          lt(learningTrackInterests.lastNotifiedVersion, row.releaseVersion),
        ))
        .returning({ id: learningTrackInterests.id });
      if (!claimed) return;
      const registrationOpen = row.trackStatus === "enrollment_open";
      const [notice] = await tx.insert(notificationsDb).values({
        userEmail: row.userEmail,
        audience: "student",
        title: registrationOpen ? "فُتح التسجيل في مسار تنتظره" : "المسار الذي تنتظره أصبح متاحًا",
        body: registrationOpen
          ? `يمكنك الآن التسجيل في «${row.trackTitle}» من داخل مراس.`
          : `أصبح «${row.trackTitle}» جاهزًا للبدء.`,
        actionUrl: isInternalDestination(row.destination) && row.destination ? row.destination : "/",
        actionLabel: registrationOpen ? "عرض التسجيل" : "فتح المسار",
        template: "learning_track_launch",
        dedupeKey: `learning-track:${row.interestId}:v${row.releaseVersion}`,
        pushEnabled: true,
        pushStatus: "pending",
        startsAt: nowIso,
        createdAt: nowIso,
      }).onConflictDoNothing({ target: notificationsDb.dedupeKey }).returning({ id: notificationsDb.id });
      if (notice) launchNotifications += 1;
    });
  }

  return { cartReminders, paymentReminders, expiryReminders, launchNotifications };
}
