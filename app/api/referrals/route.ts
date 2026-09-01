import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { analyticsEvents, couponUses, couponsDb, referralAttributions, referralCodes, referralTiers, userRewards } from "@/db/schema";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";
import { ensureReferralCode, publicRewardLabel, referralProgram } from "@/lib/referrals";

export const dynamic = "force-dynamic";

function noStore(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

function effectiveCouponStatus(coupon: typeof couponsDb.$inferSelect, used: boolean) {
  if (used || coupon.usedCount > 0) return "used";
  if (coupon.status !== "active") return coupon.status;
  if (coupon.expiresAt && Date.parse(coupon.expiresAt) <= Date.now()) return "expired";
  if (coupon.startsAt && Date.parse(coupon.startsAt) > Date.now()) return "scheduled";
  return "active";
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول لعرض إحالاتك وهداياك", 401);
  if (!await checkRateLimit("referrals-read", `user:${user.id}`, 90, 60)) return jsonError("طلبات كثيرة. حاول بعد قليل.", 429);
  const db = getDb();
  const code = await ensureReferralCode(user.id);
  if (!code) return jsonError("تعذر تجهيز رابط الإحالة", 503);
  const [program, tiers, attributions, rewards, coupons, uses] = await Promise.all([
    referralProgram(),
    db.select().from(referralTiers).where(eq(referralTiers.enabled, true)).orderBy(asc(referralTiers.sortOrder), asc(referralTiers.requiredReferrals)),
    db.select({ id: referralAttributions.id, status: referralAttributions.status, reviewReason: referralAttributions.reviewReason, createdAt: referralAttributions.createdAt, qualifiedAt: referralAttributions.qualifiedAt }).from(referralAttributions).where(eq(referralAttributions.referrerUserId, user.id)).orderBy(desc(referralAttributions.createdAt)),
    db.select().from(userRewards).where(eq(userRewards.userId, user.id)).orderBy(desc(userRewards.issuedAt)),
    db.select().from(couponsDb).where(eq(couponsDb.ownerUserId, user.id)).orderBy(desc(couponsDb.createdAt)),
    db.select().from(couponUses).where(eq(couponUses.userId, user.id)).orderBy(desc(couponUses.reservedAt)),
  ]);
  const counts = attributions.reduce((summary, item) => {
    summary.total += 1;
    if (item.status === "qualified") summary.qualified += 1;
    else if (item.status === "rejected") summary.rejected += 1;
    else summary.pending += 1;
    return summary;
  }, { total: 0, pending: 0, qualified: 0, rejected: 0 });
  const earnedTierIds = new Set(rewards.map((reward) => reward.referralTierId).filter((id): id is number => Boolean(id)));
  const nextTier = tiers.find((tier) => !earnedTierIds.has(tier.id) && tier.requiredReferrals > counts.qualified) || null;
  const previousRequirement = tiers.filter((tier) => tier.requiredReferrals <= counts.qualified).at(-1)?.requiredReferrals || 0;
  const progressPercent = nextTier
    ? Math.min(100, Math.max(0, Math.round((counts.qualified - previousRequirement) / Math.max(1, nextTier.requiredReferrals - previousRequirement) * 100)))
    : 100;
  const useByCoupon = new Map(uses.map((use) => [use.couponId, use]));
  const couponById = new Map(coupons.map((coupon) => [coupon.id, coupon]));
  const origin = (process.env.APP_URL?.trim() || new URL(request.url).origin).replace(/\/$/, "");

  return noStore({
    ok: true,
    program: {
      enabled: program.enabled,
      title: program.title,
      description: program.description,
      qualificationEvent: program.qualificationEvent,
      qualificationLabel: program.qualificationEvent === "first_paid_order" ? "تكتمل الإحالة بعد أول اشتراك مدفوع للطالب المُحال" : "تكتمل الإحالة عند إنشاء حساب طالب جديد مؤهل",
      terms: program.terms,
    },
    referral: {
      code: code.code,
      shareUrl: `${origin}/r/${encodeURIComponent(code.code)}`,
      shareCount: code.shareCount,
      counts,
      nextTier: nextTier ? {
        id: nextTier.id,
        name: nextTier.name,
        requiredReferrals: nextTier.requiredReferrals,
        remaining: Math.max(0, nextTier.requiredReferrals - counts.qualified),
        rewardLabel: publicRewardLabel(nextTier.rewardType, nextTier.rewardValue),
      } : null,
      progressPercent,
    },
    tiers: tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      description: tier.description,
      requiredReferrals: tier.requiredReferrals,
      rewardType: tier.rewardType,
      rewardValue: tier.rewardValue,
      rewardLabel: publicRewardLabel(tier.rewardType, tier.rewardValue),
      courseSlug: tier.courseSlug,
      enabled: tier.enabled,
      earned: earnedTierIds.has(tier.id),
    })),
    referrals: attributions.slice(0, 50).map((item) => ({
      id: item.id,
      status: item.status,
      statusLabel: item.status === "qualified" ? "إحالة مؤهلة" : item.status === "rejected" ? "غير محتسبة" : "قيد المراجعة",
      detail: item.reviewReason === "duplicate_device" ? "لم تُحتسب بسبب تكرار الجهاز" : item.reviewReason === "ip_velocity_review" ? "تخضع لمراجعة حماية البرنامج" : item.reviewReason === "program_disabled" ? "بانتظار تفعيل البرنامج" : item.reviewReason === "referral_code_inactive" ? "لم تُحتسب لأن الرابط لم يكن نشطًا" : item.status === "qualified" ? "تم احتسابها في تقدمك" : "سيتم تحديثها تلقائيًا عند اكتمال شرط التأهيل",
      createdAt: item.createdAt,
      qualifiedAt: item.qualifiedAt,
    })),
    rewards: rewards.map((reward) => {
      const coupon = reward.couponId ? couponById.get(reward.couponId) : null;
      const use = reward.couponId ? useByCoupon.get(reward.couponId) : null;
      const expired = Boolean(reward.expiresAt && Date.parse(reward.expiresAt) <= Date.now());
      return {
        id: reward.id,
        type: reward.rewardType,
        title: publicRewardLabel(reward.rewardType, reward.rewardValue),
        sourceType: reward.sourceType,
        status: expired ? "expired" : use?.status === "redeemed" ? "redeemed" : reward.status,
        issuedAt: reward.issuedAt,
        expiresAt: reward.expiresAt,
        note: reward.note,
        coupon: coupon ? { code: coupon.code, courseSlug: coupon.courseSlug, status: effectiveCouponStatus(coupon, use?.status === "redeemed") } : null,
      };
    }),
    coupons: coupons.map((coupon) => {
      const use = useByCoupon.get(coupon.id);
      return {
        id: coupon.id,
        code: coupon.code,
        title: coupon.title,
        type: coupon.type,
        value: coupon.value,
        courseSlug: coupon.courseSlug,
        status: effectiveCouponStatus(coupon, use?.status === "redeemed"),
        used: use?.status === "redeemed" || coupon.usedCount > 0,
        expiresAt: coupon.expiresAt,
      };
    }),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول أولًا", 401);
  const bearer = /^Bearer\s+/i.test(request.headers.get("authorization") || "");
  if (!bearer && !sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  if (!await checkRateLimit("referrals-share", `user:${user.id}`, 30, 60)) return jsonError("تم تسجيل مشاركات كثيرة خلال وقت قصير. حاول لاحقًا.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات المشاركة غير صالحة"); }
  const action = cleanText(payload.action, 30);
  if (action !== "track_share") return jsonError("الإجراء غير مدعوم");
  const channel = cleanText(payload.channel, 30).toLowerCase() || "system_share";
  const code = await ensureReferralCode(user.id);
  if (!code) return jsonError("تعذر تجهيز رابط الإحالة", 503);
  const now = new Date().toISOString();
  await getDb().transaction(async (tx) => {
    await tx.update(referralCodes).set({ shareCount: sql`${referralCodes.shareCount} + 1`, updatedAt: now }).where(eq(referralCodes.id, code.id));
    await tx.insert(analyticsEvents).values({ event: "referral_share", userEmail: user.email, metadataJson: JSON.stringify({ channel, codeId: code.id }), createdAt: now });
  });
  return noStore({ ok: true, tracked: true }, 201);
}
