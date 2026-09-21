import assert from "node:assert/strict";
import test from "node:test";
import { isolated, tables, database, and, eq } from "./helpers/business-fixtures.mjs";
const lte = (column, value) => ({ kind: "lte", column, value });
const inArray = (column, value) => ({ kind: "inArray", column, value });
const isNotNull = column => ({ kind: "isNotNull", column });
const asc = column => column;
const now = () => new Date(Date.now() + 1000);
const old = new Date(Date.now() - 20 * 60_000).toISOString();
const row = (id, extra = {}) => ({ id, orderNumber: "ORDER-" + id, tapChargeId: "chg_" + id, status: "verification_pending", updatedAt: old, createdAt: old, ...extra });
async function service(db, retrieveAndApplyTapCharge, env = { TAP_SECRET_KEY: "sk_synthetic" }) {
  return isolated("../lib/tap-reconciliation.ts", { ...tables, and, eq, lte, inArray, isNotNull, asc, getDb: () => db, retrieveAndApplyTapCharge, process: { env } });
}

test("unconfigured and disabled reconciliation never accesses provider or database", async () => {
  for (const env of [{}, { TAP_SECRET_KEY: "  " }, { TAP_SECRET_KEY: "sk_synthetic", TAP_RECONCILIATION_ENABLED: "false" }]) {
    const worker = await service(null, () => { throw Error("network forbidden"); }, env);
    assert.deepEqual(await worker.reconcilePendingTapCharges(), { enabled: false, checked: 0, resolved: 0, pending: 0, failed: 0 });
  }
});

test("only committed stale known charges are eligible and finance holds remain untouched", async () => {
  const db = database({ orders: [row(1), row(2, { status: "payment_review" }), row(3, { status: "paid" }), row(4, { tapChargeId: null }), row(5, { createdAt: now().toISOString() }), row(6, { updatedAt: now().toISOString() })], aiSubscriptionOrders: [row(7, { orderNumber: "AI-7", status: "initiated" })] });
  const seen = [];
  const worker = await service(db, async (id, secret, signatureVerified, expected) => { seen.push({ id, secret, signatureVerified, expected }); return Response.json({ matched: true, status: "paid" }); });
  const result = await worker.reconcilePendingTapCharges(now());
  assert.equal(result.checked, 2);
  assert.equal(result.resolved, 2);
  assert.deepEqual(seen.map(value => value.expected).sort((a,b) => a.kind.localeCompare(b.kind)), [{ kind: "ai", orderNumber: "AI-7" }, { kind: "course", orderNumber: "ORDER-1" }]);
  assert.ok(seen.every(value => value.secret === "sk_synthetic" && value.signatureVerified === false));
  assert.equal(db.rows.orders[1].status, "payment_review");
  assert.equal(db.rows.orders[1].updatedAt, old);
  assert.equal(db.rows.orders[3].updatedAt, old, "unknown charge ID cannot be retried as a new charge");
});

test("two simultaneous reconciliation workers claim each charge only once", async () => {
  const db = database({ orders: [row(1)] });
  let retrievals = 0;
  const worker = await service(db, async () => { retrievals++; await new Promise(resolve => setTimeout(resolve, 10)); return Response.json({ matched: true, status: "paid" }); });
  const results = await Promise.all([worker.reconcilePendingTapCharges(now()), worker.reconcilePendingTapCharges(now())]);
  assert.equal(retrievals, 1);
  assert.equal(results.reduce((total, result) => total + result.checked, 0), 1);
});

test("provider errors preserve pending state and enforce a persisted retry interval", async () => {
  const db = database({ orders: [row(1)] });
  let retrievals = 0;
  const worker = await service(db, async () => { retrievals++; throw Error("network timeout"); });
  const start = now();
  assert.equal((await worker.reconcilePendingTapCharges(start)).failed, 1);
  assert.equal(db.rows.orders[0].status, "verification_pending");
  assert.equal((await worker.reconcilePendingTapCharges(new Date(start.getTime() + 4 * 60_000))).checked, 0);
  assert.equal((await worker.reconcilePendingTapCharges(new Date(start.getTime() + 6 * 60_000))).failed, 1);
  assert.equal(retrievals, 2);
  assert.equal(db.rows.couponUses.length, 0);
});

test("backlog batches stay bounded and failed early rows cannot starve the rest", async () => {
  const db = database({ orders: Array.from({ length: 12 }, (_, index) => row(index + 1)), aiSubscriptionOrders: Array.from({ length: 12 }, (_, index) => row(index + 101)) });
  const seen = new Set();
  let active = 0, peak = 0;
  const worker = await service(db, async id => { seen.add(id); active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 2)); active--; return Response.json({ error: "unavailable" }, { status: 502 }); });
  assert.equal((await worker.reconcilePendingTapCharges(now())).checked, 10);
  assert.equal((await worker.reconcilePendingTapCharges(now())).checked, 10);
  assert.equal((await worker.reconcilePendingTapCharges(now())).checked, 4);
  assert.equal(seen.size, 24);
  assert.ok(peak <= 2);
});

test("a callback that commits before a polling claim wins without another retrieval", async () => {
  const db = database({ orders: [row(1)] });
  const update = db.update;
  db.update = table => { db.rows.orders[0].status = "paid"; return update(table); };
  const worker = await service(db, () => { throw Error("should not retrieve captured row"); });
  assert.equal((await worker.reconcilePendingTapCharges(now())).checked, 0);
  assert.equal(db.rows.orders[0].status, "paid");
});


test("a failed claim waits for the other worker before the scheduler may release its lock", async () => {
  const db = database({ orders: [row(1), row(2)] });
  const update = db.update;
  let claims = 0, finished = false;
  db.update = table => { if (++claims === 1) throw Error("transient claim failure"); return update(table); };
  const worker = await service(db, async () => { await new Promise(resolve => setTimeout(resolve, 10)); finished = true; return Response.json({ matched: true, status: "paid" }); });
  const result = await worker.reconcilePendingTapCharges(now());
  assert.equal(finished, true);
  assert.equal(result.failed, 1);
  assert.equal(result.checked, 1);
  assert.equal(result.resolved, 1);
});
