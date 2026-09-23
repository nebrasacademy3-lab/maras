import assert from "node:assert/strict";
import test from "node:test";
import { isolated, tables, database, eq, and } from "./helpers/business-fixtures.mjs";
async function fixture({ owner = 1, status = "initiated", charge = "chg_stored", kind = "course", failed = false, configured = true } = {}) {
 const table = kind === "course" ? "orders" : "aiSubscriptionOrders";
 const db = database({ [table]: [{ id: 1, userId: owner, orderNumber: "ORDER-1", status, tapChargeId: charge }] });
 let lookups = 0, claims = 0;
 const service = await isolated("../lib/tap-return.ts", { ...tables, eq, and, getDb: () => db, process: { env: configured ? { TAP_SECRET_KEY: "synthetic" } : {} }, checkRateLimit: async (scope, key, limit, window) => { assert.deepEqual([scope, key, limit, window], ["tap-return-verification", `${kind}:ORDER-1`, 1, 15]); return ++claims === 1; }, retrieveAndApplyTapCharge: async (id, secret, signed, expected) => { lookups++; assert.equal(id, "chg_stored"); assert.equal(secret, "synthetic"); assert.equal(signed, false); assert.deepEqual(expected, { kind, orderNumber: "ORDER-1" }); if (failed) throw Error("provider unavailable"); return Response.json({ matched: true, status: "paid" }); } });
 return { run: (user = 1) => service.refreshOwnedTapOrder(kind, "ORDER-1", user), lookups: () => lookups, claims: () => claims, db };
}

test("return verification recovers the account's stored course and AI charges and throttles repeated polling", async () => {
 for (const kind of ["course", "ai"]) {
  const f = await fixture({ kind });
  assert.equal(await f.run(), true);
  assert.equal(await f.run(), false);
  assert.equal(f.lookups(), 1);
 }
});
test("another owner's order, missing charge, terminal states and review holds cannot trigger provider lookups", async () => {
 for (const spec of [{ owner: 2 }, { charge: null }, { charge: "chg_bad/path" }, { status: "paid" }, { status: "refunded" }, { status: "partially_refunded" }, { status: "payment_review" }, { status: "failed" }, { configured: false }]) {
  const f = await fixture(spec);
  assert.equal(await f.run(), false);
  assert.equal(f.lookups(), 0); assert.equal(f.claims(), 0); assert.equal(f.db.writes.length, 0);
 }
});
test("provider failure leaves the saved result and grants unchanged for scheduled recovery", async () => {
 const f = await fixture({ failed: true, status: "verification_pending" });
 assert.equal(await f.run(), false);
 assert.equal(f.db.rows.orders[0].status, "verification_pending");
 assert.equal(f.db.writes.length, 0);
});


test("course and AI status routes return the newly verified state on the same response", async () => {
 const api = await isolated("../lib/api.ts");
 for (const kind of ["course", "ai"]) {
  const table = kind === "course" ? "orders" : "aiSubscriptionOrders";
  const db = database({ [table]: [{ id: 1, userId: 1, orderNumber: "ORDER-1", tapChargeId: "chg_stored", status: "initiated", courseSlug: "math", currency: "SAR", total: 100, amount: 100 }] });
  let refreshed = 0;
  const route = await isolated(kind === "course" ? "../app/api/checkout/route.ts" : "../app/api/ai/subscription/checkout/route.ts", {
   ...tables, ...api, eq, and, getDb: () => db, getSessionUser: async () => ({ id: 1, role: "student" }), checkRateLimit: async () => true,
   getCoursesCatalog: async () => [{ slug: "math", title: "Math" }], observeRequest: (_request, _name, run) => run(),
   refreshOwnedTapOrder: async (requestedKind, number, owner) => { refreshed++; assert.deepEqual([requestedKind, number, owner], [kind, "ORDER-1", 1]); db.rows[table][0].status = "paid"; return true; },
  });
  const response = await route.GET(new Request("https://example.test/status?order=ORDER-1&tap_id=chg_untrusted"));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(kind === "course" ? payload.phase : payload.order.status, "paid");
  assert.equal(refreshed, 1);
 }
});
