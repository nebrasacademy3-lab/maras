import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, couponUses, couponsDb, notificationsDb, referralAttributions, referralCodes, referralProgramSettings, referralTiers, userRewards, users } from "@/db/schema";
import { cleanText, isAdminRequest, isUniqueConstraintError, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { AdminMfaError, requireAdminStepUp } from "@/lib/admin-mfa";
import { ADMIN_PERMISSIONS, hasPermission } from "@/lib/permissions";
import { grantAdminReward, publicRewardLabel, reconcileReferralRewardsTx, type ReferralRewardType } from "@/lib/referrals";

export const dynamic = "force-dynamic";

class ReferralInputError extends Error {}

async function authorize(request: Request, mutation: boolean) {
  const user = await getSessionUser(request);
  const machine = !user && isAdminRequest(request);
  if (mutation && machine) return { response: jsonError("الإجراءات المالية تتطلب جلسة مدير وتحققًا إضافيًا", 403), user: null, actor: "", machine: true };
  if (!machine && (!user || !await hasPermission(user, ADMIN_PERMISSIONS.REFERRALS_MANAGE))) return { response: jsonError("غير مصرح بإدارة الإحالات والهدايا", 403), user: null, actor: "", machine: false };
  const bearer = /^Bearer\s+/i.test(request.headers.get("authorization") || "");
  if (mutation && !machine && !bearer && !sameOriginRequest(request)) return { response: jsonError("تعذر التحقق من مصدر الطلب", 403), user: null, actor: "", machine: false };
  const identity = machine ? `machine:${clientIp(request)}` : `user:${user!.id}`;
  if (!await checkRateLimit(mutation ? "admin-referrals-write" : "admin-referrals-read", identity, mutation ? 60 : 120, 60)) return { response: jsonError("طلبات إدارية كثيرة. حاول بعد دقيقة.", 429), user: null, actor: "", machine };
  if (mutation && user) {
    try { await requireAdminStepUp(request, user); }
    catch (error) {
      return {
        response: error instanceof AdminMfaError ? jsonError(error.message, error.status) : jsonError("مطلوب تحقق إداري إضافي", 403),
        user: null,
        actor: "",
        machine: false,
      };
    }
  }
  return { response: null, user, actor: machine ? "admin-api-token" : user!.email, machine };
}

function noStore(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

function positiveInteger(value: unknown, label: string, max: number) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > max) throw new ReferralInputError(`${label} غير صالح`);
  return number;
}

function optionalInteger(value: unknown, label: string, max: number) {
  if (value === null || value === undefined || value === "") return null;
  return positiveInteger(value, label, max);
}

function rewardType(value: unknown): ReferralRewardType {
  const type = cleanText(value, 30) as ReferralRewardType;
  if (!(["coupon_percent", "coupon_fixed", "ai_subscription"] as string[]).includes(type)) throw new ReferralInputError("نوع المكافأة غير صالح");
  return type;
}

function tierInput(payload: Record<string, unknown>) {
  const name = cleanText(payload.name, 120);
  if (name.length < 2) throw new ReferralInputError("اسم المستوى مطلوب");
  const description = cleanText(payload.description, 600);
  const requiredReferrals = positiveInteger(payload.requiredReferrals, "عدد الإحالات", 100_000);
  const type = rewardType(payload.rewardType);
  const rewardValue = Number(payload.rewardValue);
  if (!Number.isFinite(rewardValue) || rewardValue <= 0 || rewardValue > 100_000) throw new ReferralInputError("قيمة المكافأة غير صالحة");
  if (type === "coupon_percent" && rewardValue > 95) throw new ReferralInputError("نسبة الخصم لا يمكن أن تتجاوز 95٪");
  if (type === "ai_subscription" && (!Number.isInteger(rewardValue) || rewardValue > 24)) throw new ReferralInputError("مدة اشتراك AI يجب أن تكون من شهر إلى 24 شهرًا");
  const rewardDurationDays = optionalInteger(payload.rewardDurationDays, "مدة المكافأة", 730);
  const couponValidityDays = optionalInteger(payload.couponValidityDays, "صلاحية الكوبون", 730);
  const courseSlug = cleanText(payload.courseSlug, 120).toLowerCase() || null;
  const enabled = payload.enabled !== false;
  const sortOrder = Number.isInteger(Number(payload.sortOrder)) ? Math.max(0, Math.min(100_000, Number(payload.sortOrder))) : requiredReferrals;
  return { name, description, requiredReferrals, rewardType: type, rewardValue, rewardDurationDays, couponValidityDays, courseSlug, enabled, sortOrder };
}

