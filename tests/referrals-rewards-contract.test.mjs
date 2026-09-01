import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("referral migration enforces ownership, idempotency, and anti-abuse invariants", async () => {
  const [schema, migration, abuseIndexes] = await Promise.all([read("db/schema.ts"), read("drizzle/0020_referrals_rewards.sql"), read("drizzle/0022_referral_abuse_indexes.sql")]);
  assert.match(schema, /export const referralCodes/);
  assert.match(schema, /export const referralAttributions/);
  assert.match(schema, /export const userRewards/);
  assert.match(schema, /ownerUserId: integer\("owner_user_id"\)/);
  assert.match(migration, /referral_attributions_referred_unique/);
  assert.match(migration, /referral_attributions_not_self_check/);
  assert.match(migration, /user_rewards_source_unique/);
  assert.match(migration, /coupon_uses_active_user_unique/);
  assert.match(schema, /qualificationEvent: text\("qualification_event"\)\.notNull\(\)\.default\("first_paid_order"\)/);
  assert.match(migration, /qualification_event" text DEFAULT 'first_paid_order'/);
  assert.match(migration, /5, 'coupon_percent', 25/);
  assert.match(migration, /10, 'coupon_percent', 50/);
  assert.match(schema, /referral_attributions_device_status_idx/);
  assert.match(schema, /referral_attributions_ip_created_status_idx/);
  assert.match(abuseIndexes, /CREATE INDEX IF NOT EXISTS "referral_attributions_device_status_idx"/);
  assert.match(abuseIndexes, /CREATE INDEX IF NOT EXISTS "referral_attributions_ip_created_status_idx"/);
});

test("web and mobile registration accept referrals inside the account transaction", async () => {
  const [web, mobile, form, referral] = await Promise.all([
    read("app/api/auth/register/route.ts"),
    read("app/api/mobile/auth/register/route.ts"),
    read("components/auth-shell.tsx"),
    read("lib/referrals.ts"),
  ]);
  for (const route of [web, mobile]) {
    assert.match(route, /referralCodeFromRegistration\(payload, request\)/);
    assert.match(route, /db\.transaction/);
    assert.match(route, /recordReferralRegistrationTx/);
    assert.match(route, /provisionReferralCodeTx/);
  }
  assert.match(form, /URLSearchParams\(window\.location\.search\)\.get\("ref"\)/);
  assert.match(referral, /duplicate_device/);
  assert.match(referral, /ip_velocity_review/);
  assert.match(referral, /REFERRAL_HASH_SALT must be configured/);
  assert.match(referral, /REFERRAL_TRUSTED_IP_HEADER/);
  assert.match(referral, /qualificationEvent === "registration"/);
  assert.match(referral, /first_paid_order/);
});

test("student referral API is a complete mobile page contract with automatic rewards", async () => {
  const [route, referral] = await Promise.all([read("app/api/referrals/route.ts"), read("lib/referrals.ts")]);
  assert.match(route, /program:/);
  assert.match(route, /referral:/);
  assert.match(route, /tiers:/);
  assert.match(route, /rewards:/);
  assert.match(route, /coupons:/);
  assert.match(route, /shareUrl: `\$\{origin\}\/r\//);
  assert.match(route, /action !== "track_share"/);
  assert.match(referral, /referral-reward:\$\{reward\.id\}/);
  assert.match(referral, /actionUrl: `\/referrals\?reward=\$\{reward\.id\}`/);
  assert.match(referral, /usageLimit: 1/);
});

test("admin API controls settings, tiers, gifts, review, revocation, and reconciliation", async () => {
  const route = await read("app/api/admin/referrals/route.ts");
  for (const action of ["create_tier", "grant_reward", "reconcile", "settings", "tier", "reward_status", "coupon_status", "attribution_status"]) assert.match(route, new RegExp(`action === "${action}"`));
  assert.match(route, /sameOriginRequest\(request\)/);
  assert.match(route, /Bearer\\s\+/);
  assert.match(route, /ADMIN_PERMISSIONS\.REFERRALS_MANAGE/);
  assert.match(route, /requireAdminStepUp\(request, user\)/);
  assert.match(route, /mutation && machine/);
  assert.match(route, /audit\(request/);
  assert.match(route, /reconcileReferralRewardsTx/);
  assert.match(route, /offset \+= 50/);
  assert.match(route, /status === "disabled" \? "revoke"/);
  const referral = await read("lib/referrals.ts");
  assert.match(referral, /const nextStatus = expired \? "expired" : earned \? "active" : "disabled"/);
});

test("owned coupons are verified and reserved atomically before checkout", async () => {
  const [coupons, checkout, webhook] = await Promise.all([
    read("lib/coupons.ts"),
    read("app/api/checkout/route.ts"),
    read("app/api/webhooks/tap/route.ts"),
  ]);
  assert.match(coupons, /coupon\.ownerUserId !== null && coupon\.ownerUserId !== userId/);
  assert.match(coupons, /pg_advisory_xact_lock/);
  assert.match(coupons, /reservationExpiresAt/);
  assert.match(coupons, /effectiveCount >= coupon\.usageLimit/);
  assert.match(coupons, /redeemCouponReservationTx/);
  assert.match(coupons, /reservation\.status === "redeemed"/);
  assert.match(coupons, /coupon\.ownerUserId !== null && coupon\.ownerUserId !== reservation\.userId/);
  assert.match(coupons, /coupon\.status !== "active"/);
  assert.match(coupons, /NOT EXISTS \(/);
  assert.match(checkout, /reserveCouponForCheckoutTx/);
  assert.match(checkout, /quoteCoupon\([^\n]+user\.id/);
  assert.match(webhook, /redeemCouponReservationTx\(tx/);
  assert.match(webhook, /coupon-review/);
  assert.match(webhook, /effectiveStatus = "payment_review"/);
  assert.doesNotMatch(webhook, /couponsDb\.usedCount} \+ 1/);
  assert.match(webhook, /qualifyReferralForPaidOrderTx/);
});

test("full refunds atomically downgrade first-paid referrals and recalculate unused rewards", async () => {
  const [referrals, webhook] = await Promise.all([read("lib/referrals.ts"), read("app/api/webhooks/tap/route.ts")]);
  assert.match(referrals, /reconcileReferralQualificationAfterRefundTx/);
  assert.match(referrals, /inArray\(orders\.status, \["paid", "partially_refunded", "payment_review"\]\)/);
  assert.match(referrals, /status: "pending"[\s\S]{0,140}qualifiedAt: null/);
  assert.match(referrals, /reconcileReferralRewardsTx\(tx, updated\.referrerUserId/);
  assert.match(referrals, /referral-downgraded:/);
  assert.match(webhook, /applied\.fullyRefunded && applied\.newlyFullyRefunded[\s\S]{0,220}reconcileReferralQualificationAfterRefundTx/);
  assert.ok((webhook.match(/reconcileReferralQualificationAfterRefundTx/g) || []).length >= 3);
});

test("web student and admin referral experiences are dedicated RTL surfaces", async () => {
  const [studentPage, studentUi, adminPage, adminUi] = await Promise.all([
    read("app/referrals/page.tsx"), read("components/referrals-center.tsx"), read("app/admin/referrals/page.tsx"), read("components/admin-referrals-center.tsx"),
  ]);
  assert.match(studentPage, /requireUser\("\/referrals"\)/);
  assert.match(studentUi, /dir="rtl"/);
  assert.match(studentUi, /الإحالات والهدايا/);
  assert.match(studentUi, /محفظتي/);
  assert.match(adminPage, /requireRole\("\/admin\/referrals", \["admin"\]\)/);
  assert.match(adminUi, /مراجعة الحالات/);
  assert.match(adminUi, /إصدار الهدية وإرسال الإشعار/);
});
