import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { nativeSource } from "./helpers/native-source.mjs";
import { ownershipDatabase, sql, eq, and, or, gt, isNull, inArray } from "./helpers/ownership-database.mjs";

const paths = ["lib/admin-deletion.ts", "app/api/admin/console/route.ts", "app/api/checkout/route.ts"];
const names = new Set();
for (const path of paths) {
  const text = await readFile(new URL("../" + path, import.meta.url), "utf8");
  const declarations = text.match(/import\s*\{[^}]*\}\s*from\s*["']@\/db\/schema["']/g) || [];
  for (const declaration of declarations) for (const name of declaration.split("{")[1].split("}")[0].split(",")) if (name.trim()) names.add(name.trim());
}
const primitives = { sql, eq, and, or, gt, isNull, inArray };
const owner = { id: 11, email: "reused@example.test", status: "active", role: "student", fullName: "Current owner" };
const prior = { id: 22, email: "changed@example.test", status: "active", role: "student", fullName: "Historical owner" };
const administrator = { id: 99, email: "administrator@example.test", role: "admin", status: "active", isPlatformOwner: true };
const cleanText = (value, length) => typeof value === "string" ? value.trim().slice(0, length) : "";
const jsonError = (error, status = 400, code) => Response.json({ ok: false, error, code }, { status });
function request(body) { return new Request("https://maras-qa.example/api/admin/console", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin: "https://maras-qa.example" } }); }
async function fixture(initial = {}, settings = {}) {
  const h = ownershipDatabase([...names], { users: [owner, prior, administrator], ...initial });
  const removed = [], pushes = [], notices = [];
  const deletion = await nativeSource("lib/admin-deletion.ts", { ...h.tables, ...primitives, deleteObject: async key => { assert.equal(h.inTransaction(), false); assert.equal(h.committed(), true); removed.push(key); } });
  const ownership = await nativeSource("lib/order-ownership.ts", { ...h.tables, ...primitives });
  class AdminMfaError extends Error { status = 403; code = "ADMIN_MFA_REQUIRED"; }
  const route = await nativeSource("app/api/admin/console/route.ts", {
    ...h.tables, ...primitives, ...deletion, ...ownership, AdminMfaError, createHash,
    getDb: () => h.db, cleanText, jsonError, finiteNumber: value => Number(value), validEmail: value => value.includes("@"),
    isAdminRequest: () => false, sameOriginRequest: () => true, getSessionUser: async () => administrator,
    roleAllowed: (user, roles) => roles.includes(user?.role), hasPermission: async () => true,
    ADMIN_PERMISSIONS: { RECORDS_DELETE: "records.delete" }, permissionsForUser: async () => new Set(["subscriptions.manage", "records.delete"]),
    consoleActionPermissions: () => ["subscriptions.manage"], permissionsCover: () => true,
    checkRateLimit: async () => true, supervisorConsoleMutationAllowed: async () => settings.scoped !== false,
    requireAdminStepUp: async () => { if (settings.mfa === false) throw new AdminMfaError("Step-up required"); }, clientIp: () => "127.0.0.1",
    readBoundedJsonObject: req => req.json(), getCourseCatalog: async slug => ({ slug, title: "Fixture course", accessDurationDays: 30 }),
    getCoursesCatalog: async () => [], createAndSendNotification: async value => { notices.push(value); },
    normalizeAccessDurationDays: () => 30, accessExpiryIso: () => "2030-01-01T00:00:00.000Z", effectiveAccessRows: async rows => rows,
    sendPushNotification: async target => { pushes.push(target); return { accepted: 0, attempted: 0, providerErrors: [] }; },
  });
  return { ...h, ...deletion, route, removed, pushes, notices };
}
const deletionInput = { entityType: "user", entityId: "11", actor: administrator.email, ipAddress: "127.0.0.1", confirmation: "حذف" };
const grant = { action: "grantAccess", userEmail: owner.email, courseSlug: "qa-course", operationKey: "qa-operation-20260919" };