async function requestPayload(request: Request) {
  try {
    const value = await request.json() as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new ReferralInputError("بيانات الطلب غير صالحة");
  }
}

function serialized(value: unknown) {
  try { return JSON.stringify(value); } catch { return "{}"; }
}

async function audit(request: Request, actor: string, action: string, entityType: string, entityId: string, before: unknown, after: unknown) {
  await getDb().insert(auditLogs).values({ actorEmail: actor, action, entityType, entityId, beforeJson: before ? serialized(before) : null, afterJson: after ? serialized(after) : null, ipAddress: clientIp(request), createdAt: new Date().toISOString() });
}

export async function GET(request: Request) {
  const authorization = await authorize(request, false);
  if (authorization.response) return authorization.response;
  const db = getDb();
  const search = cleanText(new URL(request.url).searchParams.get("search"), 120).toLowerCase();
  const limit = Math.max(20, Math.min(500, Number(new URL(request.url).searchParams.get("limit")) || 300));
  const page = Math.max(1, Number(new URL(request.url).searchParams.get("page")) || 1);
  const studentFilter = search ? and(eq(users.role, "student"), or(ilike(users.email, `%${search}%`), ilike(users.fullName, `%${search}%`), ilike(referralCodes.code, `%${search}%`))) : eq(users.role, "student");
  const [settingRows, tiers, studentRows, attributionRows, rewardRows, ownedCoupons, uses, totals] = await Promise.all([
    db.select().from(referralProgramSettings).where(eq(referralProgramSettings.programKey, "default")).limit(1),
    db.select().from(referralTiers).orderBy(asc(referralTiers.sortOrder), asc(referralTiers.requiredReferrals)),
    db.select({ id: users.id, email: users.email, fullName: users.fullName, status: users.status, createdAt: users.createdAt, code: referralCodes.code, shareCount: referralCodes.shareCount }).from(users).leftJoin(referralCodes, eq(referralCodes.userId, users.id)).where(studentFilter).orderBy(desc(users.createdAt)).limit(limit).offset((page - 1) * limit),
    db.select().from(referralAttributions).orderBy(desc(referralAttributions.createdAt)).limit(500),
    db.select().from(userRewards).orderBy(desc(userRewards.issuedAt)).limit(500),
    db.select().from(couponsDb).where(sql`${couponsDb.ownerUserId} IS NOT NULL`).orderBy(desc(couponsDb.createdAt)).limit(500),
    db.select().from(couponUses).orderBy(desc(couponUses.reservedAt)).limit(500),
    db.execute(sql`SELECT
      (SELECT count(*)::int FROM referral_codes rc INNER JOIN users u ON u.id = rc.user_id WHERE u.role = 'student') AS students,
      (SELECT count(*)::int FROM referral_attributions WHERE status = 'qualified') AS qualified,
      (SELECT count(*)::int FROM referral_attributions WHERE status = 'pending') AS pending,
      (SELECT count(*)::int FROM referral_attributions WHERE status = 'rejected') AS rejected,
      (SELECT count(*)::int FROM user_rewards) AS rewards,
      (SELECT count(*)::int FROM coupons WHERE owner_user_id IS NOT NULL AND status = 'active' AND used_count = 0 AND (expires_at IS NULL OR expires_at::timestamptz > NOW())) AS active_coupons,
      (SELECT count(*)::int FROM coupons WHERE owner_user_id IS NOT NULL AND used_count > 0) AS used_coupons`),
  ]);
  const settings = settingRows[0] || {
    enabled: true, qualificationEvent: "first_paid_order", title: "شارك مراس واكسب هداياك", description: "", terms: "",
    maxQualifiedPerIpPerDay: 3, defaultCouponValidityDays: 90,
  };
  const involvedUserIds = [...new Set([...studentRows.map((user) => user.id), ...attributionRows.flatMap((row) => [row.referrerUserId, row.referredUserId]), ...rewardRows.map((row) => row.userId)])];
  const involvedUsers = involvedUserIds.length ? await db.select({ id: users.id, email: users.email, fullName: users.fullName, status: users.status, createdAt: users.createdAt }).from(users).where(inArray(users.id, involvedUserIds)) : [];
  const userById = new Map(involvedUsers.map((user) => [user.id, user]));
  const codeByUser = new Map(studentRows.map((student) => [student.id, { code: student.code, shareCount: student.shareCount || 0 }]));
  const couponById = new Map(ownedCoupons.map((coupon) => [coupon.id, coupon]));
  const useByCoupon = new Map(uses.map((use) => [use.couponId, use]));
  const attributionsByReferrer = new Map<number, typeof attributionRows>();
  for (const row of attributionRows) {
    const bucket = attributionsByReferrer.get(row.referrerUserId) || [];
    bucket.push(row);
    attributionsByReferrer.set(row.referrerUserId, bucket);
  }
  const earnedTierByUser = new Map<number, Set<number>>();
  for (const reward of rewardRows) {
    if (!reward.referralTierId) continue;
    const bucket = earnedTierByUser.get(reward.userId) || new Set<number>();
    bucket.add(reward.referralTierId);
    earnedTierByUser.set(reward.userId, bucket);
  }
  const students = studentRows.map((student) => {
    const referrals = attributionsByReferrer.get(student.id) || [];
    const counts = referrals.reduce((value, row) => ({ ...value, [row.status]: (value[row.status as keyof typeof value] || 0) + 1 }), { qualified: 0, pending: 0, rejected: 0 });
    const earned = earnedTierByUser.get(student.id) || new Set<number>();
    const nextTier = tiers.find((tier) => tier.enabled && !earned.has(tier.id) && tier.requiredReferrals > counts.qualified);
    const code = codeByUser.get(student.id);
    return { userId: student.id, email: student.email, fullName: student.fullName, status: student.status, code: code?.code || null, shareCount: code?.shareCount || 0, counts: { ...counts, total: referrals.length }, nextTier: nextTier ? { id: nextTier.id, name: nextTier.name, requiredReferrals: nextTier.requiredReferrals, remaining: Math.max(0, nextTier.requiredReferrals - counts.qualified) } : null };
  });
  const totalRow = (totals.rows[0] || {}) as Record<string, unknown>;
  return noStore({
    ok: true,
    pagination: { page, limit, total: Number(totalRow.students || 0), hasMore: page * limit < Number(totalRow.students || 0) },
    settings: {
      enabled: settings.enabled,
      qualificationEvent: settings.qualificationEvent,
      title: settings.title,
      description: settings.description,
      terms: settings.terms,
      maxQualifiedPerIpPerDay: settings.maxQualifiedPerIpPerDay,
      defaultCouponValidityDays: settings.defaultCouponValidityDays,
    },
    stats: {
      students: Number(totalRow.students || 0), qualified: Number(totalRow.qualified || 0), pending: Number(totalRow.pending || 0), rejected: Number(totalRow.rejected || 0),
      rewards: Number(totalRow.rewards || 0), activeCoupons: Number(totalRow.active_coupons || 0), usedCoupons: Number(totalRow.used_coupons || 0),
    },
    tiers: tiers.map((tier) => ({ ...tier, rewardLabel: publicRewardLabel(tier.rewardType, tier.rewardValue) })),
    students,
    attributions: attributionRows.map((row) => ({
      id: row.id,
      referrer: userById.get(row.referrerUserId) || { id: row.referrerUserId, email: "", fullName: "طالب" },
      referred: userById.get(row.referredUserId) || { id: row.referredUserId, email: "", fullName: "طالب" },
      status: row.status,
      qualificationEvent: row.qualificationEvent,
      reviewReason: row.reviewReason,
      createdAt: row.createdAt,
      qualifiedAt: row.qualifiedAt,
    })),
    rewards: rewardRows.map((reward) => {
      const coupon = reward.couponId ? couponById.get(reward.couponId) : null;
      const use = reward.couponId ? useByCoupon.get(reward.couponId) : null;
      return {
        id: reward.id,
        user: userById.get(reward.userId) || { id: reward.userId, email: "", fullName: "طالب" },
        rewardType: reward.rewardType,
        rewardValue: reward.rewardValue,
        rewardLabel: publicRewardLabel(reward.rewardType, reward.rewardValue),
        sourceType: reward.sourceType,
        status: use?.status === "redeemed" ? "redeemed" : reward.status,
        coupon: coupon ? { id: coupon.id, code: coupon.code, status: coupon.status, usedCount: coupon.usedCount, courseSlug: coupon.courseSlug } : null,
        issuedAt: reward.issuedAt,
        expiresAt: reward.expiresAt,
        note: reward.note,
      };
    }),
  });
}

