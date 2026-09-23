import assert from "node:assert/strict";
import test from "node:test";
import { isolated, tables, database, and, eq, sql } from "./helpers/business-fixtures.mjs";
const api = await isolated("../lib/api.ts");
const refunds = await isolated("../lib/refunds.ts");
const tap = await isolated("../lib/tap-payments.ts");
const adminApprovals = new Proxy({ _name: "adminApprovals" }, { get: (target, key) => key === "_name" ? target._name : { table: target._name, key } });
const request = () => new Request("https://example.test/api/admin/refunds", { method: "POST", body: JSON.stringify({ action: "approve", id: 1 }) });
async function fixture(responseFactory) {
 const db = database({ orders: [{ id: 1, orderNumber: "ORDER-1", userId: 1, tapChargeId: "chg_fixture", currency: "SAR", status: "paid", total: 100, totalMinor: 10000 }], refundRequests: [{ id: 1, requestNumber: "REFUND-1", orderNumber: "ORDER-1", amountMinor: 1000, currency: "SAR", status: "first_approved", requestedByEmail: "maker@example.test", reason: "synthetic refund" }] });
 function wrap(connection) {
  return { ...connection,
   select: fields => { const query = connection.select(fields); return { from: table => table === adminApprovals ? { where: async () => [{ value: 2 }] } : query.from(table) }; },
   insert: table => table === adminApprovals ? { values: () => ({ onConflictDoNothing: async () => {} }) } : connection.insert(table),
   transaction: callback => connection.transaction(tx => callback(wrap(tx))),
  };
 }
 let calls = 0;
 const route = await isolated("../app/api/admin/refunds/route.ts", {
  ...tables, ...api, ...refunds, ...tap, and, eq, sql, adminApprovals,
  getDb: () => wrap(db), authorizePermission: async () => ({ id: 2, email: "checker@example.test" }), ADMIN_PERMISSIONS: { FINANCE_MANAGE: "manage" }, sameOriginRequest: () => true, checkRateLimit: async () => true, clientIp: () => "127.0.0.1", requireAdminStepUp: async () => {},
  resolveRefundAmount: () => ({ amount: 0 }), toMinorUnits: value => Math.round(value * 100), requestOrigin: () => "https://example.test",
  process: { env: { TAP_SECRET_KEY: "sk_synthetic_only" } },
  fetch: async (url, options) => { calls++; assert.equal(url, "https://api.tap.company/v2/refunds/"); assert.equal(options.redirect, "error"); assert.equal(JSON.parse(options.body).reference.idempotent, "REFUND-1"); return responseFactory(); },
  reconcileRefundRequest: async input => { Object.assign(db.rows.refundRequests[0], { status: input.status, providerRefundId: input.providerRefundId || null }); return { ok: true }; },
  applyConfirmedRefundToOrder: async () => ({ ok: true, newlyFullyRefunded: false }), issueCreditNote: async () => {}, createAndSendNotification: async () => {},
 });
 return { db, calls: () => calls, run: () => route.POST(request()) };
}

test("uncertain Tap refund creation stays reserved and a repeated approval cannot send another refund", async () => {
 const responses = [
  ...[null, [], {}].map(value => () => Response.json(value)),
  () => new Response("not-json", { status: 200 }),
  ...[408, 409, 425, 429, 500, 502, 503, 504].map(status => () => Response.json({}, { status })),
  () => Response.json({ id: "re_mismatch", object: "refund", charge_id: "chg_other", amount: 10, currency: "SAR" }, { status: 400 }),
 ];
 for (const response of responses) {
  const f = await fixture(response);
  assert.equal((await f.run()).status, 502);
  assert.equal(f.db.rows.refundRequests[0].status, "provider_pending");
  assert.equal(f.db.rows.paymentEvents.length, 0);
  assert.equal((await f.run()).status, 409);
  assert.equal(f.calls(), 1);
 }
});

test("a definite provider rejection remains available for finance review", async () => {
 for (const status of [400, 401, 403, 404, 422]) {
  const f = await fixture(() => Response.json({ message: "Synthetic rejection" }, { status }));
  assert.equal((await f.run()).status, 502);
  assert.equal(f.db.rows.refundRequests[0].status, "provider_failed");
  assert.equal(f.db.rows.paymentEvents.length, 0);
 }
});

test("confirmed API refund records provider truth without falsely claiming a signed webhook", async () => {
 const f = await fixture(() => Response.json({ id: "re_fixture", object: "refund", charge_id: "chg_fixture", amount: 10, currency: "SAR", status: "REFUNDED", created: "1726790400000" }));
 assert.equal((await f.run()).status, 200);
 assert.equal(f.db.rows.refundRequests[0].status, "completed");
 assert.equal(f.db.rows.paymentEvents.length, 1);
 assert.equal(f.db.rows.paymentEvents[0].signatureVerified, false);
 assert.equal(f.db.rows.paymentEvents[0].amountMinor, 1000);
});
