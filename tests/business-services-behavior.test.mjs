import assert from "node:assert/strict";
import test from "node:test";
import { isolated, sql, eq, ne, and, tables, database } from "./helpers/business-fixtures.mjs";
const api = await isolated("../lib/api.ts");
const refunds = await isolated("../lib/refunds.ts");
const state = await isolated("../lib/payment-state.ts");
const order = { id: 1, orderNumber: "MR-test", customerEmail: "owner@example.test", customerName: "Owner", courseSlug: "physics", total: 100, totalMinor: 10000, subtotal: 100, discount: 0, currency: "SAR", tapChargeId: "chg_test", status: "paid", paidAt: "2026-01-01T00:00:00.000Z" };
const aiOrder = { id: 1, userId: 9, orderNumber: "AI-one", customerEmail: "owner@example.test", amountMinor: 10000, currency: "SAR", tapChargeId: "chg_ai", status: "pending" };
async function webhook(db, extra = {}) {
  return isolated("../app/api/webhooks/tap/route.ts", { ...tables, ...api, ...refunds, ...state, getDb: () => db, eq, ne, and, sql, createAndSendNotification: async () => {}, sendPushNotification: async () => ({ accepted: 0, attempted: 0, providerErrors: [] }), qualifyReferralForPaidOrderTx: async () => {}, reconcileReferralQualificationAfterRefundTx: async () => {}, ...extra }, "export { handleAiSubscriptionCharge, handleRefundWebhook }; ");
}

test("course-request downloads and file lists reject unrelated supervisors as well as students", async () => {
  for (const role of ["student", "supervisor", "admin"]) for (const own of [true, false]) {
    const db = database({ courseRequests: [{ id: 3, userId: 4, status: "new" }], courseRequestFiles: [{ id: 2, requestId: 3, userId: 4, scanStatus: "clean", objectKey: "private", contentType: "application/pdf", originalName: "private.pdf" }] });
    let reads = 0;
    let scans = 0;
    const deps = { fileScanService: { scanFile: async () => { scans++; return { status: "clean" }; } }, fileScanBlockedResponse: () => null, fileStorageProvider: () => "local", checkRateLimit: async () => true, ...tables, ...api, and, eq, asc: column => column, getDb: () => db, getSessionUser: async () => ({ id: own ? 4 : 5, role }), getObject: async () => { reads++; return { body: new Uint8Array([1]) }; } };
    const fileRoute = await isolated("../app/api/course-requests/files/[fileId]/route.ts", deps);
    const listRoute = await isolated("../app/api/course-requests/[id]/files/route.ts", deps);
    const allowed = own || role === "admin";
    assert.equal((await fileRoute.GET(new Request("https://test/api/course-requests/files/2"), { params: Promise.resolve({ fileId: "2" }) })).status, allowed ? 200 : 404, `${role}: download ownership=${own}`);
    assert.equal(reads, allowed ? 1 : 0);
    assert.equal(scans, allowed ? 1 : 0, "unauthorized users cannot trigger scans");
    assert.equal((await listRoute.GET(new Request("https://test/api/course-requests/3/files"), { params: Promise.resolve({ id: "3" }) })).status, allowed ? 200 : 404, `${role}: list ownership=${own}`);
    assert.equal((await fileRoute.GET(new Request("https://test/api/course-requests/files/2.9"), { params: Promise.resolve({ fileId: "2.9" }) })).status, 400);
  }
});

test("refund parsing rejects hostile JSON objects without invoking coercion", () => {
  const poison = JSON.parse('{"toString":null,"valueOf":null}');
  assert.equal(refunds.requestedRefundMinor({ amountMinor: poison }), null);
  assert.equal(refunds.tapRefundRequestStatus(poison), "provider_pending");
  assert.deepEqual([...refunds.confirmedRefundMinorById([{ status: "REFUND_REFUNDED", payload: "null" }, { status: "REFUND_REFUNDED", payload: JSON.stringify({ id: poison, status: poison, amount: 2 }) }])], []);
});

test("AI charge callbacks preserve refund and captured states against older statuses", async () => {
  for (const [current, incoming] of [["partially_refunded", "FAILED"], ["refunded", "PARTIALLY_REFUNDED"], ["paid", "INITIATED"], ["partially_refunded", "CAPTURED"]]) {
    const db = database({ aiSubscriptionOrders: [{ ...aiOrder, status: current }] });
    const route = await webhook(db);
    const result = await route.handleAiSubscriptionCharge({ amount: 100, currency: "SAR", metadata: { product: "meras-ai" } }, "chg_ai", incoming, "AI-one");
    assert.equal((await result.json()).status, current, `${current} + ${incoming}`);
    assert.equal(db.rows.aiSubscriptionOrders[0].status, current);
    assert.equal(db.rows.aiEntitlements.length, 0);
  }
});

