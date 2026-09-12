import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { isolated, sql, eq, ne, and, or, isNull, tables, database } from "./helpers/business-fixtures.mjs";
const decisions = await isolated("../lib/admin-operations.ts");
const api = await isolated("../lib/api.ts");
const now = "2026-09-12T12:00:00.000Z";
const normalizeAccessDurationDays = value => Number(value) || 90;
const accessExpiryIso = (days, date) => new Date(date.getTime() + days * 86_400_000).toISOString();
const fulfillment = await isolated("../lib/order-fulfillment.ts", { ...tables, eq, ne, and, sql, normalizeAccessDurationDays, accessExpiryIso, qualifyReferralForPaidOrderTx: async () => {} });
class MfaError extends Error { constructor() { super("Step up required"); this.code = "MFA_STEP_UP_REQUIRED"; this.status = 403; } }
async function consoleRoute(db, overrides = {}) {
  return isolated("../app/api/admin/console/route.ts", { ...tables, ...api, ...decisions, sql, eq, ne, and, isNull, createHash,
    getDb: () => db, getSessionUser: async () => ({ id: 99, email: "operator@example.test", role: "admin" }), roleAllowed: (user, roles) => roles.includes(user?.role), isAdminRequest: () => false, sameOriginRequest: () => true, checkRateLimit: async () => true, clientIp: () => "127.0.0.1", readBoundedJsonObject: request => request.json(), requireAdminStepUp: async () => {}, AdminMfaError: MfaError, ADMIN_PERMISSIONS: {}, effectiveAccessRows: async rows => rows, getCourseCatalog: async slug => ({ slug, title: "Physics", accessDurationDays: 30 }), validEmail: email => email.includes("@"), normalizeAccessDurationDays, accessExpiryIso,
    fulfillPaidOrderTx: (tx, ...args) => fulfillment.fulfillPaidOrderTx({ ...tx, execute: async () => {} }, ...args), ...overrides,
  });
}
const request = payload => new Request("https://test/api/admin/console", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });

test("extensions preserve lifetime and add time after the current end", () => {
  assert.equal(decisions.extendAccessExpiry(null, 30, now), null);
  assert.equal(decisions.extendAccessExpiry("2026-10-01T12:00:00.000Z", 30, now), "2026-10-31T12:00:00.000Z");
  assert.equal(decisions.extendAccessExpiry("2026-01-01T12:00:00.000Z", 30, now), "2026-10-12T12:00:00.000Z");
  for (const days of [0, -1, 1.5, 3651, Number.NaN]) assert.throws(() => decisions.extendAccessExpiry(null, days, now));
});

test("the paginated APIs clamp malformed and hostile page input", () => {
  for (const value of [null, {}, "-1", "1.5", "Infinity", "1e6", "99999999"]) assert.deepEqual(decisions.adminPage(value), { page: 1, pageSize: 50, offset: 0 });
  assert.deepEqual(decisions.adminPage("4"), { page: 4, pageSize: 50, offset: 150 });
});

test("sensitive user changes reject generic machine tokens and missing step-up", async () => {
  const db = database({ users: [{ id: 1, role: "student", status: "active" }] });
  const payload = { action: "updateUser", id: 1, role: "admin", status: "active" };
  for (const overrides of [{ getSessionUser: async () => null, isAdminRequest: () => true }, { requireAdminStepUp: async () => { throw new MfaError(); } }]) {
    const route = await consoleRoute(db, overrides);
    assert.equal((await route.POST(request(payload))).status, 403);
    assert.equal(db.writes.length, 0);
  }
});

test("concurrent demotions cannot remove the final active administrator", async () => {
  const db = database({ users: [{ id: 1, email: "one@example.test", role: "admin", status: "active" }, { id: 2, email: "two@example.test", role: "admin", status: "active" }] });
  const route = await consoleRoute(db);
  const responses = await Promise.all([1, 2].map(id => route.POST(request({ action: "updateUser", id, role: "supervisor", status: "active" }))));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal(db.rows.users.filter(user => user.role === "admin" && user.status === "active").length, 1);
  assert.equal(db.rows.auditLogs.length, 1);
});

test("manual paid grants fulfill once and conflicting retry payload is rejected", async () => {
  const db = database({ users: [{ id: 1, email: "student@example.test", fullName: "Student", role: "student", status: "active" }], cartItems: [{ userEmail: "student@example.test", courseSlug: "physics" }], courseWaitlist: [{ userEmail: "student@example.test", courseSlug: "physics", status: "active" }] });
  const route = await consoleRoute(db);
  const payload = { action: "grantAccess", userEmail: "student@example.test", courseSlug: "physics", grantType: "manual_payment", price: 100, operationKey: "manual_payment_fixture_001" };
  assert.equal((await route.POST(request(payload))).status, 200);
  const second = await route.POST(request(payload)); assert.equal(second.status, 200); assert.equal((await second.json()).replayed, true);
  assert.equal((await route.POST(request({ ...payload, price: 200 }))).status, 409);
  assert.equal(db.rows.orders.length, 1); assert.equal(db.rows.orders[0].status, "paid");
  assert.equal(db.rows.invoices.length, 1); assert.equal(db.rows.paymentEvents.length, 1);
  assert.equal(db.rows.courseAccess[0].source, "admin_payment"); assert.equal(db.rows.cartItems.length, 0);
  assert.equal(db.rows.courseWaitlist[0].status, "converted"); assert.equal(db.rows.notificationsDb.length, 1);
});