test("administrative hard deletion removes only ID-owned data and cleans only committed owned files", async () => {
  const initial = {};
  for (const name of ["favorites", "cartItems", "lessonNotes", "lessonProgress", "courseReviews", "courseAccess", "courseWaitlist", "supportTickets"]) initial[name] = [
    { id: 1, userId: owner.id, userEmail: "older@example.test" }, { id: 2, userId: prior.id, userEmail: owner.email }, { id: 3, userId: null, userEmail: owner.email },
  ];
  initial.supportReplyFiles = [1, 2, 3].map(id => ({ id, ticketId: id, objectKey: `support/${id}` }));
  initial.supportReplies = [1, 2, 3].map(id => ({ id, ticketId: id }));
  initial.courseRequests = [{ id: 1, userId: owner.id }, { id: 2, userId: prior.id }];
  initial.courseRequestFiles = [1, 2].map(id => ({ id, requestId: id, objectKey: `request/${id}` }));
  initial.analyticsEvents = [{ id: 3, userEmail: owner.email }];
  initial.invoices = [{ id: 1, orderNumber: "someone-elses-order", customerEmail: owner.email }];
  const h = await fixture(initial);
  const outcome = await h.deleteAdminEntity(h.db, deletionInput);
  assert.equal(outcome.deleted, true);
  assert.deepEqual(h.rows.users.map(row => row.id), [22, 99]);
  for (const name of ["favorites", "cartItems", "lessonNotes", "lessonProgress", "courseReviews", "courseAccess", "courseWaitlist", "supportTickets", "supportReplyFiles", "supportReplies"]) assert.deepEqual(h.rows[name].map(row => row.id), [2, 3], name);
  assert.deepEqual(h.removed.sort(), ["request/1", "support/1"]);
  assert.deepEqual(h.rows.analyticsEvents, initial.analyticsEvents);
  assert.deepEqual(h.rows.invoices, initial.invoices);
  assert.equal(h.rows.auditLogs.filter(row => row.action === "delete").length, 1);
});

test("another account's store rights on a reused snapshot do not block this account's deletion", async () => {
  const initial = { storeCourseGrants: [{ id: 1, userId: prior.id, userEmail: owner.email }] };
  const h = await fixture(initial);
  await h.deleteAdminEntity(h.db, deletionInput);
  assert.deepEqual(h.rows.storeCourseGrants, initial.storeCourseGrants);
});

for (const table of ["orders", "storeCourseGrants", "courseAccessEvents", "aiSubscriptionOrders"]) test(`owned ${table} history prevents hard deletion without orphaning files`, async () => {
  const h = await fixture({ [table]: [{ id: 1, userId: owner.id, userEmail: "older@example.test" }], courseRequests: [{ id: 1, userId: owner.id }], courseRequestFiles: [{ id: 1, requestId: 1, objectKey: "owned/document" }] });
  const before = structuredClone(h.rows);
  await assert.rejects(h.deleteAdminEntity(h.db, deletionInput), { name: "DeletionPolicyError" });
  assert.deepEqual(h.rows, before);
  assert.deepEqual(h.removed, []);
});

test("a complimentary grant is ID-owned, does not overwrite a reused-email record, and has ID-owned audit/notification", async () => {
  const previous = { id: 1, userId: prior.id, userEmail: owner.email, courseSlug: grant.courseSlug, source: "admin_complimentary", expiresAt: "2029-01-01" };
  const h = await fixture({ courseAccess: [previous], courseWaitlist: [{ id: 1, userId: owner.id, userEmail: "older@example.test", courseSlug: grant.courseSlug, status: "waiting" }, { id: 2, userId: prior.id, userEmail: owner.email, courseSlug: grant.courseSlug, status: "waiting" }] });
  const response = await h.route.POST(request(grant));
  assert.equal(response.status, 200, JSON.stringify(await response.json()));
  assert.deepEqual(h.rows.courseAccess[0], previous);
  assert.equal(h.rows.courseAccess[1].userId, owner.id);
  assert.deepEqual(h.writes.find(write => write.table === "courseAccess").conflict, ["userId", "courseSlug"]);
  assert.equal(h.rows.courseWaitlist[0].status, "converted"); assert.equal(h.rows.courseWaitlist[1].status, "waiting");
  assert.equal(h.rows.courseAccessEvents[0].userId, owner.id);
  assert.equal(h.rows.notificationsDb[0].targetUserId, owner.id); assert.equal(h.rows.notificationsDb[0].userEmail, null);
  assert.ok(h.locks.includes(`course-access:${owner.id}:${grant.courseSlug}`));
});

