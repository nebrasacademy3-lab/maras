export type SettlementAmounts = {
  grossMinor: number;
  refundMinor: number;
  feeMinor: number;
  taxMinor: number;
  netMinor: number;
};

export type SettlementOrder = {
  id: number;
  orderNumber: string;
  tapChargeId: string | null;
  currency: string;
  status: string;
  total: number;
  totalMinor: number | null;
};

export type SettlementMatchStatus =
  | "matched"
  | "unmatched"
  | "duplicate_order"
  | "identifier_conflict"
  | "currency_mismatch"
  | "order_not_captured"
  | "gross_mismatch"
  | "refund_mismatch"
  | "refund_status_mismatch"
  | "arithmetic_mismatch";

const THREE_DECIMAL_CURRENCIES = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);
const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW"]);
const CAPTURED_STATUSES = new Set(["paid", "partially_refunded", "refunded", "payment_review"]);

export function currencyMinorDigits(currency: string) {
  const normalized = currency.trim().toUpperCase();
  if (THREE_DECIMAL_CURRENCIES.has(normalized)) return 3;
  if (ZERO_DECIMAL_CURRENCIES.has(normalized)) return 0;
  return 2;
}

export function parseSettlementMinor(value: unknown, currency: string, options: { allowBlank?: boolean; allowNegative?: boolean } = {}) {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!text) return options.allowBlank ? 0 : null;
  const digits = currencyMinorDigits(currency);
  const pattern = digits === 0 ? /^-?\d+$/ : new RegExp(`^-?\\d+(?:\\.\\d{1,${digits}})?$`);
  if (!pattern.test(text) || (!options.allowNegative && text.startsWith("-"))) return null;
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = unsigned.split(".");
  const scale = BigInt(10) ** BigInt(digits);
  const minor = BigInt(whole) * scale + BigInt(fraction.padEnd(digits, "0") || "0");
  const signed = negative ? -minor : minor;
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) return null;
  return Number(signed);
}

export function amountToMinor(value: number, currency: string) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** currencyMinorDigits(currency);
  const minor = Math.round(value * factor);
  return Number.isSafeInteger(minor) ? minor : null;
}

export function settlementArithmeticMatches(amounts: SettlementAmounts) {
  const expectedNet = amounts.grossMinor - amounts.refundMinor - amounts.feeMinor - amounts.taxMinor;
  return Math.abs(expectedNet - amounts.netMinor) <= 1;
}

export function resolveSettlementMatch(input: {
  currency: string;
  orderNumber: string | null;
  chargeId: string | null;
  amounts: SettlementAmounts;
  confirmedRefundMinor?: number | null;
  orderByNumber?: SettlementOrder;
  orderByCharge?: SettlementOrder;
}): { order: SettlementOrder | null; status: SettlementMatchStatus } {
  const { orderByNumber, orderByCharge } = input;
  if (orderByNumber && orderByCharge && orderByNumber.id !== orderByCharge.id) return { order: null, status: "identifier_conflict" };
  const order = orderByNumber || orderByCharge || null;
  if (!order) return { order: null, status: "unmatched" };
  if (input.orderNumber && order.orderNumber !== input.orderNumber) return { order: null, status: "identifier_conflict" };
  if (input.chargeId && order.tapChargeId !== input.chargeId) return { order: null, status: "identifier_conflict" };
  if (order.currency.toUpperCase() !== input.currency.toUpperCase()) return { order, status: "currency_mismatch" };
  if (!CAPTURED_STATUSES.has(order.status)) return { order, status: "order_not_captured" };
  const orderTotalMinor = currencyMinorDigits(order.currency) === 2 && order.totalMinor != null && Number.isSafeInteger(order.totalMinor)
    ? order.totalMinor
    : amountToMinor(order.total, order.currency);
  if (orderTotalMinor == null || input.amounts.grossMinor !== orderTotalMinor) return { order, status: "gross_mismatch" };
  if (input.amounts.refundMinor > input.amounts.grossMinor) return { order, status: "refund_mismatch" };
  const refundStatus = ["partially_refunded", "refunded"].includes(order.status);
  if (input.confirmedRefundMinor != null) {
    if (!Number.isSafeInteger(input.confirmedRefundMinor)
      || input.confirmedRefundMinor < 0
      || input.confirmedRefundMinor > input.amounts.grossMinor
      || input.amounts.refundMinor !== input.confirmedRefundMinor) return { order, status: "refund_mismatch" };
    if ((input.confirmedRefundMinor > 0) !== refundStatus) return { order, status: "refund_status_mismatch" };
  } else if (input.amounts.refundMinor > 0 && !refundStatus) return { order, status: "refund_status_mismatch" };
  if (!settlementArithmeticMatches(input.amounts)) return { order, status: "arithmetic_mismatch" };
  return { order, status: "matched" };
}
