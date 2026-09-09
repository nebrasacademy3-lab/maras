// Verified callbacks can arrive after a later financial transition has committed.
// Refunds and captured payments must never be undone by an older charge status.
export function isStaleChargeStatus(current: string, incoming: string) {
  if (current === "refunded") return incoming !== "refunded";
  if (current === "partially_refunded") return !["partially_refunded", "refunded"].includes(incoming);
  if (["paid", "payment_review"].includes(current)) return !["paid", "partially_refunded", "refunded"].includes(incoming);
  return false;
}