export async function POST(request: Request) {
  const authorization = await authorize(request, true);
  if (authorization.response) return authorization.response;
  try {
    const payload = await requestPayload(request);
    const action = cleanText(payload.action, 40);
    if (action === "create_tier") {
      const input = tierInput((payload.tier && typeof payload.tier === "object" ? payload.tier : payload) as Record<string, unknown>);
      const now = new Date().toISOString();
      const [tier] = await getDb().insert(referralTiers).values({ ...input, createdAt: now, updatedAt: now }).returning();
      await audit(request, authorization.actor, "create", "referral_tier", String(tier.id), null, tier);
      return noStore({ ok: true, tier }, 201);
    }
    if (action === "grant_reward") {
      const email = cleanText(payload.email, 180).toLowerCase();
      const [target] = await getDb().select({ id: users.id, email: users.email }).from(users).where(and(eq(users.email, email), eq(users.status, "active"))).limit(1);
      if (!target) throw new ReferralInputError("المستخدم غير موجود أو غير نشط");
      const type = rewardType(payload.rewardType);
      const value = Number(payload.rewardValue);
      if (!Number.isFinite(value) || value <= 0 || (type === "coupon_percent" && value > 95) || (type === "ai_subscription" && (!Number.isInteger(value) || value > 24))) throw new ReferralInputError("قيمة الهدية غير صالحة");
      const reward = await grantAdminReward({ userId: target.id, rewardType: type, rewardValue: value, courseSlug: cleanText(payload.courseSlug, 120).toLowerCase() || null, validityDays: optionalInteger(payload.validityDays, "مدة الصلاحية", 730), grantedBy: authorization.actor, title: cleanText(payload.title, 120) || undefined, note: cleanText(payload.note, 500) || undefined });
      await audit(request, authorization.actor, "grant", "user_reward", String(reward.id), null, { ...reward, targetEmail: target.email });
      return noStore({ ok: true, reward }, 201);
    }
    if (action === "reconcile") {
      const requestedUserId = payload.userId ? positiveInteger(payload.userId, "المستخدم", 2_000_000_000) : null;
      const userIds = requestedUserId ? [requestedUserId] : (await getDb().select({ userId: referralCodes.userId }).from(referralCodes).limit(1_000)).map((row) => row.userId);
      let issued = 0;
      for (let offset = 0; offset < userIds.length; offset += 50) {
        const batch = userIds.slice(offset, offset + 50);
        issued += await getDb().transaction(async (tx) => {
          let batchIssued = 0;
          for (const userId of batch) batchIssued += (await reconcileReferralRewardsTx(tx, userId)).length;
          return batchIssued;
        });
      }
      await audit(request, authorization.actor, "reconcile", "referral_rewards", requestedUserId ? String(requestedUserId) : "all", null, { checked: userIds.length, issued });
      return noStore({ ok: true, checked: userIds.length, issued });
    }
    throw new ReferralInputError("الإجراء غير مدعوم");
  } catch (error) {
    if (error instanceof ReferralInputError) return jsonError(error.message, 400);
    if (isUniqueConstraintError(error)) return jsonError("يوجد مستوى آخر بنفس عدد الإحالات", 409);
    return jsonError("تعذر تنفيذ الإجراء الإداري", 500);
  }
}

