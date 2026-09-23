import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { aiSubscriptionOrders, orders } from "@/db/schema";
import { checkRateLimit } from "@/lib/auth";
import { retrieveAndApplyTapCharge } from "@/lib/tap-webhook";

const RECOVERABLE = new Set(["pending", "initiated", "in_progress", "authorized", "verification_pending"]);

/** Refresh only a stored charge belonging to this account. Browser query strings
 * are never trusted as provider IDs or financial truth. The persistent limiter
 * is shared across app replicas; callbacks and recovery share fulfillment locks.
 */
export async function refreshOwnedTapOrder(kind: "course" | "ai", orderNumber: string, userId: number) {
  const secret = process.env.TAP_SECRET_KEY?.trim();
  if (!secret || !Number.isSafeInteger(userId) || userId < 1) return false;
  try {
    const table = kind === "course" ? orders : aiSubscriptionOrders;
    const [order] = await getDb().select({ status: table.status, chargeId: table.tapChargeId }).from(table)
      .where(and(eq(table.orderNumber, orderNumber), eq(table.userId, userId))).limit(1);
    if (!order || !RECOVERABLE.has(order.status) || !order.chargeId || !/^chg_[A-Za-z0-9_-]{1,150}$/.test(order.chargeId)) return false;
    if (!await checkRateLimit("tap-return-verification", `${kind}:${orderNumber}`, 1, 15)) return false;
    const response = await retrieveAndApplyTapCharge(order.chargeId, secret, false, { kind, orderNumber });
    return response.ok;
  } catch {
    // A provider/DB failure cannot infer payment failure or create a new charge.
    // Leave the persisted result and scheduled reconciliation available.
    return false;
  }
}
