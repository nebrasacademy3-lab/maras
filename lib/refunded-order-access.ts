import { and, eq, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { courseAccess, courseAccessEvents, users } from "@/db/schema";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Call only after locking and verifying the stored order in the same transaction.
 * Refunds remain recordable for legacy unresolved orders, but snapshots never select an owner.
 * Unlike granting, revocation is permitted for inactive accounts too.
 */
export async function revokeRefundedOrderAccessTx(tx: Tx, order: { userId: number | null; orderNumber: string }, now: string) {
  const userId = order.userId;
  if (!Number.isSafeInteger(userId) || !userId || userId < 1) return;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId})`);
  const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1).for("update");
  if (!owner) return;
  const affected = await tx.select({ id: courseAccess.id, courseSlug: courseAccess.courseSlug }).from(courseAccess)
    .where(and(eq(courseAccess.userId, userId), eq(courseAccess.orderNumber, order.orderNumber)));
  for (const candidate of affected.sort((a, b) => a.courseSlug.localeCompare(b.courseSlug))) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`course-access:${userId}:${candidate.courseSlug}`}))`);
    const ownedOrder = and(eq(courseAccess.id, candidate.id), eq(courseAccess.userId, userId),
      eq(courseAccess.courseSlug, candidate.courseSlug), eq(courseAccess.orderNumber, order.orderNumber));
    // A renewal may have replaced the old order while a lock was being acquired.
    const [access] = await tx.select().from(courseAccess).where(ownedOrder).limit(1).for("update");
    if (!access) continue;
    if (!access.revokedAt) await tx.update(courseAccess).set({ revokedAt: now, revocationReason: "payment_refunded", suspendedAt: null, suspensionReason: null, updatedAt: now }).where(ownedOrder);
    await tx.insert(courseAccessEvents).values({
      eventKey: `order:${order.orderNumber}:refund:${access.courseSlug}`,
      accessId: access.id, userId, userEmail: access.userEmail, courseSlug: access.courseSlug,
      action: "refund_revoked", actorEmail: "tap-webhook", reason: "payment_refunded", orderNumber: order.orderNumber,
      beforeJson: JSON.stringify(access), afterJson: JSON.stringify({ revokedAt: access.revokedAt || now }), createdAt: now,
    }).onConflictDoNothing({ target: courseAccessEvents.eventKey });
  }
}
