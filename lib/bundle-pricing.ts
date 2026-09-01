export type BundleDiscountType = "percent" | "fixed";

function majorToMinor(value: number) {
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

export function calculateBundleDiscountMinor(discountType: BundleDiscountType, discountValue: number, subtotalMinor: number) {
  if (!Number.isFinite(discountValue) || discountValue <= 0 || subtotalMinor <= 100) return 0;
  const requested = discountType === "percent"
    ? Math.round(subtotalMinor * Math.min(95, discountValue) / 100)
    : majorToMinor(discountValue);
  // Payment providers expect a positive payable amount. Bundle discounts can
  // never reduce an order below one riyal, regardless of stored configuration.
  return Math.max(0, Math.min(requested, subtotalMinor - 100));
}

export function allocateBundleDiscountMinor(pricesMinor: number[], discountMinor: number) {
  const safePrices = pricesMinor.map((price) => Math.max(0, Math.round(price)));
  let remainingSubtotal = safePrices.reduce((sum, price) => sum + price, 0);
  let remainingDiscount = Math.max(0, Math.min(Math.round(discountMinor), remainingSubtotal));
  return safePrices.map((price, index) => {
    if (!remainingDiscount || !price) {
      remainingSubtotal -= price;
      return 0;
    }
    const share = index === safePrices.length - 1 || remainingSubtotal <= price
      ? Math.min(price, remainingDiscount)
      : Math.min(price, Math.round(remainingDiscount * price / remainingSubtotal));
    remainingSubtotal -= price;
    remainingDiscount -= share;
    return share;
  });
}