test("repeated paid fulfillment cannot extend a duplicate purchase twice or shorten admin extension", async () => {
  const order = { id: 1, orderNumber: "order-new", customerEmail: "student@example.test", status: "pending", total: 100, subtotal: 100, discount: 0, currency: "SAR", createdAt: now };
  const db = database({ orders: [{ ...order }], courseAccess: [{ id: 1, userEmail: order.customerEmail, courseSlug: "physics", orderNumber: "order-old", startsAt: now, expiresAt: "2026-10-01T12:00:00.000Z", revokedAt: null, suspendedAt: null }] });
  const args = [[{ courseSlug: "physics", accessDurationDays: 30 }], { chargeId: null, actorEmail: "operator@example.test", now, extendDuplicates: true }];
  await db.transaction(tx => fulfillment.fulfillPaidOrderTx(tx, order, ...args));
  const expiry = db.rows.courseAccess[0].expiresAt;
  await db.transaction(tx => fulfillment.fulfillPaidOrderTx(tx, db.rows.orders[0], ...args));
  assert.equal(db.rows.courseAccess[0].expiresAt, expiry);
  const owned = database({ orders: [{ ...order, status: "paid", paidAt: now }], courseAccess: [{ id: 1, userEmail: order.customerEmail, courseSlug: "physics", orderNumber: order.orderNumber, startsAt: now, expiresAt: "2029-01-01T00:00:00.000Z", revokedAt: null, suspendedAt: null }] });
  await owned.transaction(tx => fulfillment.fulfillPaidOrderTx(tx, owned.rows.orders[0], ...args));
  assert.equal(owned.rows.courseAccess[0].expiresAt, "2029-01-01T00:00:00.000Z");
});


test("staff changes revoke the changed employee sessions and audit password resets without storing credentials", async () => {
  for (const scenario of [{ role: "supervisor", password: "" }, { role: "admin", password: "Strong#Password1" }]) {
    const employee = { id: 1, email: "staff@example.test", phone: "+966500000001", role: "admin", status: "active", passwordHash: "old-hash" };
    const db = database({ users: [employee, { id: 99, email: "operator@example.test", role: "admin", status: "active" }], authSessions: [{ id: 1, userId: 1, revokedAt: null }, { id: 2, userId: 99, revokedAt: null }], pushDevices: [{ id: 1, userId: 1, status: "active" }, { id: 2, userId: 99, status: "active" }] });
    const route = await isolated("../app/api/admin/staff/route.ts", { ...tables, ...api, ...decisions, sql, eq, ne, and, or, isNull,
      getDb: () => db, getSessionUser: async () => ({ id: 99, email: "operator@example.test", role: "admin" }), roleAllowed: (user, roles) => roles.includes(user?.role), isAdminRequest: () => false, sameOriginRequest: () => true, checkRateLimit: async () => true, clientIp: () => "127.0.0.1", readBoundedJsonObject: request => request.json(), requireAdminStepUp: async () => {}, AdminMfaError: MfaError,
      getInstitutionCatalog: async () => ({ slug: "university" }), getProgramsCatalog: async () => ({ programs: [{ name: "Physics" }] }), validEmail: () => true, validSaudiPhone: () => true, validPassword: () => true, hashPassword: async () => "fresh-password-hash",
    });
    const result = await route.POST(request({ email: employee.email, phone: employee.phone, fullName: "Employee Name", universitySlug: "university", specialty: "Physics", ...scenario }));
    assert.equal(result.status, 200);
    assert.ok(db.rows.authSessions[0].revokedAt); assert.equal(db.rows.authSessions[1].revokedAt, null);
    assert.equal(db.rows.pushDevices[0].status, "revoked"); assert.equal(db.rows.pushDevices[1].status, "active");
    assert.equal(db.rows.users[0].passwordHash, scenario.password ? "fresh-password-hash" : "old-hash");
    assert.equal(db.rows.auditLogs.length, 1);
    assert.equal(JSON.parse(db.rows.auditLogs[0].afterJson).passwordReset, Boolean(scenario.password));
    assert.ok(!JSON.stringify(db.rows.auditLogs).includes("fresh-password-hash"));
    if (scenario.role === "supervisor") assert.equal(db.rows.supervisorAssignments.length, 1);
  }
});
