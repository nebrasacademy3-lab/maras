/** Actual route/database integration; only the external mail transport is synthetic. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";

const { url } = JSON.parse(readFileSync(".data/qa-database.json", "utf8"));
if (process.env.DATABASE_URL !== url || new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/maras_qa") throw new Error("Use only the isolated loopback QA database");
for (const name of ["GEMINI_API_KEY", "GEMINI_API_KEYS", "GEMINI_PAID_API_KEY", "GEMINI_PAID_API_KEYS", "RESEND_API_KEY", "TAP_SECRET_KEY", "S3_BUCKET", "BUCKET"]) {
  if (process.env[name]) throw new Error("Do not supply provider credentials: " + name);
}
process.env.APP_URL = "https://maras-qa.example";
process.env.EMAIL_FROM = "qa@example.test";
process.env.RESEND_API_KEY = "synthetic-email-change-qa-not-a-real-key";
process.env.EMAIL_CHANGE_ENABLED = "true";
const { getDb, closeDb } = await import("../db/index.ts");
const schema = await import("../db/schema.ts");
const auth = await import("../lib/auth.ts");
const route = await import("../app/api/profile/email/route.ts");
const service = await import("../lib/email-change.ts");
const db = getDb(), nonce = randomUUID().slice(0, 8), now = new Date().toISOString();
const future = new Date(Date.now() + 3600000).toISOString();
const checks = [], delivered = new Map();
const originalFetch = globalThis.fetch;
let failDelivery = false, deliveryWait = null, deliveryEntered = null;
globalThis.fetch = async (url, init) => {
  assert.equal(String(url), "https://api.resend.com/emails");
  assert.equal(new Headers(init.headers).get("authorization"), "Bearer synthetic-email-change-qa-not-a-real-key");
  const body = JSON.parse(init.body);
  const to = Array.isArray(body.to) ? body.to[0] : body.to;
  assert.ok(to.endsWith("@example.test"));
  const code = String(body.text).match(/\b[0-9]{6}\b/)?.[0];
  assert.ok(code, "Real renderer must include the issued verification code");
  delivered.set(to, code);
  deliveryEntered?.();
  if (deliveryWait) await deliveryWait;
  return failDelivery ? Response.json({ message: "synthetic delivery failure" }, { status: 503 }) : Response.json({ id: "synthetic-" + randomUUID() });
};
const pass = name => { checks.push(name); console.log("PASS", name); };
function request(token = "", body) {
  return new Request("https://maras-qa.example/api/profile/email", {
    method: body ? "POST" : "GET",
    headers: {
      origin: "https://maras-qa.example", "content-type": "application/json",
      cookie: auth.SESSION_COOKIE + "=" + token, "x-meras-device-id": "qa-email-device-" + nonce,
      "x-forwarded-for": "198.18.0." + (parseInt(nonce.slice(0, 2), 16) % 250 + 1),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const post = (account, body) => route.POST(request(account.token, body));
async function account(label) {
  const email = "qa-identity-" + nonce + "-" + label + "@example.test";
  const [user] = await db.insert(schema.users).values({
    email, fullName: "طالب اختبار", role: "student", status: "active",
    emailVerifiedAt: now, profileCompletedAt: now, onboardingCompletedAt: now,
  }).returning();
  const session = await auth.createSession(user.id, request());
  return { ...user, token: session.token, next: "qa-identity-" + nonce + "-" + label + "-new@example.test" };
}
const latest = async userId => (await db.select().from(schema.emailChangeRequests).where(eq(schema.emailChangeRequests.userId, userId)).orderBy(desc(schema.emailChangeRequests.id)).limit(1))[0];
async function start(account) {
  const response = await post(account, { action: "request", newEmail: account.next, currentPassword: "" });
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return { current: delivered.get(account.email), next: delivered.get(account.next) };
}
try {
  const a = await account("success");
  process.env.EMAIL_CHANGE_ENABLED = "false";
  assert.equal((await (await route.GET(request(a.token))).json()).enabled, false);
  assert.equal((await post(a, { action: "request", newEmail: a.next })).status, 503);
  assert.equal(delivered.size, 0);
  process.env.EMAIL_CHANGE_ENABLED = "true";
  const foreign = request(a.token, { action: "request", newEmail: a.next });
  foreign.headers.set("origin", "https://foreign.example.test");
  assert.equal((await route.POST(foreign)).status, 403);
  pass("release gate and cross-origin rejection prevent changes and mail");

  const otherRequest = request();
  otherRequest.headers.set("x-meras-device-id", "qa-email-other-" + nonce);
  const other = await auth.createSession(a.id, otherRequest);
  await db.insert(schema.passwordResetTokens).values({ userId: a.id, tokenHash: randomUUID(), expiresAt: future });
  await db.insert(schema.accountMfaChallenges).values({ userId: a.id, tokenHash: randomUUID(), deviceId: "fixture", expiresAt: future });
  await db.insert(schema.oauthExchanges).values({ userId: a.id, codeHash: randomUUID(), challenge: "fixture", returnTo: "/dashboard", redirectUri: "merasalelm://oauth/callback", expiresAt: future });
  const orderNumber = "QA-IDENTITY-" + nonce;
  const snapshotJson = JSON.stringify({ customer: { name: a.fullName, email: a.email, phone: "" }, total: 100 });
  await db.insert(schema.orders).values({ orderNumber, userId: a.id, customerEmail: a.email, customerName: a.fullName, courseSlug: "qa-physics", subtotal: 100, total: 100, status: "paid" });
  await db.insert(schema.invoices).values({ invoiceNumber: "INV-" + nonce, orderNumber, customerEmail: a.email, total: 100, snapshotJson });
  await db.insert(schema.auditLogs).values({ actorEmail: a.email, action: "identity_fixture", entityType: "user", entityId: String(a.id) });
  await db.insert(schema.courseAccess).values({ userId: a.id, userEmail: a.email, courseSlug: "qa-physics", startsAt: now });
  const devicesBefore = await db.select().from(schema.authDevices).where(eq(schema.authDevices.userId, a.id));
  const codes = await start(a);
  const challenge = await latest(a.id);
  assert.ok(!JSON.stringify(challenge).includes(codes.current) && !JSON.stringify(challenge).includes(codes.next));
  assert.equal((await post(a, { action: "verify", target: "current", code: codes.current })).status, 200);
  assert.equal((await db.select().from(schema.users).where(eq(schema.users.id, a.id)))[0].email, a.email);
  const firstProof = (await latest(a.id)).currentVerifiedAt;
  assert.equal((await post(a, { action: "verify", target: "current", code: codes.current })).status, 200);
  assert.equal((await latest(a.id)).currentVerifiedAt, firstProof);
  pass("dual proof stays pending, hashes codes and consumes each side idempotently");

  const completed = await post(a, { action: "verify", target: "new", code: codes.next });
  assert.equal(completed.status, 200);
  assert.equal((await completed.json()).requiresReauthentication, true);
  assert.equal((await db.select().from(schema.users).where(eq(schema.users.id, a.id)))[0].email, a.next);
  assert.equal(await auth.getSessionUser(request(a.token)), null);
  assert.equal(await auth.getSessionUser(request(other.token)), null);
  for (const table of [schema.passwordResetTokens, schema.accountMfaChallenges, schema.oauthExchanges]) {
    assert.equal((await db.select().from(table).where(and(eq(table.userId, a.id), isNull(table.usedAt)))).length, 0);
  }
  assert.deepEqual(await db.select().from(schema.authDevices).where(eq(schema.authDevices.userId, a.id)), devicesBefore);
  pass("all old sessions and reset/MFA/OAuth challenges are invalidated without removing approved devices");
  const [invoice] = await db.select().from(schema.invoices).where(eq(schema.invoices.orderNumber, orderNumber));
  assert.equal(invoice.customerEmail, a.email); assert.equal(invoice.snapshotJson, snapshotJson);
  assert.equal((await db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.entityId, String(a.id)), eq(schema.auditLogs.action, "identity_fixture"))))[0].actorEmail, a.email);
  assert.equal((await db.select().from(schema.orders).where(eq(schema.orders.orderNumber, orderNumber)))[0].customerEmail, a.email);
  const retainedAccess = await db.select().from(schema.courseAccess).where(eq(schema.courseAccess.userId, a.id));
  assert.equal(retainedAccess.length, 1);
  assert.equal(retainedAccess[0].userEmail, a.email, "email remains a historical snapshot");
  pass("invoice and actor history remain unchanged while operational access remains with the account");

  const cancelled = await account("cancel");
  const oldCodes = await start(cancelled);
  assert.equal((await post(cancelled, { action: "cancel" })).status, 200);
  assert.equal((await post(cancelled, { action: "verify", target: "new", code: oldCodes.next })).status, 400);
  await start(cancelled);
  assert.equal((await post(cancelled, { action: "verify", target: "current", code: oldCodes.current })).status, 400);
  pass("cancelled and replaced proof codes cannot commit a change");

  const failed = await account("delivery");
  failDelivery = true;
  assert.equal((await post(failed, { action: "request", newEmail: failed.next })).status, 503);
  failDelivery = false;
  assert.ok((await latest(failed.id)).usedAt);
  assert.equal((await (await route.GET(request(failed.token))).json()).active, false);
  pass("failed delivery invalidates the challenge without changing the account");

  const raced = await account("race");
  let release;
  deliveryWait = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { deliveryEntered = resolve; });
  const pending = post(raced, { action: "request", newEmail: raced.next });
  await entered;
  assert.equal((await post(raced, { action: "cancel" })).status, 200);
  release();
  assert.equal((await pending).status, 409);
  deliveryWait = null; deliveryEntered = null;
  assert.equal((await (await route.GET(request(raced.token))).json()).active, false);
  pass("cancellation during delivery is not resurrected as a successful request");

  const expired = await account("expired"), expiredCodes = await start(expired);
  await db.update(schema.emailChangeRequests).set({ expiresAt: new Date(Date.now() - 1000).toISOString() }).where(eq(schema.emailChangeRequests.userId, expired.id));
  assert.equal((await post(expired, { action: "verify", target: "current", code: expiredCodes.current })).status, 400);
  const revoked = await account("revoked"), revokedCodes = await start(revoked);
  await auth.revokeSession(request(revoked.token));
  await assert.rejects(service.verifyEmailChange(revoked.id, "current", revokedCodes.current, request(revoked.token)), error => error.code === "SESSION_EXPIRED");
  pass("expiry and transaction-level revoked-session checks reject stale proofs");

  const concurrent = await account("concurrent"), concurrentCodes = await start(concurrent);
  const results = await Promise.all([
    post(concurrent, { action: "verify", target: "current", code: concurrentCodes.current }),
    post(concurrent, { action: "verify", target: "new", code: concurrentCodes.next }),
  ]);
  assert.ok(results.every(result => result.status === 200));
  const bodies = await Promise.all(results.map(result => result.json()));
  assert.equal(bodies.filter(result => result.completed).length, 1);
  assert.equal((await db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.entityId, String(concurrent.id)), eq(schema.auditLogs.action, "change_email")))).length, 1);
  pass("concurrent dual proofs commit exactly once");
  writeFileSync(".data/qa-email-change-results.json", JSON.stringify({ passed: checks.length, checks, database: "isolated loopback PostgreSQL", email: "mock transport, real renderer" }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  delete process.env.RESEND_API_KEY;
  await closeDb();
}
