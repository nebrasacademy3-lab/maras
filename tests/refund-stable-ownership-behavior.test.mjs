import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { nativeSource } from "./helpers/native-source.mjs";
import { ownershipDatabase, and, eq, sql } from "./helpers/ownership-database.mjs";

async function fixture({ userId = 10, amount = 100, status = "paid", accountStatus = "active" } = {}) {
  const h = ownershipDatabase(["users", "orders", "courseAccess", "courseAccessEvents", "paymentEvents", "refundRequests", "creditNotes", "invoices"], {
    users: [{ id: 10, email: "changed@example.test", status: accountStatus }, { id: 20, email: "reused@example.test", status: "active" }],
    orders: [{ id: 1, userId, orderNumber: "OLD", customerEmail: "reused@example.test", tapChargeId: "chg_test", currency: "SAR", totalMinor: 10000, status }],
    paymentEvents: [1, 2].map(id => ({ id, chargeId: "chg_test", status: "REFUND_REFUNDED", payload: JSON.stringify({ id: "re_test", amount, status: "REFUNDED" }) })),
    courseAccess: [
      { id: 1, userId: 10, userEmail: "changed@example.test", courseSlug: "a", orderNumber: "OLD", revokedAt: null, suspendedAt: null },
      { id: 2, userId: 20, userEmail: "reused@example.test", courseSlug: "a", orderNumber: "OLD", revokedAt: null },
      { id: 3, userId: null, userEmail: "reused@example.test", courseSlug: "a", orderNumber: "OLD", revokedAt: null },
      { id: 4, userId: 10, userEmail: "changed@example.test", courseSlug: "b", orderNumber: "NEW", revokedAt: null },
    ],
  });
  const revoke = await nativeSource("lib/refunded-order-access.ts", { ...h.tables, and, eq, sql });
  const refunds = await nativeSource("lib/refunds.ts", { ...h.tables, eq, sql, getDb: () => h.db, ...revoke });
  return { ...h, ...refunds, ...revoke, apply: () => refunds.applyConfirmedRefundToOrder({ orderNumber: "OLD", chargeId: "chg_test" }) };
}

test("confirmed refund revokes only its stable owner's access, never reused-email or unresolved rows", async () => {
  const h = await fixture();
  const before = structuredClone(h.rows.courseAccess);
  const result = await h.apply();
  assert.equal(result.status, "refunded");
  assert.equal(result.refundedAmountMinor, 10000, "duplicate provider events are counted once");
  assert.ok(h.rows.courseAccess[0].revokedAt);
  assert.deepEqual(h.rows.courseAccess.slice(1), before.slice(1));
  assert.equal(h.rows.courseAccessEvents.length, 1);
  assert.equal(h.rows.courseAccessEvents[0].userId, 10);
  assert.equal(h.rows.courseAccessEvents[0].userEmail, "changed@example.test");
  assert.deepEqual(h.locks, ["OLD", 10, "course-access:10:a"]);
});

test("an unresolved order can be financially refunded without guessing or revoking any account", async () => {
  const h = await fixture({ userId: null });
  const before = structuredClone(h.rows.courseAccess);
  assert.equal((await h.apply()).status, "refunded");
  assert.deepEqual(h.rows.courseAccess, before);
  assert.equal(h.rows.courseAccessEvents.length, 0);
  assert.deepEqual(h.locks, ["OLD"]);
});

test("refund is repeatable for inactive owners without rewriting original revocation or audit", async () => {
  const h = await fixture({ accountStatus: "disabled" });
  assert.equal((await h.apply()).newlyFullyRefunded, true);
  const before = structuredClone(h.rows);
  const result = await h.apply();
  assert.equal(result.newlyFullyRefunded, false);
  assert.equal(result.changed, false);
  assert.deepEqual(h.rows, before);
});

test("partial refunds and invalid totals never revoke access", async () => {
  for (const amount of [25, 101, 0]) {
    const h = await fixture({ amount });
    const before = structuredClone(h.rows.courseAccess);
    const result = await h.apply();
    assert.equal(result.ok, amount === 25);
    assert.deepEqual(h.rows.courseAccess, before);
    assert.equal(h.rows.courseAccessEvents.length, 0);
    assert.deepEqual(h.locks, ["OLD"]);
  }
});

test("a replacement order that wins the course lock is re-read and cannot be revoked by a stale refund", async () => {
  const h = await fixture();
  const originalExecute = h.db.execute;
  h.db.execute = async value => {
    const output = await originalExecute(value);
    if (value.values.includes("course-access:10:a")) h.rows.courseAccess[0].orderNumber = "NEW";
    return output;
  };
  assert.equal((await h.apply()).status, "refunded");
  assert.equal(h.rows.courseAccess[0].orderNumber, "NEW");
  assert.equal(h.rows.courseAccess[0].revokedAt, null);
  assert.equal(h.rows.courseAccessEvents.length, 0);
});

test("refund audit failure rolls back the order status and access revocation", async () => {
  const h = await fixture();
  const before = structuredClone(h.rows);
  h.db.insert = () => { throw new Error("synthetic audit failure"); };
  await assert.rejects(h.apply(), /synthetic audit failure/);
  assert.deepEqual(h.rows, before);
  assert.equal(h.committed(), false);
});

test("both managed refunds and charge webhooks use the same locked revocation implementation", async () => {
  for (const path of ["lib/refunds.ts", "lib/tap-webhook.ts"]) {
    const source = await readFile(new URL("../" + path, import.meta.url), "utf8");
    assert.match(source, /import \{ revokeRefundedOrderAccessTx \} from "@\/lib\/refunded-order-access"/);
    assert.match(source, /await revokeRefundedOrderAccessTx\(tx, current, now\)/);
    assert.doesNotMatch(source, /action: "refund_revoked"/);
  }
});
