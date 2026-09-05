import "server-only";

import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  couponsDb,
  notificationsDb,
  orders,
  referralAttributions,
  referralCodes,
  referralProgramSettings,
  referralTiers,
  userRewards,
  users,
} from "@/db/schema";
import { clientIp } from "@/lib/auth";

type Database = ReturnType<typeof getDb>;
export type ReferralTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type ReferralRewardType = "coupon_percent" | "coupon_fixed" | "ai_subscription";

const DEFAULT_PROGRAM = {
  enabled: true,
  qualificationEvent: "first_paid_order",
  title: "شارك مراس واكسب هداياك",
  description: "شارك رابطك الخاص، وكل تسجيل مؤهل يقربك من مكافأة جديدة.",
  terms: "تُحتسب الحسابات الجديدة الحقيقية فقط، وتخضع الحالات المتكررة أو غير الطبيعية للمراجعة.",
  maxQualifiedPerIpPerDay: 3,
  defaultCouponValidityDays: 90,
};

export function normalizeReferralCode(value: unknown) {
  return typeof value === "string"
    ? value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32)
    : "";
}

export function referralCodeFromRegistration(payload: Record<string, unknown>, request: Request) {
  const supplied = normalizeReferralCode(payload.referralCode);
  if (supplied) return supplied;
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === "meras_referral") {
      try { return normalizeReferralCode(decodeURIComponent(value.join("="))); } catch { return ""; }
    }
  }
  return "";
}

function referralSalt() {
  const configured = process.env.REFERRAL_HASH_SALT?.trim() || process.env.SESSION_SECRET?.trim() || "";
  if (configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("REFERRAL_HASH_SALT must be configured with at least 32 characters");
  return "meras-local-referral-salt";
}

function privateHash(value: string) {
  return value ? createHmac("sha256", referralSalt()).update(value, "utf8").digest("hex") : null;
}

function deviceSignal(request: Request) {
  const raw = request.headers.get("x-meras-device-id") || request.headers.get("x-device-id") || "";
  const clean = raw.trim().replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 160);
  return clean ? privateHash(clean) : null;
}

function sourceIpHash(request: Request) {
  const trustedHeader = process.env.REFERRAL_TRUSTED_IP_HEADER?.trim().toLowerCase();
  const raw = trustedHeader === "cf-connecting-ip"
    ? request.headers.get("cf-connecting-ip")
    : trustedHeader === "x-forwarded-for"
      ? request.headers.get("x-forwarded-for")?.split(",")[0]
      : process.env.NODE_ENV !== "production"
        ? clientIp(request)
        : null;
  const ip = (raw || "").trim().slice(0, 80);
  return ip && ip !== "unknown" ? privateHash(ip) : null;
}

function rewardExpiry(now: string, days: number | null | undefined) {
  if (!days || days <= 0) return null;
  return new Date(Date.parse(now) + days * 86_400_000).toISOString();
}

function newReferralCode(userId: number) {
  return `MRS-${userId.toString(36).toUpperCase()}-${randomBytes(6).toString("hex").toUpperCase()}`;
}

function newCouponCode(userId: number, tierId?: number | null) {
  const tier = tierId ? `T${tierId.toString(36).toUpperCase()}` : "GIFT";
  return `MR-${userId.toString(36).toUpperCase()}-${tier}-${randomBytes(5).toString("hex").toUpperCase()}`.slice(0, 40);
}

async function programForTransaction(tx: ReferralTransaction) {
  const [program] = await tx.select().from(referralProgramSettings).where(eq(referralProgramSettings.programKey, "default")).limit(1);
  return program || DEFAULT_PROGRAM;
}