test("retry is idempotent for the same account, but is rejected after that email belongs to another account", async () => {
  const h = await fixture();
  assert.equal((await h.route.POST(request(grant))).status, 200);
  assert.equal((await (await h.route.POST(request(grant))).json()).replayed, true);
  assert.equal(h.rows.courseAccess.length, 1); assert.equal(h.rows.notificationsDb.length, 1);
  h.rows.users.find(row => row.id === owner.id).email = "now-changed@example.test";
  h.rows.users.find(row => row.id === prior.id).email = owner.email;
  assert.equal((await h.route.POST(request(grant))).status, 409);
  assert.equal(h.rows.courseAccess.length, 1); assert.equal(h.rows.courseAccessEvents.length, 1);
});

test("unresolved subscription ownership is not inferred from email for an administrative mutation", async () => {
  const h = await fixture({ courseAccess: [{ id: 1, userId: null, userEmail: owner.email, courseSlug: grant.courseSlug }] });
  const response = await h.route.POST(request({ action: "updateAccess", id: 1, operation: "revoke", reason: "Synthetic reason" }));
  assert.equal(response.status, 409); assert.deepEqual(h.writes, []);
});

for (const settings of [{ mfa: false }, { scoped: false }]) test(`grant authorization denies writes: ${JSON.stringify(settings)}`, async () => {
  const h = await fixture({}, settings);
  assert.equal((await h.route.POST(request(grant))).status, 403);
  assert.deepEqual(h.writes, []); assert.deepEqual(h.locks, []);
});

test("checkout duplicate-access guard uses ID, not current or historical email", async () => {
  for (const [userId, userEmail, expected] of [[owner.id, "older@example.test", 409], [prior.id, owner.email, 503], [null, owner.email, 503]]) {
    const h = ownershipDatabase([...names], { courseAccess: [{ id: 1, userId, userEmail, courseSlug: "qa-course", revokedAt: null, expiresAt: null }] });
    const route = await nativeSource("app/api/checkout/route.ts", { ...h.tables, ...primitives, process: { env: {} }, getDb: () => h.db,
      sameOriginRequest: () => true, getSessionUser: async () => owner, purchaseRequirementResponse: () => null,
      checkRateLimit: async () => true, clientIp: () => "127.0.0.1", readBoundedJsonObject: req => req.json(), cleanText, jsonError,
      getCoursesCatalog: async () => [{ slug: "qa-course", title: "Synthetic", availableForPurchase: true, price: 100 }],
      toMinorUnits: value => value * 100, fromMinorUnits: value => value / 100,
    });
    assert.equal((await route.POST(request({ courseSlug: "qa-course" }))).status, expected, `${userId}`);
    assert.deepEqual(h.writes, [], "no payment is created or sent by this fixture");
  }
});


test("administrative revocation targets the stable owner even when that account is inactive", async () => {
  const h = await fixture({ users: [{ ...owner, status: "blocked" }, prior, administrator], courseAccess: [{ id: 1, userId: owner.id, userEmail: prior.email, courseSlug: "qa-course", revokedAt: null, suspendedAt: null, expiresAt: null }] });
  const response = await h.route.POST(request({ action: "updateAccess", id: 1, operation: "revoke", reason: "Synthetic reason", operationKey: "revoke-fixture-20260919" }));
  assert.equal(response.status, 200, JSON.stringify(await response.json()));
  assert.ok(h.rows.courseAccess[0].revokedAt);
  assert.equal(h.rows.courseAccessEvents[0].userId, owner.id);
  assert.equal(h.rows.notificationsDb[0].targetUserId, owner.id);
  assert.equal(h.rows.notificationsDb[0].userEmail, null);
  assert.deepEqual(h.pushes, [{ userId: owner.id }]);
});

for (const action of ["prepareRequest", "updateRequest"]) test(`${action} addresses its notification by the stored requester ID`, async () => {
  const h = await fixture({ courseRequests: [{ id: 1, userId: prior.id, courseName: "Fixture", status: "new" }] });
  const response = await h.route.POST(request({ action, id: 1, courseSlug: "qa-course", status: "planned" }));
  assert.equal(response.status, 200, JSON.stringify(await response.json()));
  assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0].values.targetUserId, prior.id);
  assert.equal(h.notices[0].values.userEmail, null);
  assert.deepEqual(h.notices[0].target, { userId: prior.id });
});
