import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";
import test from "node:test";
import { isolated, sql, eq, ne, and, tables, database } from "./helpers/business-fixtures.mjs";
const tap = await isolated("../lib/tap-payments.ts");
const api = await isolated("../lib/api.ts");
const refunds = await isolated("../lib/refunds.ts");
const state = await isolated("../lib/payment-state.ts");
const charge = { id: "chg_fixture", object: "charge", amount: 100, currency: "SAR", status: "CAPTURED", reference: { gateway: "gateway", payment: "payment", order: "ORDER-fixture" }, transaction: { created: "1726790400000", url: "https://checkout.tap.company/fixture" } };
async function handler(extra = {}) {
 const db = database();
 let retrievals = 0;
 const route = await isolated("../app/api/webhooks/tap/route.ts", { ...tables, ...api, ...refunds, ...state, eq, ne, and, sql, getDb: () => db, createHmac, timingSafeEqual, readBoundedJsonObject: request => request.json(), process: { env: { TAP_SECRET_KEY: "sk_synthetic", TAP_WEBHOOK_SECRET: "obsolete-unrelated-key" } }, fetch: async (_url, options) => { retrievals++; assert.equal(options.redirect, "error"); assert.equal(options.cache, "no-store"); return Response.json(charge); }, ...extra }, "export { hashValue, orderState, handleAiSubscriptionCharge }; ");
 return { ...route, db, retrievals: () => retrievals };
}
function signedRequest(body, hash) { return new Request("https://example.test/api/webhooks/tap", { method: "POST", headers: { hashstring: hash }, body: JSON.stringify(body) }); }

test("Tap creation classification keeps uncertain responses pending and accepts only HTTPS redirects", () => {
 assert.equal(tap.tapChargeCreationResult({ ok: true, status: 200 }, charge).kind, "initiated");
 for (const status of [408, 409, 425, 429, 500, 502, 503, 504]) assert.equal(tap.tapChargeCreationResult({ ok: false, status }, {}).kind, "pending");
 for (const payload of [null, [], {}, { id: "chg_fixture" }, { ...charge, id: "invalid" }]) assert.equal(tap.tapChargeCreationResult({ ok: true, status: 200 }, payload).kind, "pending");
 for (const url of ["javascript:alert(1)", "http://checkout.tap.company/pay", "https://user:pass@checkout.tap.company/pay", "//checkout.tap.company/pay"]) assert.equal(tap.tapChargeCreationResult({ ok: true, status: 200 }, { ...charge, transaction: { url } }).kind, "pending");
 for (const status of [400, 401, 403, 404, 422]) assert.equal(tap.tapChargeCreationResult({ ok: false, status }, {}).kind, "failed");
 assert.deepEqual(tap.tapChargeCreationResult({ ok: false, status: 400 }, { id: "chg_known" }), { kind: "pending", chargeId: "chg_known" });
});
test("Tap callback signs SAR amount using the Secret API Key and retrieves provider truth", async () => {
 const route = await handler();
 const expected = createHmac("sha256", "sk_synthetic").update("x_idchg_fixturex_amount100.00x_currencySARx_gateway_referencegatewayx_payment_referencepaymentx_statusCAPTUREDx_created1726790400000").digest("hex");
 assert.equal(route.hashValue(charge, "sk_synthetic"), expected);
 assert.equal((await route.POST(signedRequest(charge, expected))).status, 200);
 assert.equal(route.retrievals(), 1);
 assert.equal(route.db.rows.paymentEvents.length, 1);
 assert.equal(route.db.rows.paymentEvents[0].signatureVerified, true);
});
test("unsigned or tampered Tap callbacks cannot query the provider or change financial state", async () => {
 const route = await handler();
 const valid = route.hashValue(charge, "sk_synthetic");
 for (const [body, signature] of [[charge, ""], [charge, "x"], [{ ...charge, amount: 1 }, valid], [charge, route.hashValue(charge, "obsolete-unrelated-key")]]) {
  assert.equal((await route.POST(signedRequest(body, signature))).status, 401);
 }
 assert.equal(route.retrievals(), 0);
 assert.equal(route.db.rows.paymentEvents.length, 0);
});
test("documented timeout is terminal but an unknown status remains under review", async () => {
 const route = await handler();
 assert.equal(route.orderState("TIMEDOUT"), "failed");
 assert.equal(route.orderState("UNKNOWN"), "verification_pending");
 assert.equal(route.orderState("NEW_UNRECOGNIZED_STATUS"), "verification_pending");
});
test("AI webhook rechecks charge ownership after acquiring the order lock", async () => {
 const row = { id: 1, userId: 1, orderNumber: "AI-test", tapChargeId: null, status: "pending", amountMinor: 10000, currency: "SAR", customerEmail: "test@example.test" };
 const db = database({ aiSubscriptionOrders: [row] });
 const transaction = db.transaction;
 db.transaction = async callback => { db.rows.aiSubscriptionOrders[0] = { ...row, tapChargeId: "chg_other" }; return transaction(callback); };
 const route = await handler({ getDb: () => db });
 const result = await route.handleAiSubscriptionCharge({ ...charge, metadata: { product: "meras-ai" } }, "chg_fixture", "CAPTURED", "AI-test");
 assert.equal(result.status, 409);
 assert.equal(db.rows.aiEntitlements.length, 0);
 assert.equal(db.rows.aiSubscriptionOrders[0].tapChargeId, "chg_other");
});
test("retired store webhook and mobile purchasing cannot call provider or modify grants", async () => {
 const retired = await isolated("../app/api/webhooks/revenuecat/route.ts");
 assert.equal((await retired.POST(signedRequest({}, "anything"))).status, 410);
 for (const [path, method] of [["catalog", "GET"], ["sync", "POST"]]) {
  let authenticated = false;
  const route = await isolated("../app/api/mobile/purchases/" + path + "/route.ts", { storeApiUser: async () => { authenticated = true; return { id: 1 }; }, storeApiError: error => { throw error; }, mobileNoStoreHeaders: { "cache-control": "no-store" } });
  const result = await route[method](new Request("https://example.test/api/mobile/purchases/" + path, { method }));
  assert.equal(result.status, 410);
  assert.equal((await result.json()).code, "STORE_PURCHASES_RETIRED");
  assert.equal(authenticated, true);
 }
});