export async function provisionReferralCodeTx(tx: ReferralTransaction, userId: number, now = new Date().toISOString()) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId + 4_000_000})`);
  const [existing] = await tx.select().from(referralCodes).where(eq(referralCodes.userId, userId)).limit(1);
  if (existing) return existing;
  const [created] = await tx.insert(referralCodes).values({ userId, code: newReferralCode(userId), status: "active", createdAt: now, updatedAt: now }).onConflictDoNothing({ target: referralCodes.userId }).returning();
  if (created) return created;
  const [reloaded] = await tx.select().from(referralCodes).where(eq(referralCodes.userId, userId)).limit(1);
  return reloaded || null;
}

export async function ensureReferralCode(userId: number) {
  return getDb().transaction((tx) => provisionReferralCodeTx(tx, userId));
}

function rewardTitle(type: ReferralRewardType, value: number) {
  if (type === "coupon_percent") return `كوبون خصم ${value}%`;
  if (type === "coupon_fixed") return `كوبون خصم ${value} ر.س`;
  return `اشتراك أدوات مراس لمدة ${Math.max(1, Math.round(value))} شهر`;
}

async function issueTierRewardsTx(tx: ReferralTransaction, userId: number, now: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId + 5_000_000})`);
  const [{ qualifiedCount }] = await tx.select({ qualifiedCount: sql<number>`count(*)::int` }).from(referralAttributions).where(and(eq(referralAttributions.referrerUserId, userId), eq(referralAttributions.status, "qualified")));
  const tiers = await tx.select().from(referralTiers).where(eq(referralTiers.enabled, true)).orderBy(asc(referralTiers.sortOrder), asc(referralTiers.requiredReferrals));
  const program = await programForTransaction(tx);
  const issued: Array<typeof userRewards.$inferSelect> = [];

  for (const tier of tiers) {
    if (tier.requiredReferrals > Number(qualifiedCount || 0)) continue;
    const sourceKey = `referral-tier:${userId}:${tier.id}`;
    const [existing] = await tx.select().from(userRewards).where(eq(userRewards.sourceKey, sourceKey)).limit(1);
    if (existing) continue;
    const rewardType = tier.rewardType as ReferralRewardType;
    if (!(["coupon_percent", "coupon_fixed", "ai_subscription"] as string[]).includes(rewardType)) continue;

    const validityDays = tier.couponValidityDays || program.defaultCouponValidityDays || DEFAULT_PROGRAM.defaultCouponValidityDays;
    const expiresAt = rewardType === "ai_subscription"
      ? rewardExpiry(now, tier.rewardDurationDays || Math.max(1, Math.round(tier.rewardValue)) * 30)
      : rewardExpiry(now, validityDays);
    let couponId: number | null = null;
    if (rewardType !== "ai_subscription") {
      const [coupon] = await tx.insert(couponsDb).values({
        code: newCouponCode(userId, tier.id),
        type: rewardType === "coupon_percent" ? "percent" : "fixed",
        value: tier.rewardValue,
        courseSlug: tier.courseSlug,
        ownerUserId: userId,
        sourceType: "referral_tier",
        sourceKey,
        title: tier.name,
        usageLimit: 1,
        usedCount: 0,
        startsAt: now,
        expiresAt,
        status: "active",
        createdAt: now,
        updatedAt: now,
      }).returning({ id: couponsDb.id });
      couponId = coupon.id;
    }
    const benefitPayloadJson = rewardType === "ai_subscription"
      ? JSON.stringify({ months: Math.max(1, Math.round(tier.rewardValue)), durationDays: tier.rewardDurationDays || null, source: "referral" })
      : JSON.stringify({ couponValidityDays: validityDays, courseSlug: tier.courseSlug || null });
    const [reward] = await tx.insert(userRewards).values({
      userId,
      referralTierId: tier.id,
      couponId,
      sourceType: "referral_tier",
      sourceKey,
      rewardType,
      rewardValue: tier.rewardValue,
      benefitPayloadJson,
      status: "active",
      expiresAt,
      issuedAt: now,
      updatedAt: now,
    }).returning();
    issued.push(reward);
    const title = "مبروك! وصلت هديتك من مراس";
    const body = `اكتملت ${tier.requiredReferrals} إحالات مؤهلة وحصلت على ${rewardTitle(rewardType, tier.rewardValue)}. الهدية مرتبطة بحسابك ولا يمكن استخدامها من حساب آخر.`;
    await tx.insert(notificationsDb).values({
      userEmail: (await tx.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1))[0]?.email || null,
      audience: "student",
      title,
      body,
      actionUrl: `/referrals?reward=${reward.id}`,
      actionLabel: "عرض الهدية",
      presentation: "inbox",
      template: "success",
      dedupeKey: `referral-reward:${reward.id}`,
      pushEnabled: true,
      pushStatus: "pending",
      createdAt: now,
    }).onConflictDoNothing({ target: notificationsDb.dedupeKey });
  }
  return issued;
}

