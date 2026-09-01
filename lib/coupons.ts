import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { couponUses, couponsDb, orders, userRewards, users } from "@/db/schema";

type Database = ReturnType<typeof getDb>;
export type CouponTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type CouponQuote = {
  couponId: number;
  code: string;
  type: string;
  value: number;
  discount: number;
  total: number;
  label: string;
  courseSlug: string | null;
  owned: boolean;
};

const money = (value: number) => Math.round(value * 100) / 100;

function cleanCode(rawCode: string) {
  return rawCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);
}

function currentlyUsable(coupon: typeof couponsDb.$inferSelect, userId: number) {
  if (coupon.status !== "active") return false;
  const now = Date.now();
  if (coupon.startsAt && Date.parse(coupon.startsAt) > now) return false;
  if (coupon.expiresAt && Date.parse(coupon.expiresAt) <= now) return false;
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return false;
  if (coupon.ownerUserId !== null && coupon.ownerUserId !== userId) return false;
  return true;
}

function quote(coupon: typeof couponsDb.$inferSelect, subtotal: number): CouponQuote | null {
  const requested = coupon.type === "percent" ? subtotal * Math.min(coupon.value, 95) / 100 : coupon.value;
  const discount = money(Math.min(Math.max(0, requested), Math.max(0, subtotal - 1)));
  if (discount <= 0) return null;
  return {
    couponId: coupon.id,
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    discount,
    total: money(subtotal - discount),
    label: coupon.type === "percent" ? `خصم ${Math.min(coupon.value, 95)}%` : `خصم ${money(discount)} ر.س`,
    courseSlug: coupon.courseSlug,
    owned: coupon.ownerUserId !== null,
  };
}

export async function quoteCoupon(rawCode: string, courseSlug: string, price: number, userId: number): Promise<CouponQuote | null> {
  const code = cleanCode(rawCode);
  if (!code) return null;
  const [coupon] = await getDb().select().from(couponsDb).where(eq(couponsDb.code, code)).limit(1);
  if (!coupon || !currentlyUsable(coupon, userId)) return null;
  if (coupon.courseSlug && coupon.courseSlug !== courseSlug) return null;
  return quote(coupon, price);
}

export async function quoteCouponForCart(rawCode: string, items: Array<{ courseSlug: string; price: number }>, userId: number): Promise<CouponQuote | null> {
  const code = cleanCode(rawCode);
  if (!code || !items.length) return null;
  const [coupon] = await getDb().select().from(couponsDb).where(eq(couponsDb.code, code)).limit(1);
  if (!coupon || !currentlyUsable(coupon, userId)) return null;
  const eligible = coupon.courseSlug ? items.filter((item) => item.courseSlug === coupon.courseSlug) : items;
  const subtotal = money(eligible.reduce((sum, item) => sum + item.price, 0));
  return subtotal > 0 ? quote(coupon, subtotal) : null;
}

