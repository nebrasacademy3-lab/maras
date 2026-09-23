import { and, asc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { aiSubscriptionOrders, orders } from "@/db/schema";
import { retrieveAndApplyTapCharge } from "@/lib/tap-webhook";

const OPEN_STATUSES = ["pending", "initiated", "in_progress", "authorized", "verification_pending"];
const MIN_AGE_MS = 2 * 60_000;
const RETRY_INTERVAL_MS = 5 * 60_000;
function reconciliationLimit(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(max, Math.floor(parsed)) : fallback;
}
const MAX_RUN_MS = 45_000;

type Candidate = { kind: "course" | "ai"; id: number; orderNumber: string; tapChargeId: string | null; status: string; updatedAt: string };
export type TapReconciliationResult = { enabled: boolean; checked: number; resolved: number; pending: number; failed: number };

/** Recover missed callbacks without creating charges, expiring ambiguous orders,
 * or overriding finance-review holds. Unknown charge IDs remain for review.
 * CAS claims survive process restarts and prevent concurrent workers from polling
 * the same attempt. The shared fulfillment transaction prevents duplicate grants.
 */
export async function reconcilePendingTapCharges(now = new Date()): Promise<TapReconciliationResult> {
  const secret = process.env.TAP_SECRET_KEY?.trim();
  const result: TapReconciliationResult = { enabled: Boolean(secret), checked: 0, resolved: 0, pending: 0, failed: 0 };
  if (!secret || process.env.TAP_RECONCILIATION_ENABLED?.trim().toLowerCase() === "false") return { ...result, enabled: false };
  const startedAt = Date.now();
  const batchSize = reconciliationLimit(process.env.TAP_RECONCILIATION_BATCH_SIZE, 10, 200);
  const concurrency = reconciliationLimit(process.env.TAP_RECONCILIATION_CONCURRENCY, 2, 8);
  const db = getDb();
  const ageBefore = new Date(now.getTime() - MIN_AGE_MS).toISOString();
  const retryBefore = new Date(now.getTime() - RETRY_INTERVAL_MS).toISOString();
  const fields = (table: typeof orders | typeof aiSubscriptionOrders) => ({ id: table.id, orderNumber: table.orderNumber, tapChargeId: table.tapChargeId, status: table.status, updatedAt: table.updatedAt });
  const [courseRows, aiRows] = await Promise.all([
    db.select(fields(orders)).from(orders).where(and(inArray(orders.status, OPEN_STATUSES), isNotNull(orders.tapChargeId), lte(orders.createdAt, ageBefore), lte(orders.updatedAt, retryBefore))).orderBy(asc(orders.updatedAt), asc(orders.id)).limit(batchSize),
    db.select(fields(aiSubscriptionOrders)).from(aiSubscriptionOrders).where(and(inArray(aiSubscriptionOrders.status, OPEN_STATUSES), isNotNull(aiSubscriptionOrders.tapChargeId), lte(aiSubscriptionOrders.createdAt, ageBefore), lte(aiSubscriptionOrders.updatedAt, retryBefore))).orderBy(asc(aiSubscriptionOrders.updatedAt), asc(aiSubscriptionOrders.id)).limit(batchSize),
  ]);
  const candidates: Candidate[] = [...courseRows.map(row => ({ ...row, kind: "course" as const })), ...aiRows.map(row => ({ ...row, kind: "ai" as const }))].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.id - right.id).slice(0, batchSize);
  let next = 0;
  async function run() {
    while (next < candidates.length && Date.now() - startedAt < MAX_RUN_MS) {
      const candidate = candidates[next++];
      const table = candidate.kind === "course" ? orders : aiSubscriptionOrders;
      const claimedAt = new Date(Math.max(Date.now(), now.getTime())).toISOString();
      const claimed = await db.update(table).set({ updatedAt: claimedAt }).where(and(eq(table.id, candidate.id), eq(table.status, candidate.status), eq(table.updatedAt, candidate.updatedAt), eq(table.tapChargeId, candidate.tapChargeId!))).returning({ id: table.id });
      if (!claimed.length) continue;
      result.checked++;
      try {
        const response = await retrieveAndApplyTapCharge(candidate.tapChargeId!, secret!, false, { kind: candidate.kind, orderNumber: candidate.orderNumber });
        const body = await response.json() as { matched?: boolean; status?: string };
        if (!response.ok || !body.matched) result.failed++;
        else if (body.status && !OPEN_STATUSES.includes(body.status)) result.resolved++;
        else result.pending++;
      } catch {
        // Keep the claim's retry delay on transport, parsing, or transient DB
        // failure. Never release a coupon or infer payment failure from an error.
        result.failed++;
      }
    }
  }
  // A failed claim must not let another worker outlive the scheduler lock.
  const workers = await Promise.allSettled(Array.from({ length: Math.min(concurrency, candidates.length) }, () => run()));
  result.failed += workers.filter(worker => worker.status === "rejected").length;
  return result;
}
