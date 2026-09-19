/** Actual PostgreSQL, routes, MFA and local storage; never production or a live provider. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
const local = JSON.parse(readFileSync(".data/qa-database.json", "utf8")) as { url: string };
const address = new URL(local.url);
if (address.hostname !== "127.0.0.1" || address.pathname !== "/maras_qa" || process.env.DATABASE_URL !== local.url) throw new Error("Dedicated loopback maras_qa required");
for (const key of ["GEMINI_API_KEY", "GEMINI_API_KEYS", "GEMINI_PAID_API_KEY", "GEMINI_PAID_API_KEYS", "RESEND_API_KEY", "TAP_SECRET_KEY", "S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "BUCKET", "RAILWAY_PROJECT_ID"]) if (process.env[key]) throw new Error("Live services prohibited");
if (resolve(process.env.UPLOAD_DIR || "") !== resolve(".data/uploads")) throw new Error("Isolated upload directory required");
process.env.APP_URL = "https://maras-qa.example";
const [{ getDb, closeDb }, s, auth, mfa, consoleRoute, profile, deletion, storage] = await Promise.all([
  import("../db"), import("../db/schema"), import("../lib/auth"), import("../lib/admin-mfa"), import("../app/api/admin/console/route"),
  import("../app/api/admin/students/[email]/route"), import("../lib/admin-deletion"), import("../lib/storage"),
]);
const db = getDb(), nonce = randomUUID().slice(0, 8), now = new Date().toISOString();
const checks: string[] = [];
const pass = (value: string) => { checks.push(value); console.log("PASS ADMIN OWNERSHIP", value); };
const network = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("External transport prohibited in ownership QA"); };
let token = "", step = "";
function request(body?: unknown) {
  return new Request(process.env.APP_URL + "/api/admin/console", { method: body === undefined ? "GET" : "POST", headers: {
    origin: process.env.APP_URL!, "content-type": "application/json", "user-agent": "Synthetic administrative ownership QA", "x-meras-device-id": `ownership-${nonce}`,
    cookie: `${auth.SESSION_COOKIE}=${token}${step ? `; ${mfa.ADMIN_STEP_UP_COOKIE}=${step}` : ""}`,
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function user(label: string, email = `admin-owner-${nonce}-${label}@example.test`, role = "student") {
  return (await db.insert(s.users).values({ email, fullName: `Synthetic ${label}`, role, status: "active", emailVerifiedAt: now, profileCompletedAt: now, onboardingCompletedAt: now }).returning())[0];
}
async function response(body: unknown, status = 200) { const result = await consoleRoute.POST(request(body)); const payload = await result.json(); assert.equal(result.status, status, JSON.stringify(payload)); return payload; }
try {
  const actor = await user("staff", undefined, "supervisor");
  const fixtureOwner = (JSON.parse(readFileSync(".data/qa-fixtures.json", "utf8")) as { users: { id: number; role: string }[] }).users.find(value => value.role === "admin")!.id;
  for (const permission of ["data.all", "students.view", "subscriptions.manage", "support.manage", "records.delete", "notifications.manage"]) await db.insert(s.staffPermissions).values({ userId: actor.id, permission, grantedBy: fixtureOwner });
  token = (await auth.createSession(actor.id, request())).token;
  const student = await user("student"), oldEmail = student.email;
  const other = await user("other");
  const grant = { action: "grantAccess", userId: student.id, userEmail: student.email, courseSlug: "qa-physics", operationKey: `grant-qa-${nonce}` };
  const mfaRequired = await response(grant, 428);
  assert.equal(mfaRequired.code, "MFA_SETUP_REQUIRED");
  assert.equal((await db.select().from(s.courseAccess).where(eq(s.courseAccess.userId, student.id))).length, 0);
  pass("real MFA blocks an otherwise authorized grant before any access is created");
  const [factor] = await db.insert(s.adminMfaFactors).values({ userId: actor.id, secretEncrypted: mfa.encryptAdminMfaSecret("JBSWY3DPEHPK3PXP"), verifiedAt: now, label: "Synthetic ownership QA", counter: -1 }).returning();
  await db.update(s.authSessions).set({ mfaVerifiedAt: now }).where(eq(s.authSessions.userId, actor.id));
  step = mfa.issueVerifiedAdminStepUp(auth.sessionUserFromRow(actor), request(), factor.id).token;
  // The same snapshot on another account must not be a grant conflict or waitlist target.
  const [foreignAccess] = await db.insert(s.courseAccess).values({ userId: other.id, userEmail: oldEmail, courseSlug: "qa-physics", source: "admin_complimentary" }).returning();
  const waitlist = await db.insert(s.courseWaitlist).values([
    { userId: student.id, userEmail: "old-snapshot@example.test", courseSlug: "qa-physics" },
    { userId: other.id, userEmail: oldEmail, courseSlug: "qa-physics" },
  ]).returning();
  const grants = await Promise.all(Array.from({ length: 6 }, () => response(grant)));
  assert.equal(grants.filter(value => !value.replayed).length, 1);
  const [access] = await db.select().from(s.courseAccess).where(eq(s.courseAccess.userId, student.id));
  assert.equal(access.courseSlug, "qa-physics");
  assert.deepEqual((await db.select().from(s.courseAccess).where(eq(s.courseAccess.id, foreignAccess.id)))[0], foreignAccess);
  assert.equal((await db.select().from(s.courseWaitlist).where(eq(s.courseWaitlist.id, waitlist[0].id)))[0].status, "converted");
  assert.equal((await db.select().from(s.courseWaitlist).where(eq(s.courseWaitlist.id, waitlist[1].id)))[0].status, "active");
  const events = await db.select().from(s.courseAccessEvents).where(eq(s.courseAccessEvents.userId, student.id));
  assert.equal(events.length, 1);
  const notices = await db.select().from(s.notificationsDb).where(eq(s.notificationsDb.targetUserId, student.id));
  assert.equal(notices.length, 1); assert.equal(notices[0].userEmail, null);
  pass("six concurrent grants create one stable-owner access, event and private notification; foreign snapshot untouched");
  await db.update(s.users).set({ email: `admin-owner-${nonce}-changed@example.test` }).where(eq(s.users.id, student.id));
  const reused = await user("reuse", oldEmail);
  await response(grant, 409);
  await response({ ...grant, operationKey: `new-stale-form-${nonce}` }, 409);
  assert.equal((await db.select().from(s.courseAccess).where(eq(s.courseAccess.userId, reused.id))).length, 0);
  const [ticket] = await db.insert(s.supportTickets).values({ userId: student.id, userEmail: oldEmail, ticketNumber: `OWN-${nonce}`, category: "general", title: "Private historical ticket", message: "Synthetic" }).returning();
  const [unbound] = await db.insert(s.courseAccess).values({ userEmail: oldEmail, courseSlug: "qa-physics", source: "legacy" }).returning();
  await response({ action: "updateAccess", id: unbound.id, operation: "revoke", reason: "Synthetic reason" }, 409);
  const view = await profile.GET(request(), { params: Promise.resolve({ email: reused.email }) });
  assert.equal(view.status, 200); const details = await view.json();
  assert.equal(details.pagination.subscriptions.total, 0); assert.equal(details.pagination.support.total, 0);
  assert.equal(JSON.stringify(details).includes("Private historical ticket"), false);
  assert.equal((await db.select().from(s.supportTickets).where(eq(s.supportTickets.id, ticket.id)))[0].userId, student.id);
  pass("email reuse cannot replay a grant or expose another owner's profile records; unresolved access is not mutated");
  const message = { action: "createNotification", audience: "user", targetUserId: student.id, userEmail: oldEmail,
    title: "Private account notice", body: "Synthetic account notice", pushEnabled: false };
  await response(message, 409);
  const delivered = await response({ ...message, userEmail: `admin-owner-${nonce}-changed@example.test` }, 201);
  const [privateNotice] = await db.select().from(s.notificationsDb).where(eq(s.notificationsDb.id, delivered.id));
  assert.equal(privateNotice.targetUserId, student.id); assert.equal(privateNotice.userEmail, null);
  pass("stale profile commands cannot target a reused email; private notifications persist the explicitly selected account ID");

  // A separate deletable account has only relationally owned synthetic files, with conflicting snapshots.
  const deleting = await user("delete");
  const tickets = await db.insert(s.supportTickets).values([
    { userId: deleting.id, userEmail: "earlier@example.test" }, { userId: other.id, userEmail: deleting.email }, { userId: null, userEmail: deleting.email },
  ].map((value, i) => ({ ...value, ticketNumber: `OWN-${nonce}-delete-${i}`, category: "general", title: "Deletion fixture", message: "Synthetic" }))).returning();
  const keys: string[] = [];
  for (const t of tickets) {
    const [reply] = await db.insert(s.supportReplies).values({ ticketId: t.id, authorEmail: deleting.email, body: "Synthetic" }).returning();
    const key = `qa-ownership/${nonce}/${t.id}.txt`; keys.push(key);
    await storage.putObject(key, new Blob(["test"]).stream(), "text/plain", "local");
    await db.insert(s.supportReplyFiles).values({ replyId: reply.id, ticketId: t.id, objectKey: key, originalName: "fixture.txt", contentType: "text/plain", sizeBytes: 4 });
  }
  const favoriteRows = await db.insert(s.favorites).values([{ userId: deleting.id, userEmail: "earlier@example.test" }, { userId: other.id, userEmail: deleting.email }, { userId: null, userEmail: deleting.email }].map(value => ({ ...value, courseSlug: `qa-delete-${nonce}` }))).returning();
  const deleteCommand = { action: "deleteEntity", entityType: "user", entityId: String(deleting.id), confirmation: "حذف" };
  await response(deleteCommand, 403);
  assert.equal((await db.select().from(s.users).where(eq(s.users.id, deleting.id))).length, 1);
  assert.equal((await db.select().from(s.favorites).where(inArray(s.favorites.id, favoriteRows.map(row => row.id)))).length, 3);
  await db.insert(s.staffPermissions).values({ userId: actor.id, permission: "students.manage", grantedBy: fixtureOwner });
  await response(deleteCommand);
  assert.equal((await db.select().from(s.users).where(eq(s.users.id, deleting.id))).length, 0);
  assert.deepEqual((await db.select().from(s.favorites).where(inArray(s.favorites.id, favoriteRows.map(row => row.id)))).map(row => row.id).sort((a,b) => a-b), favoriteRows.slice(1).map(row => row.id));
  assert.equal(await storage.getObject(keys[0], undefined, "local"), null);
  for (const key of keys.slice(1)) {
    const object = await storage.getObject(key, undefined, "local");
    assert.equal(object?.size, 4);
    await object?.body.cancel();
  }
  assert.equal((await db.select().from(s.supportReplies).where(inArray(s.supportReplies.ticketId, tickets.slice(1).map(row => row.id)))).length, 2);
  pass("actual administrative deletion and local file cleanup preserve other-account and unresolved support/favorite data");
  await assert.rejects(deletion.deleteAdminEntity(db, { entityType: "user", entityId: String(student.id), confirmation: "حذف", actor: actor.email, ipAddress: "127.0.0.1" }), { name: "DeletionPolicyError" });
  assert.equal((await db.select().from(s.courseAccessEvents).where(and(eq(s.courseAccessEvents.userId, student.id), eq(s.courseAccessEvents.id, events[0].id)))).length, 1);
  pass("hard deletion cannot erase stable subscription audit history");
  const { applyConfirmedRefundToOrder } = await import("../lib/refunds");
  async function refundOrder(label: string, userId: number | null) {
    const [order] = await db.insert(s.orders).values({ userId, orderNumber: `OWN-${nonce}-${label}`, customerEmail: oldEmail,
      customerName: "Synthetic refund", courseSlug: "qa-physics", subtotal: 100, total: 100, totalMinor: 10000,
      currency: "SAR", status: "paid", tapChargeId: `chg_own_${nonce}_${label}` }).returning();
    await db.insert(s.paymentEvents).values({ providerEventId: `refund-${nonce}-${label}`, orderNumber: order.orderNumber,
      chargeId: order.tapChargeId, status: "REFUND_REFUNDED", payload: JSON.stringify({ id: `re_own_${nonce}_${label}`, amount: 100, status: "REFUNDED" }) });
    return order;
  }
  const refundedOrder = await refundOrder("refund", student.id);
  await db.update(s.courseAccess).set({ orderNumber: refundedOrder.orderNumber }).where(inArray(s.courseAccess.id, [access.id, foreignAccess.id, unbound.id]));
  await db.update(s.users).set({ status: "disabled" }).where(eq(s.users.id, student.id));
  const beforeRefund = await db.select().from(s.courseAccess).where(inArray(s.courseAccess.id, [foreignAccess.id, unbound.id]));
  const refunds = await Promise.all(Array.from({ length: 6 }, () => applyConfirmedRefundToOrder({ orderNumber: refundedOrder.orderNumber, chargeId: refundedOrder.tapChargeId! })));
  assert.ok(refunds.every(result => result.ok && result.status === "refunded"));
  assert.equal(refunds.filter(result => result.ok && result.newlyFullyRefunded).length, 1);
  assert.ok((await db.select().from(s.courseAccess).where(eq(s.courseAccess.id, access.id)))[0].revokedAt);
  assert.deepEqual(await db.select().from(s.courseAccess).where(inArray(s.courseAccess.id, [foreignAccess.id, unbound.id])), beforeRefund);
  const refundAudits = await db.select().from(s.courseAccessEvents).where(eq(s.courseAccessEvents.orderNumber, refundedOrder.orderNumber));
  assert.equal(refundAudits.length, 1); assert.equal(refundAudits[0].userId, student.id);
  pass("six real concurrent refunds revoke only their stable inactive owner and create one audit, preserving foreign and unresolved rows");
  // A later replacement is not part of the old refunded order, even with the same owner and course.
  const renewedOrder = await refundOrder("renewal", student.id);
  await db.update(s.courseAccess).set({ orderNumber: renewedOrder.orderNumber, revokedAt: null, revocationReason: null }).where(eq(s.courseAccess.id, access.id));
  const renewalBefore = (await db.select().from(s.courseAccess).where(eq(s.courseAccess.id, access.id)))[0];
  await applyConfirmedRefundToOrder({ orderNumber: refundedOrder.orderNumber, chargeId: refundedOrder.tapChargeId! });
  assert.deepEqual((await db.select().from(s.courseAccess).where(eq(s.courseAccess.id, access.id)))[0], renewalBefore);
  const legacyOrder = await refundOrder("unresolved", null);
  const allBefore = await db.select().from(s.courseAccess).where(inArray(s.courseAccess.id, [access.id, foreignAccess.id, unbound.id]));
  assert.equal((await applyConfirmedRefundToOrder({ orderNumber: legacyOrder.orderNumber, chargeId: legacyOrder.tapChargeId! })).status, "refunded");
  assert.deepEqual(await db.select().from(s.courseAccess).where(inArray(s.courseAccess.id, [access.id, foreignAccess.id, unbound.id])), allBefore);
  pass("late refund replay preserves a replacement order; unresolved legacy orders refund financially without borrowing email ownership");
  writeFileSync(".data/qa-admin-stable-ownership-report.json", JSON.stringify({ passed: checks.length, checks, liveProviders: false, database: "disposable loopback PostgreSQL", storage: "local synthetic files" }, null, 2));
} finally { globalThis.fetch = network; await closeDb(); }