export async function reconcileReferralRewardsTx(tx: ReferralTransaction, userId: number, now = new Date().toISOString()) {
  const issued = await issueTierRewardsTx(tx, userId, now);
  const [{ qualifiedCount }] = await tx.select({ qualifiedCount: sql<number>`count(*)::int` }).from(referralAttributions).where(and(
    eq(referralAttributions.referrerUserId, userId),
    eq(referralAttributions.status, "qualified"),
  ));
  const qualified = Number(qualifiedCount || 0);
  const [tiers, rewards] = await Promise.all([
    tx.select({ id: referralTiers.id, requiredReferrals: referralTiers.requiredReferrals }).from(referralTiers),
    tx.select().from(userRewards).where(and(
      eq(userRewards.userId, userId),
      eq(userRewards.sourceType, "referral_tier"),
      inArray(userRewards.status, ["active", "disabled"]),
    )),
  ]);
  const tierById = new Map(tiers.map((tier) => [tier.id, tier]));
  for (const reward of rewards) {
    const tier = reward.referralTierId ? tierById.get(reward.referralTierId) : null;
    if (!tier) continue;
    const expired = Boolean(reward.expiresAt && Date.parse(reward.expiresAt) <= Date.parse(now));
    const earned = qualified >= tier.requiredReferrals;
    const nextStatus = expired ? "expired" : earned ? "active" : "disabled";
    if (reward.status === nextStatus) continue;
    await tx.update(userRewards).set({ status: nextStatus, updatedAt: now }).where(eq(userRewards.id, reward.id));
    if (reward.couponId) {
      await tx.update(couponsDb).set({ status: nextStatus === "active" ? "active" : "disabled", updatedAt: now }).where(and(
        eq(couponsDb.id, reward.couponId),
        eq(couponsDb.usedCount, 0),
      ));
    }
  }
  return issued;
}

