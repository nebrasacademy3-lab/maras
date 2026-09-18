import "server-only";
import { eq, sql } from "drizzle-orm";
import type { getDb } from "@/db";
import { users } from "@/db/schema";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class OrderOwnershipError extends Error {
  readonly status = 409;
  constructor(readonly code: "ORDER_OWNER_UNRESOLVED" | "ORDER_OWNER_UNAVAILABLE") {
    super(code === "ORDER_OWNER_UNRESOLVED"
      ? "ملكية الطلب تحتاج مراجعة موثقة قبل تفعيل الوصول. لم يُمنح محتوى لحساب آخر."
      : "حساب صاحب الطلب غير متاح للتفعيل. يلزم مراجعة الطلب.");
    this.name = "OrderOwnershipError";
  }
}

/** The supplied ID must come from the stored order or authenticated session, never a request body.
 * Historical customerEmail is a payment snapshot, not a lookup key or login alias.
 * The account lock is shared with identity changes, deletion and device enrollment.
 */
export async function lockOrderOwnerTx(tx: Tx, order: { userId: number | null }) {
  const id = order.userId;
  if (!Number.isSafeInteger(id) || !id || id < 1) throw new OrderOwnershipError("ORDER_OWNER_UNRESOLVED");
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${id})`);
  const [owner] = await tx.select({ id: users.id, email: users.email, status: users.status })
    .from(users).where(eq(users.id, id)).limit(1).for("update");
  if (!owner || owner.status !== "active") throw new OrderOwnershipError("ORDER_OWNER_UNAVAILABLE");
  return owner;
}
