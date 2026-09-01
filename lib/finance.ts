export type FinancePaymentEvent = {
  providerEventId?: string | null;
  status: string;
  payload?: string | null;
};

export type FinanceOrder = {
  orderNumber: string;
  total: number;
  subtotal: number;
  discount: number;
  status: string;
};

export const CAPTURED_ORDER_STATUSES = new Set(["paid", "partially_refunded", "refunded", "payment_review"]);
export const REVIEW_ORDER_STATUSES = new Set(["verification_pending", "payment_review"]);

const FULL_REFUND_STATUSES = new Set(["REFUND", "REFUNDED", "FULLY_REFUNDED"]);
const PARTIAL_REFUND_STATUSES = new Set(["PARTIALLY_REFUNDED", "PARTIAL_REFUND"]);
const FAILED_REFUND_STATUSES = new Set(["FAILED", "DECLINED", "CANCELLED", "CANCELED", "VOID", "VOIDED"]);

export function toMinorUnits(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

export function fromMinorUnits(value: number) {
  return Math.round(value) / 100;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function positiveAmount(value: unknown) {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function parsedPayload(value: string | null | undefined) {
  if (!value) return null;
  try { return record(JSON.parse(value)); } catch { return null; }
}

function directCumulativeAmounts(value: Record<string, unknown>) {
  const candidates = [value.amount_refunded, value.refunded_amount, value.refund_amount];
  const transaction = record(value.transaction);
  if (transaction) candidates.push(transaction.amount_refunded, transaction.refunded_amount, transaction.refund_amount);
  return candidates.map(positiveAmount).filter(Boolean);
}

type RefundEntry = { key: string | null; amount: number };

function nestedRefundEntries(value: Record<string, unknown>, fallbackKey: string) {
  const entries: RefundEntry[] = [];
  const visit = (node: unknown, path: string, refundContext: boolean, depth: number) => {
    if (depth > 7 || node == null) return;
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}.${index}`, refundContext, depth + 1));
      return;
    }
    const item = record(node);
    if (!item) return;
    const status = String(item.status || "").toUpperCase();
    if (refundContext && !FAILED_REFUND_STATUSES.has(status)) {
      const amount = positiveAmount(item.amount ?? item.refund_amount ?? item.refunded_amount);
      if (amount) {
        const identifier = String(item.id || item.refund_id || item.reference || "").trim();
        entries.push({ key: identifier ? `refund:${identifier}` : null, amount });
      }
    }
    for (const [key, child] of Object.entries(item)) {
      const keyIsRefund = /refund/i.test(key);
      if (child && typeof child === "object") visit(child, `${path}.${key}`, refundContext || keyIsRefund, depth + 1);
    }
  };
  visit(value, fallbackKey, false, 0);
  return entries;
}

export type RefundResolution = {
  amount: number;
  complete: boolean;
  source: "none" | "events" | "full_refund" | "missing_partial_amount";
};

/**
 * Resolves refunded value defensively from Tap event snapshots.
 * Refund objects are de-duplicated by provider refund id. Cumulative provider
 * fields use their greatest value, so repeated webhook snapshots never inflate
 * the financial total.
 */
export function resolveRefundAmount(order: Pick<FinanceOrder, "total" | "status">, events: FinancePaymentEvent[]): RefundResolution {
  const totalMinor = Math.max(0, toMinorUnits(order.total));
  if (order.status === "refunded" || events.some((event) => FULL_REFUND_STATUSES.has(event.status.toUpperCase()))) {
    return { amount: fromMinorUnits(totalMinor), complete: true, source: "full_refund" };
  }

  const identified = new Map<string, number>();
  const unidentifiedSnapshots: number[] = [];
  const cumulativeAmounts: number[] = [];
  let partialSignal = order.status === "partially_refunded";

  events.forEach((event, eventIndex) => {
    const eventStatus = event.status.toUpperCase();
    if (PARTIAL_REFUND_STATUSES.has(eventStatus) || eventStatus === "REFUND_REFUNDED") partialSignal = true;
    const payload = parsedPayload(event.payload);
    if (!payload) return;
    if (String(payload.object || "").toLowerCase() === "refund" && eventStatus === "REFUND_REFUNDED") {
      const amount = positiveAmount(payload.amount);
      const identifier = String(payload.id || "").trim();
      if (amount && identifier) identified.set(`refund:${identifier}`, Math.max(identified.get(`refund:${identifier}`) || 0, amount));
    }
    cumulativeAmounts.push(...directCumulativeAmounts(payload));
    for (const entry of nestedRefundEntries(payload, `event:${event.providerEventId || eventIndex}`)) {
      if (entry.key) identified.set(entry.key, Math.max(identified.get(entry.key) || 0, entry.amount));
      else unidentifiedSnapshots.push(entry.amount);
    }
  });

  const identifiedMinor = [...identified.values()].reduce((sum, amount) => sum + toMinorUnits(amount), 0);
  const cumulativeMinor = Math.max(0, ...cumulativeAmounts.map(toMinorUnits));
  // Anonymous nested refund snapshots may describe the same refund more than
  // once, so only their largest snapshot is considered.
  const anonymousMinor = Math.max(0, ...unidentifiedSnapshots.map(toMinorUnits));
  const resolvedMinor = Math.min(totalMinor, Math.max(identifiedMinor, cumulativeMinor, anonymousMinor));

  if (resolvedMinor > 0) return { amount: fromMinorUnits(resolvedMinor), complete: true, source: "events" };
  if (partialSignal) return { amount: 0, complete: false, source: "missing_partial_amount" };
  return { amount: 0, complete: true, source: "none" };
}

export function financeMetrics(
  orders: FinanceOrder[],
  eventsByOrder: Map<string, FinancePaymentEvent[]>,
  taxByOrder: Map<string, number> = new Map(),
) {
  let grossMinor = 0;
  let refundMinor = 0;
  let discountMinor = 0;
  let taxMinor = 0;
  let capturedOrders = 0;
  let unresolvedRefundOrders = 0;

  for (const order of orders) {
    if (!CAPTURED_ORDER_STATUSES.has(order.status)) continue;
    capturedOrders += 1;
    grossMinor += toMinorUnits(order.total);
    discountMinor += toMinorUnits(order.discount);
    taxMinor += toMinorUnits(taxByOrder.get(order.orderNumber) || 0);
    const refund = resolveRefundAmount(order, eventsByOrder.get(order.orderNumber) || []);
    refundMinor += toMinorUnits(refund.amount);
    if (!refund.complete) unresolvedRefundOrders += 1;
  }

  const netMinor = Math.max(0, grossMinor - refundMinor);
  return {
    gross: fromMinorUnits(grossMinor),
    refunds: fromMinorUnits(refundMinor),
    net: fromMinorUnits(netMinor),
    discounts: fromMinorUnits(discountMinor),
    tax: fromMinorUnits(taxMinor),
    capturedOrders,
    averageOrderValue: capturedOrders ? fromMinorUnits(Math.round(grossMinor / capturedOrders)) : 0,
    unresolvedRefundOrders,
  };
}

export function financeDateRange(from: string, to: string) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const fromMs = datePattern.test(from) ? Date.parse(`${from}T00:00:00+03:00`) : Number.NaN;
  const toMs = datePattern.test(to) ? Date.parse(`${to}T23:59:59.999+03:00`) : Number.NaN;
  return {
    from: Number.isFinite(fromMs) ? fromMs : null,
    to: Number.isFinite(toMs) ? toMs : null,
  };
}

export function csvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
