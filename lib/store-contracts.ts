import { createHash, timingSafeEqual } from "node:crypto";

export class StoreError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export type VerifiedStorePurchase = {
  providerPurchaseId: string; transactionId: string; productId: string; store: "app_store" | "play_store";
  environment: "sandbox" | "production"; purchasedAt: string; status: "owned" | "refunded";
};
export function storeTransactionKey(p: Pick<VerifiedStorePurchase,"environment"|"store"|"transactionId">) {
  return createHash("sha256").update(JSON.stringify([p.environment,p.store,p.transactionId])).digest("hex");
}
export function validWebhookAuthorization(value: string | null, secret: string) {
  if (secret.length < 32 || /example|change.?me|replace/i.test(secret)) return false;
  const actual = createHash("sha256").update(value || "").digest();
  const expected = createHash("sha256").update("Bearer " + secret).digest();
  return timingSafeEqual(actual, expected);
}
export function parseStorePurchase(raw: Record<string, unknown>, accountId: string, environment: string): VerifiedStorePurchase {
  if (raw.customer_id !== accountId || raw.original_customer_id !== accountId || raw.ownership !== "purchased")
    throw new StoreError("STORE_OWNER_MISMATCH", "المعاملة مرتبطة بحساب آخر. تواصل مع الدعم.", 409);
  if (raw.environment !== environment || !["app_store","play_store"].includes(String(raw.store)))
    throw new StoreError("STORE_ENVIRONMENT_MISMATCH", "بيئة الشراء أو المتجر غير مطابق.", 409);
  if (!["owned","refunded"].includes(String(raw.status)) || raw.quantity !== 1)
    throw new StoreError("STORE_PURCHASE_UNSUPPORTED", "حالة الشراء تحتاج مراجعة.", 409);
  const timestamp = Number(raw.purchased_at);
  if (!Number.isSafeInteger(timestamp) || timestamp < 1262304000000 || timestamp > Date.now()+300000)
    throw new StoreError("STORE_INVALID_PURCHASE", "تاريخ الشراء غير صالح.", 502);
  const id = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 255 ? value : null;
  const transactionId = id(typeof raw.store_purchase_identifier === "number" && Number.isSafeInteger(raw.store_purchase_identifier) ? String(raw.store_purchase_identifier) : raw.store_purchase_identifier);
  if (!transactionId || !id(raw.id) || !id(raw.product_id)) throw new StoreError("STORE_INVALID_PURCHASE", "بيانات الشراء غير مكتملة.", 502);
  return {
    providerPurchaseId: String(raw.id), transactionId, productId: String(raw.product_id),
    store: raw.store as VerifiedStorePurchase["store"], environment: raw.environment as VerifiedStorePurchase["environment"],
    status: raw.status as VerifiedStorePurchase["status"], purchasedAt: new Date(timestamp).toISOString(),
  };
}
export function nextStorePeriod(purchasedAt: string, days: number | null, previousEnds: Array<string | null>) {
  if (days === null) return { startsAt: purchasedAt, expiresAt: null };
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new StoreError("STORE_INVALID_DURATION", "مدة المنتج غير صالحة.");
  const starts = Math.max(Date.parse(purchasedAt), ...previousEnds.filter((v): v is string => !!v).map(Date.parse));
  return { startsAt: new Date(starts).toISOString(), expiresAt: new Date(starts + days*86400000).toISOString() };
}