test("two concurrent AI purchases add two consecutive subscription months", async () => {
  const db = database({ aiSubscriptionOrders: [{ ...aiOrder }, { ...aiOrder, id: 2, orderNumber: "AI-two", tapChargeId: "chg_ai2" }] });
  const route = await webhook(db);
  const charge = { amount: 100, currency: "SAR", metadata: { product: "meras-ai" } };
  await Promise.all([route.handleAiSubscriptionCharge(charge, "chg_ai", "CAPTURED", "AI-one"), route.handleAiSubscriptionCharge(charge, "chg_ai2", "CAPTURED", "AI-two")]);
  assert.equal(db.rows.aiEntitlements.length, 2);
  const entitlements = db.rows.aiEntitlements.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  assert.equal(entitlements[1].startsAt, entitlements[0].expiresAt);
  await route.handleAiSubscriptionCharge(charge, "chg_ai", "CAPTURED", "AI-one");
  assert.equal(db.rows.aiEntitlements.length, 2, "replayed payment must not add another month");
});

test("separate confirmed AI refunds accumulate once per provider refund id", async () => {
  const db = database({ aiSubscriptionOrders: [{ ...aiOrder, status: "paid" }], aiEntitlements: [{ id: 1, userId: 9, source: "paid", externalRef: "AI-one", status: "active" }] });
  let verified;
  const route = await webhook(db, { fetch: async () => Response.json(verified) });
  async function refund(id, amount) { verified = { id, object: "refund", charge_id: "chg_ai", amount, currency: "SAR", status: "REFUNDED", metadata: { ai_order_number: "AI-one" } }; return route.handleRefundWebhook(verified, "fixture-key"); }
  assert.equal((await (await refund("re_one", 40)).json()).status, "partially_refunded");
  assert.equal((await (await refund("re_two", 60)).json()).status, "refunded");
  assert.equal((await (await refund("re_one", 40)).json()).status, "refunded");
  assert.equal(db.rows.aiEntitlements[0].status, "revoked");
});

test("replayed course fulfillment preserves administrator suspensions and revocations", async () => {
  for (const stopped of [{ suspendedAt: "2026-01-02", suspensionReason: "review" }, { revokedAt: "2026-01-02", revocationReason: "policy" }]) {
    const db = database({ orders: [{ ...order }], courseAccess: [{ id: 1, orderNumber: order.orderNumber, userEmail: order.customerEmail, courseSlug: order.courseSlug, expiresAt: "2027-01-01", ...stopped }] });
    const fulfillment = await isolated("../lib/order-fulfillment.ts", { ...tables, eq, ne, and, normalizeAccessDurationDays: value => value, accessExpiryIso: () => "2027-01-01", qualifyReferralForPaidOrderTx: async () => {} });
    await fulfillment.fulfillPaidOrderTx(db, order, [{ courseSlug: "physics", accessDurationDays: 90 }], { chargeId: "chg_test", now: new Date().toISOString(), actorEmail: "tap-webhook" });
    for (const [key, value] of Object.entries(stopped)) assert.equal(db.rows.courseAccess[0][key], value);
  }
});
import { createHmac, timingSafeEqual } from "node:crypto";

test("course charge callbacks cannot erase partial refunds and reject sub-halala underpayments", async () => {
  for (const scenario of [{ current: "partially_refunded", incoming: "CAPTURED", amount: 100, status: 200 }, { current: "partially_refunded", incoming: "FAILED", amount: 100, status: 200 }, { current: "pending", incoming: "CAPTURED", amount: 99.999, status: 409 }]) {
    const db = database({ orders: [{ ...order, status: scenario.current }] });
    let fulfills = 0;
    const verified = { id: "chg_test", status: scenario.incoming, amount: scenario.amount, currency: "SAR", metadata: { order_number: "MR-test" } };
    const source = await isolated("../app/api/webhooks/tap/route.ts", { ...tables, ...api, ...refunds, ...state, getDb: () => db, eq, ne, and, sql, createHmac, timingSafeEqual, readBoundedJsonObject: request => request.json(), process: { env: { TAP_SECRET_KEY: "fixture-secret" } }, fetch: async () => Response.json(verified), fulfillPaidOrderTx: async () => { fulfills++; return { notice: null }; } }, "export { hashValue };");
    const request = new Request("https://test/api/webhooks/tap", { method: "POST", headers: { hashstring: source.hashValue(verified, "fixture-secret") }, body: JSON.stringify(verified) });
    const result = await source.POST(request);
    assert.equal(result.status, scenario.status);
    assert.equal(db.rows.orders[0].status, scenario.current);
    assert.equal(fulfills, 0);
    if (scenario.status === 200) assert.equal((await result.json()).status, scenario.current);
  }
});