export async function PATCH(request: Request) {
  const authorization = await authorize(request, true);
  if (authorization.response) return authorization.response;
  try {
    const payload = await requestPayload(request);
    const action = cleanText(payload.action, 40);
    const now = new Date().toISOString();
    if (action === "settings") {
      const qualificationEvent = cleanText(payload.qualificationEvent, 30);
      if (!['registration', 'first_paid_order'].includes(qualificationEvent)) throw new ReferralInputError("حدث تأهيل الإحالة غير صالح");
      const values = {
        enabled: payload.enabled !== false,
        qualificationEvent,
        title: cleanText(payload.title, 160) || "شارك مراس واكسب هداياك",
        description: cleanText(payload.description, 1_000),
        terms: cleanText(payload.terms, 2_000),
        maxQualifiedPerIpPerDay: positiveInteger(payload.maxQualifiedPerIpPerDay, "حد الإحالات اليومي", 100),
        defaultCouponValidityDays: positiveInteger(payload.defaultCouponValidityDays, "مدة صلاحية الكوبون", 730),
        updatedBy: authorization.actor,
        updatedAt: now,
      };
      const [before] = await getDb().select().from(referralProgramSettings).where(eq(referralProgramSettings.programKey, "default")).limit(1);
      const [settings] = await getDb().insert(referralProgramSettings).values({ programKey: "default", ...values, createdAt: now }).onConflictDoUpdate({ target: referralProgramSettings.programKey, set: values }).returning();
      await audit(request, authorization.actor, "update", "referral_settings", "default", before, settings);
      return noStore({ ok: true, settings });
    }
    if (action === "tier") {
      const id = positiveInteger(payload.id, "المستوى", 2_000_000_000);
      const input = tierInput(payload);
      const [before] = await getDb().select().from(referralTiers).where(eq(referralTiers.id, id)).limit(1);
      if (!before) throw new ReferralInputError("المستوى غير موجود");
      const [tier] = await getDb().update(referralTiers).set({ ...input, updatedAt: now }).where(eq(referralTiers.id, id)).returning();
      await audit(request, authorization.actor, "update", "referral_tier", String(id), before, tier);
      return noStore({ ok: true, tier });
    }
    if (action === "reward_status") {
      const id = positiveInteger(payload.id, "المكافأة", 2_000_000_000);
      const status = cleanText(payload.status, 20);
      if (!['active', 'disabled'].includes(status)) throw new ReferralInputError("حالة المكافأة غير صالحة");
      const result = await getDb().transaction(async (tx) => {
        const [before] = await tx.select().from(userRewards).where(eq(userRewards.id, id)).limit(1).for("update");
        if (!before) throw new ReferralInputError("المكافأة غير موجودة");
        if (["redeemed", "expired"].includes(before.status)) throw new ReferralInputError("لا يمكن تغيير مكافأة مستخدمة أو منتهية؛ يبقى سجلها محفوظًا للتدقيق");
        const [reward] = await tx.update(userRewards).set({ status, updatedAt: now }).where(eq(userRewards.id, id)).returning();
        if (before.couponId) await tx.update(couponsDb).set({ status, updatedAt: now }).where(eq(couponsDb.id, before.couponId));
        return { before, reward };
      });
      await audit(request, authorization.actor, status === "disabled" ? "revoke" : "activate", "user_reward", String(id), result.before, result.reward);
      return noStore({ ok: true, reward: result.reward });
    }
    if (action === "coupon_status") {
      const id = positiveInteger(payload.id, "الكوبون", 2_000_000_000);
      const status = cleanText(payload.status, 20);
      if (!['active', 'disabled'].includes(status)) throw new ReferralInputError("حالة الكوبون غير صالحة");
      const [before] = await getDb().select().from(couponsDb).where(eq(couponsDb.id, id)).limit(1);
      if (!before || !before.ownerUserId) throw new ReferralInputError("الكوبون الخاص غير موجود");
      const [coupon] = await getDb().update(couponsDb).set({ status, updatedAt: now }).where(eq(couponsDb.id, id)).returning();
      await audit(request, authorization.actor, status === "disabled" ? "revoke" : "activate", "coupon", coupon.code, before, coupon);
      return noStore({ ok: true, coupon });
    }
    if (action === "attribution_status") {
      const id = positiveInteger(payload.id, "الإحالة", 2_000_000_000);
      const status = cleanText(payload.status, 20);
      if (!['qualified', 'pending', 'rejected'].includes(status)) throw new ReferralInputError("حالة الإحالة غير صالحة");
      const result = await getDb().transaction(async (tx) => {
        const [before] = await tx.select().from(referralAttributions).where(eq(referralAttributions.id, id)).limit(1).for("update");
        if (!before) throw new ReferralInputError("الإحالة غير موجودة");
        const [attribution] = await tx.update(referralAttributions).set({ status, reviewReason: cleanText(payload.reviewReason, 300) || null, reviewedAt: now, reviewedBy: authorization.actor, qualifiedAt: status === "qualified" ? before.qualifiedAt || now : null, updatedAt: now }).where(eq(referralAttributions.id, id)).returning();
        if (status === "qualified" && before.status !== "qualified") {
          const [referrer] = await tx.select({ email: users.email }).from(users).where(eq(users.id, attribution.referrerUserId)).limit(1);
          if (referrer) await tx.insert(notificationsDb).values({ userEmail: referrer.email, audience: "student", title: "اكتملت إحالة جديدة", body: "تمت مراجعة الإحالة وأصبحت مؤهلة. حدّثنا تقدمك وأصدرنا أي هدية استحقتها تلقائيًا.", actionUrl: "/referrals", actionLabel: "عرض تقدمي", template: "success", dedupeKey: `referral-qualified:${attribution.id}`, pushEnabled: true, pushStatus: "pending", createdAt: now }).onConflictDoNothing({ target: notificationsDb.dedupeKey });
        }
        const issued = await reconcileReferralRewardsTx(tx, attribution.referrerUserId, now);
        return { before, attribution, issued };
      });
      await audit(request, authorization.actor, "review", "referral_attribution", String(id), result.before, { ...result.attribution, issuedRewards: result.issued.map((item) => item.id) });
      return noStore({ ok: true, attribution: result.attribution, issued: result.issued.length });
    }
    throw new ReferralInputError("الإجراء غير مدعوم");
  } catch (error) {
    if (error instanceof ReferralInputError) return jsonError(error.message, 400);
    if (isUniqueConstraintError(error)) return jsonError("تعارضت البيانات مع سجل موجود", 409);
    return jsonError("تعذر تحديث إعدادات الإحالات", 500);
  }
}