export async function recordReferralRegistrationTx(tx: ReferralTransaction, input: {
  referralCode: unknown;
  referredUserId: number;
  request: Request;
  now?: string;
}) {
  const code = normalizeReferralCode(input.referralCode);
  if (!code) return null;
  const now = input.now || new Date().toISOString();
  const [referral] = await tx.select().from(referralCodes).where(eq(referralCodes.code, code)).limit(1);
  if (!referral || referral.userId === input.referredUserId) return null;
  const [alreadyAttributed] = await tx.select().from(referralAttributions).where(eq(referralAttributions.referredUserId, input.referredUserId)).limit(1);
  if (alreadyAttributed) return alreadyAttributed;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${referral.userId + 6_000_000})`);
  const program = await programForTransaction(tx);
  const ipHash = sourceIpHash(input.request);
  const deviceHash = deviceSignal(input.request);
  let status: "pending" | "qualified" | "rejected" = "pending";
  let reviewReason: string | null = null;

  if (!program.enabled) reviewReason = "program_disabled";
  else if (referral.status !== "active") {
    status = "rejected";
    reviewReason = "referral_code_inactive";
  } else if (deviceHash) {
    const [sameDevice] = await tx.select({ id: referralAttributions.id }).from(referralAttributions).where(and(
      eq(referralAttributions.deviceHash, deviceHash),
      inArray(referralAttributions.status, ["pending", "qualified"]),
    )).limit(1);
    if (sameDevice) {
      reviewReason = "duplicate_device_review";
    }
  }

  if (!reviewReason && ipHash) {
    const [{ dailyCount }] = await tx.select({ dailyCount: sql<number>`count(*)::int` }).from(referralAttributions).where(and(
      eq(referralAttributions.ipHash, ipHash),
      inArray(referralAttributions.status, ["pending", "qualified"]),
      sql`${referralAttributions.createdAt}::timestamptz >= NOW() - INTERVAL '24 hours'`,
    ));
    if (Number(dailyCount || 0) >= Math.max(1, program.maxQualifiedPerIpPerDay)) reviewReason = "ip_velocity_review";
  }

  if (!reviewReason) status = program.qualificationEvent === "registration" ? "qualified" : "pending";
  const [created] = await tx.insert(referralAttributions).values({
    referralCodeId: referral.id,
    referrerUserId: referral.userId,
    referredUserId: input.referredUserId,
    status,
    qualificationEvent: program.qualificationEvent,
    ipHash,
    deviceHash,
    reviewReason,
    qualifiedAt: status === "qualified" ? now : null,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing({ target: referralAttributions.referredUserId }).returning();
  if (!created) return null;

  const [referrer] = await tx.select({ email: users.email }).from(users).where(eq(users.id, referral.userId)).limit(1);
  if (status === "qualified" && referrer) {
    await tx.insert(notificationsDb).values({
      userEmail: referrer.email,
      audience: "student",
      title: "إحالة جديدة مؤهلة",
      body: "انضم طالب جديد من رابطك الخاص، وتم تحديث تقدمك نحو الهدية التالية.",
      actionUrl: "/referrals",
      actionLabel: "عرض تقدمي",
      template: "success",
      dedupeKey: `referral-qualified:${created.id}`,
      pushEnabled: true,
      pushStatus: "pending",
      createdAt: now,
    }).onConflictDoNothing({ target: notificationsDb.dedupeKey });
    await reconcileReferralRewardsTx(tx, referral.userId, now);
  }
  return created;
}

export async function qualifyReferralForPaidOrderTx(tx: ReferralTransaction, referredEmail: string, now = new Date().toISOString()) {
  const [referred] = await tx.select({ id: users.id }).from(users).where(eq(users.email, referredEmail.toLowerCase())).limit(1);
  if (!referred) return null;
  const [candidate] = await tx.select().from(referralAttributions).where(and(
    eq(referralAttributions.referredUserId, referred.id),
    eq(referralAttributions.status, "pending"),
    eq(referralAttributions.qualificationEvent, "first_paid_order"),
  )).limit(1);
  if (!candidate) return null;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${candidate.referrerUserId + 6_000_000})`);
  const [attribution] = await tx.select().from(referralAttributions).where(and(
    eq(referralAttributions.id, candidate.id),
    eq(referralAttributions.status, "pending"),
  )).limit(1);
  if (!attribution || attribution.reviewReason) return null;
  const [updated] = await tx.update(referralAttributions).set({ status: "qualified", qualifiedAt: now, updatedAt: now }).where(and(eq(referralAttributions.id, attribution.id), eq(referralAttributions.status, "pending"))).returning();
  if (!updated) return null;
  const [referrer] = await tx.select({ email: users.email }).from(users).where(eq(users.id, updated.referrerUserId)).limit(1);
  if (referrer) await tx.insert(notificationsDb).values({
    userEmail: referrer.email,
    audience: "student",
    title: "اكتملت إحالة جديدة",
    body: "أتم الطالب المُحال أول اشتراك مدفوع، فأصبحت الإحالة مؤهلة وتم تحديث تقدمك.",
    actionUrl: "/referrals",
    actionLabel: "عرض تقدمي",
    template: "success",
    dedupeKey: `referral-qualified:${updated.id}:${updated.qualifiedAt}`,
    pushEnabled: true,
    pushStatus: "pending",
    createdAt: now,
  }).onConflictDoNothing({ target: notificationsDb.dedupeKey });
  await reconcileReferralRewardsTx(tx, updated.referrerUserId, now);
  return updated;
}

