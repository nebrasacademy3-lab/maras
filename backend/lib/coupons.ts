import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { couponsDb } from "@/db/schema";

export type CouponQuote = {
  code: string;
  discount: number;
  total: number;
  label: string;
};

const money = (value: number) => Math.round(value * 100) / 100;

export async function quoteCoupon(rawCode: string, courseSlug: string, price: number): Promise<CouponQuote | null> {
  const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);
  if (!code) return null;
  const db = getDb();
  const [coupon] = await db.select().from(couponsDb).where(eq(couponsDb.code, code)).limit(1);
  if (!coupon || coupon.status !== "active") return null;
  const now = Date.now();
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) return null;
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < now) return null;
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return null;
  if (coupon.courseSlug && coupon.courseSlug !== courseSlug) return null;
  const requested = coupon.type === "percent" ? price * Math.min(coupon.value, 95) / 100 : coupon.value;
  const discount = money(Math.min(Math.max(0, requested), Math.max(0, price - 1)));
  if (discount <= 0) return null;
  return {
    code,
    discount,
    total: money(price - discount),
    label: coupon.type === "percent" ? `خصم ${Math.min(coupon.value, 95)}%` : `خصم ${money(discount)} ر.س`,
  };
}