export async function reserveCouponForCheckoutTx(tx: CouponTransaction, input: {
  quote: CouponQuote;
  userId: number;
  orderNumber: string;
  eligibleCourseSlugs: string[];
  now: string;
  reservationMinutes?: number;
}) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${input.quote.couponId + 8_000_000})`);
  await tx.update(couponUses).set({ status: "released", releasedAt: input.now }).where(and(
    eq(couponUses.couponId, input.quote.couponId),
    eq(couponUses.status, "reserved"),
    lte(couponUses.reservationExpiresAt, input.now),
    sql`NOT EXISTS (
      SELECT 1
      FROM ${orders}
      WHERE ${orders.orderNumber} = ${couponUses.orderNumber}
        AND ${orders.status} NOT IN ('failed', 'cancelled', 'voided', 'refunded')
    )`,
  ));
  const [coupon] = await tx.select().from(couponsDb).where(eq(couponsDb.id, input.quote.couponId)).limit(1).for("update");
  if (!coupon || !currentlyUsable(coupon, input.userId)) return { ok: false as const, reason: "unavailable" };
  if (coupon.code !== input.quote.code || coupon.type !== input.quote.type || coupon.value !== input.quote.value || coupon.courseSlug !== input.quote.courseSlug) return { ok: false as const, reason: "changed" };
  if (coupon.courseSlug && !input.eligibleCourseSlugs.includes(coupon.courseSlug)) return { ok: false as const, reason: "course" };
  const activeUses = await tx.select({ userId: couponUses.userId, status: couponUses.status, orderNumber: couponUses.orderNumber }).from(couponUses).where(and(
    eq(couponUses.couponId, coupon.id),
    inArray(couponUses.status, ["reserved", "redeemed"]),
  ));
  const userUse = activeUses.find((use) => use.userId === input.userId);
  if (userUse && userUse.orderNumber !== input.orderNumber) return { ok: false as const, reason: userUse.status === "redeemed" ? "used" : "reserved" };
  const redeemedCount = activeUses.filter((use) => use.status === "redeemed").length;
  const reservedCount = activeUses.filter((use) => use.status === "reserved").length;
  const effectiveCount = Math.max(coupon.usedCount, redeemedCount) + reservedCount;
  if (coupon.usageLimit !== null && effectiveCount >= coupon.usageLimit) return { ok: false as const, reason: "limit" };
  const reservationExpiresAt = new Date(Date.parse(input.now) + Math.max(5, input.reservationMinutes || 30) * 60_000).toISOString();
  await tx.insert(couponUses).values({ couponId: coupon.id, userId: input.userId, orderNumber: input.orderNumber, status: "reserved", reservedAt: input.now, reservationExpiresAt });
  return { ok: true as const, couponId: coupon.id, reservationExpiresAt };
}

export async function redeemCouponReservationTx(tx: CouponTransaction, input: {
  orderNumber: string;
  couponCode: string;
  customerEmail: string;
  now: string;
}) {
  const [reservation] = await tx.select().from(couponUses)
    .where(eq(couponUses.orderNumber, input.orderNumber))
    .limit(1)
    .for("update");
  if (!reservation) return { ok: false as const, reason: "missing_reservation" };

  await tx.execute(sql`SELECT pg_advisory_xact_lock(${reservation.couponId + 8_000_000})`);
  const [[coupon], [owner]] = await Promise.all([
    tx.select().from(couponsDb).where(eq(couponsDb.id, reservation.couponId)).limit(1).for("update"),
    tx.select({ email: users.email }).from(users).where(eq(users.id, reservation.userId)).limit(1),
  ]);
  if (!coupon || !owner) return { ok: false as const, reason: "missing_owner_or_coupon" };
  if (owner.email.toLowerCase() !== input.customerEmail.toLowerCase()) return { ok: false as const, reason: "owner_mismatch" };
  if (coupon.code !== cleanCode(input.couponCode)) return { ok: false as const, reason: "code_mismatch" };
  if (coupon.ownerUserId !== null && coupon.ownerUserId !== reservation.userId) return { ok: false as const, reason: "coupon_owner_mismatch" };

  if (reservation.status === "redeemed") {
    return { ok: true as const, couponId: coupon.id, alreadyRedeemed: true };
  }
  if (reservation.status !== "reserved") return { ok: false as const, reason: "reservation_not_active" };
  const nowMs = Date.parse(input.now);
  if (
    coupon.status !== "active"
    || Boolean(coupon.startsAt && Date.parse(coupon.startsAt) > nowMs)
    || Boolean(coupon.expiresAt && Date.parse(coupon.expiresAt) <= nowMs)
  ) return { ok: false as const, reason: "coupon_unavailable" };

  const [redeemed] = await tx.select({ value: sql<number>`count(*)::int` }).from(couponUses).where(and(
    eq(couponUses.couponId, coupon.id),
    eq(couponUses.status, "redeemed"),
  ));
  const redeemedCount = Number(redeemed?.value || 0);
  const effectiveUsedCount = Math.max(coupon.usedCount, redeemedCount);
  if (coupon.usageLimit !== null && effectiveUsedCount >= coupon.usageLimit) {
    return { ok: false as const, reason: "usage_limit" };
  }

  const transitioned = await tx.update(couponUses)
    .set({ status: "redeemed", redeemedAt: input.now, releasedAt: null })
    .where(and(eq(couponUses.id, reservation.id), eq(couponUses.status, "reserved")))
    .returning({ id: couponUses.id });
  if (!transitioned.length) return { ok: false as const, reason: "transition_conflict" };

  await tx.update(couponsDb).set({
    usedCount: effectiveUsedCount + 1,
    updatedAt: input.now,
  }).where(eq(couponsDb.id, coupon.id));
  await tx.update(userRewards).set({
    status: "redeemed",
    redeemedAt: input.now,
    updatedAt: input.now,
  }).where(and(
    eq(userRewards.userId, reservation.userId),
    eq(userRewards.couponId, coupon.id),
    inArray(userRewards.status, ["active", "disabled"]),
  ));
  return { ok: true as const, couponId: coupon.id, alreadyRedeemed: false };
}

export async function releaseCouponReservation(orderNumber: string) {
  const now = new Date().toISOString();
  await getDb().update(couponUses).set({ status: "released", releasedAt: now }).where(and(eq(couponUses.orderNumber, orderNumber), eq(couponUses.status, "reserved")));
}