export async function reconcileReferralQualificationAfterRefundTx(tx: ReferralTransaction, referredEmail: string, now = new Date().toISOString()) {
  const email = referredEmail.trim().toLowerCase();
  const [referred] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!referred) return null;
  const [candidate] = await tx.select().from(referralAttributions).where(and(
    eq(referralAttributions.referredUserId, referred.id),
    eq(referralAttributions.status, "qualified"),
    eq(referralAttributions.qualificationEvent, "first_paid_order"),
  )).limit(1);
  if (!candidate) return null;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${candidate.referrerUserId + 6_000_000})`);
  const [attribution] = await tx.select().from(referralAttributions).where(and(
    eq(referralAttributions.id, candidate.id),
    eq(referralAttributions.status, "qualified"),
  )).limit(1);
  if (!attribution) return null;
  const [{ remainingPaidOrders }] = await tx.select({ remainingPaidOrders: sql<number>`count(*)::int` }).from(orders).where(and(
    eq(orders.customerEmail, email),
    inArray(orders.status, ["paid", "partially_refunded", "payment_review"]),
  ));
  if (Number(remainingPaidOrders || 0) > 0) return null;
  const [updated] = await tx.update(referralAttributions).set({
    status: "pending",
    reviewReason: null,
    qualifiedAt: null,
    updatedAt: now,
  }).where(and(
    eq(referralAttributions.id, attribution.id),
    eq(referralAttributions.status, "qualified"),
  )).returning();
  if (!updated) return null;
  await reconcileReferralRewardsTx(tx, updated.referrerUserId, now);
  const [referrer] = await tx.select({ email: users.email }).from(users).where(eq(users.id, updated.referrerUserId)).limit(1);
  if (referrer) await tx.insert(notificationsDb).values({
    userEmail: referrer.email,
    audience: "student",
    title: "تم تحديث حالة إحالة",
    body: "تغيّرت حالة اشتراك أحد الطلاب المُحالين، فأعدنا احتساب تقدمك والهدايا غير المستخدمة تلقائيًا.",
    actionUrl: "/referrals",
    actionLabel: "عرض التفاصيل",
    template: "general",
    dedupeKey: `referral-downgraded:${updated.id}:${attribution.qualifiedAt || now}`,
    pushEnabled: true,
    pushStatus: "pending",
    createdAt: now,
  }).onConflictDoNothing({ target: notificationsDb.dedupeKey });
  return updated;
}

export async function grantAdminReward(input: {
  userId: number;
  rewardType: ReferralRewardType;
  rewardValue: number;
  courseSlug?: string | null;
  validityDays?: number | null;
  grantedBy: string;
  title?: string;
  note?: string;
}) {
  const now = new Date().toISOString();
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${input.userId + 7_000_000})`);
    const sourceKey = `admin-gift:${randomUUID()}`;
    const days = input.validityDays || (input.rewardType === "ai_subscription" ? Math.max(1, Math.round(input.rewardValue)) * 30 : 90);
    const expiresAt = rewardExpiry(now, days);
    let couponId: number | null = null;
    if (input.rewardType !== "ai_subscription") {
      const [coupon] = await tx.insert(couponsDb).values({
        code: newCouponCode(input.userId),
        type: input.rewardType === "coupon_percent" ? "percent" : "fixed",
        value: input.rewardValue,
        courseSlug: input.courseSlug || null,
        ownerUserId: input.userId,
        sourceType: "admin_gift",
        sourceKey,
        title: input.title || "هدية خاصة من مراس",
        assignedBy: input.grantedBy,
        usageLimit: 1,
        usedCount: 0,
        startsAt: now,
        expiresAt,
        status: "active",
        createdAt: now,
        updatedAt: now,
      }).returning({ id: couponsDb.id });
      couponId = coupon.id;
    }
    const [reward] = await tx.insert(userRewards).values({
      userId: input.userId,
      couponId,
      sourceType: "admin_gift",
      sourceKey,
      rewardType: input.rewardType,
      rewardValue: input.rewardValue,
      benefitPayloadJson: input.rewardType === "ai_subscription"
        ? JSON.stringify({ months: Math.max(1, Math.round(input.rewardValue)), durationDays: days, source: "admin_gift" })
        : JSON.stringify({ courseSlug: input.courseSlug || null, validityDays: days }),
      status: "active",
      grantedBy: input.grantedBy,
      note: input.note || null,
      issuedAt: now,
      expiresAt,
      updatedAt: now,
    }).returning();
    const [target] = await tx.select({ email: users.email }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (target) await tx.insert(notificationsDb).values({
      userEmail: target.email,
      audience: "student",
      title: "وصلتك هدية خاصة من مراس",
      body: `أضيفت إلى حسابك ${rewardTitle(input.rewardType, input.rewardValue)}. افتح صفحة الإحالات والهدايا للاطلاع عليها واستخدامها.`,
      actionUrl: `/referrals?reward=${reward.id}`,
      actionLabel: "عرض الهدية",
      template: "gift",
      dedupeKey: `admin-gift:${reward.id}`,
      pushEnabled: true,
      pushStatus: "pending",
      createdAt: now,
    }).onConflictDoNothing({ target: notificationsDb.dedupeKey });
    return reward;
  });
}

export async function referralProgram() {
  const [program] = await getDb().select().from(referralProgramSettings).where(eq(referralProgramSettings.programKey, "default")).limit(1);
  return program || DEFAULT_PROGRAM;
}

export function publicRewardLabel(type: string, value: number) {
  return rewardTitle(type as ReferralRewardType, value);
}
