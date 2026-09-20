/** Real routes, transactions and provider signatures; only outbound transports are synthetic. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
const { url } = JSON.parse(readFileSync(".data/qa-database.json", "utf8")) as { url: string };
if (new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/maras_qa" || process.env.DATABASE_URL !== url) throw new Error("Isolated loopback maras_qa required");
for (const key of ["RESEND_API_KEY", "TAP_SECRET_KEY", "TAP_WEBHOOK_SECRET", "GEMINI_API_KEY", "GEMINI_API_KEYS", "GEMINI_PAID_API_KEYS", "S3_BUCKET", "BUCKET"]) if (process.env[key]) throw new Error("Do not supply real credentials");
process.env.APP_URL = "https://maras-qa.example";
process.env.TAP_SECRET_KEY = "synthetic-owner-qa-not-a-real-key";
const [{ getDb, closeDb }, s, auth, tap, download, dashboard, notices, push, notifications, campaigns, couponApi, fulfillment, mobileAccount, checkout] = await Promise.all([
  import("../db"), import("../db/schema"), import("../lib/auth"), import("../app/api/webhooks/tap/route"),
  import("../app/api/invoices/[orderNumber]/download/route"), import("../app/api/mobile/dashboard/route"),
  import("../app/api/mobile/notifications/route"), import("../lib/push"), import("../lib/notifications"), import("../lib/push-campaigns"),
  import("../lib/coupons"), import("../lib/order-fulfillment"), import("../app/api/mobile/account/route"), import("../app/api/checkout/route"),
]);
const db = getDb(), nonce = randomUUID().slice(0, 8), now = new Date().toISOString();
const future = new Date(Date.now() + 86400000).toISOString();
const checks: string[] = [], sent: Array<{ to: string; title: string; data: Record<string, unknown> }> = [];
type Actor = { id: number; email: string; token: string; deviceId: string; pushToken: string };
type Charge = { id: string; amount: number; currency: string; status: string; created: string; metadata: { order_number: string }; customer: { email: string } };
const charges = new Map<string, Charge>();
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const endpoint = String(input);
  if (endpoint.startsWith("https://api.tap.company/v2/charges/")) {
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer synthetic-owner-qa-not-a-real-key");
    const verified = charges.get(decodeURIComponent(endpoint.split("/").at(-1)!));
    assert.ok(verified, "Only this test's synthetic charges may be verified");
    return Response.json(verified);
  }
  assert.equal(endpoint, "https://exp.host/--/api/v2/push/send", "External network is blocked in QA");
  const batch = JSON.parse(String(init?.body)) as typeof sent;
  for (const message of batch) assert.ok(message.to.startsWith(`ExponentPushToken[owner-qa-${nonce}-`));
  sent.push(...batch);
  return Response.json({ data: batch.map(() => ({ status: "ok", id: "qa-ticket" })) });
};
const pass = (name: string) => { checks.push(name); console.log("PASS OWNER", name); };
function request(path: string, actor?: Actor, body?: unknown, method?: string) {
  return new Request(process.env.APP_URL + path, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: { origin: process.env.APP_URL!, "content-type": "application/json", ...(actor ? { cookie: `${auth.SESSION_COOKIE}=${actor.token}`, "x-meras-device-id": actor.deviceId } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function actor(label: string, email = `owner-qa-${nonce}-${label}@example.test`, passwordHash?: string): Promise<Actor> {
  const [row] = await db.insert(s.users).values({ email, fullName: "طالب اختبار ملكية", status: "active", emailVerifiedAt: now, profileCompletedAt: now, onboardingCompletedAt: now, passwordHash }).returning();
  const deviceId = `owner-qa-device-${nonce}-${label}`;
  const req = request("/api/auth/login"); req.headers.set("x-meras-device-id", deviceId);
  const session = await auth.createSession(row.id, req);
  const pushToken = `ExponentPushToken[owner-qa-${nonce}-${label}]`;
  await db.insert(s.pushDevices).values({ userId: row.id, token: pushToken, platform: "android", deviceId });
  return { id: row.id, email, token: session.token, deviceId, pushToken };
}
async function order(label: string, owner: Actor | null, customerEmail: string, couponCode?: string) {
  return (await db.insert(s.orders).values({
    orderNumber: `OWNER-${nonce}-${label}`, userId: owner?.id ?? null, customerEmail, customerName: "الاسم التاريخي", customerPhone: "0500000000",
    courseSlug: "qa-physics", subtotal: 100, total: 100, totalMinor: 10000, status: "pending", tapChargeId: `chg_owner_${nonce}_${label}`, couponCode, createdAt: now,
  }).returning())[0];
}
async function callback(order: typeof s.orders.$inferSelect, status = "CAPTURED") {
  const charge: Charge = { id: order.tapChargeId!, amount: 100, currency: "SAR", status, created: now, metadata: { order_number: order.orderNumber }, customer: { email: order.customerEmail } };
  charges.set(charge.id, charge);
  const text = `x_id${charge.id}x_amount100.00x_currencySARx_gateway_referencex_payment_referencex_status${status}x_created${now}`;
  const response = await tap.POST(new Request(process.env.APP_URL + "/api/webhooks/tap", { method: "POST", headers: { "content-type": "application/json", hashstring: createHmac("sha256", process.env.TAP_SECRET_KEY!).update(text).digest("hex") }, body: JSON.stringify(charge) }));
  const payload = await response.json(); assert.equal(response.status, 200, JSON.stringify(payload));
  return payload;
}
async function invoice(actor: Actor, number: string) {
  return download.GET(request(`/api/invoices/${number}/download`, actor), { params: Promise.resolve({ orderNumber: number }) });
}
try {
  const a = await actor("a"), oldEmail = a.email;
  const referrer = await actor("referrer");
  const [referralCode] = await db.insert(s.referralCodes).values({ userId: referrer.id, code: `OWNER${nonce}` }).returning();
  const [attribution] = await db.insert(s.referralAttributions).values({ referralCodeId: referralCode.id, referrerUserId: referrer.id, referredUserId: a.id, qualificationEvent: "first_paid_order" }).returning();
  const [coupon] = await db.insert(s.couponsDb).values({ code: `OWNER${nonce}`.toUpperCase(), type: "fixed", value: 10 }).returning();
  const paidOrder = await order("paid", a, oldEmail, coupon.code);
  await db.insert(s.couponUses).values({ couponId: coupon.id, userId: a.id, orderNumber: paidOrder.orderNumber, status: "reserved", reservationExpiresAt: future });
  // Fixture identity transition only: public email-change remains release-gated.
  a.email = `owner-qa-${nonce}-new@example.test`;
  await db.update(s.users).set({ email: a.email }).where(eq(s.users.id, a.id));
  const b = await actor("reused", oldEmail);
  const outsiderCoupon = await db.transaction(tx => couponApi.redeemCouponReservationTx(tx, { orderNumber: paidOrder.orderNumber, couponCode: coupon.code, userId: b.id, now }));
  assert.equal(outsiderCoupon.ok, false);
  assert.equal((await callback(paidOrder)).status, "paid");
  const [stored] = await db.select().from(s.orders).where(eq(s.orders.id, paidOrder.id));
  assert.equal(stored.userId, a.id); assert.equal(stored.customerEmail, oldEmail);
  const access = await db.select().from(s.courseAccess).where(eq(s.courseAccess.orderNumber, paidOrder.orderNumber));
  assert.equal(access.length, 1); assert.equal(access[0].userEmail, a.email);
  assert.equal((await db.select().from(s.couponUses).where(eq(s.couponUses.orderNumber, paidOrder.orderNumber)))[0].status, "redeemed");
  assert.equal((await db.select().from(s.referralAttributions).where(eq(s.referralAttributions.id, attribution.id)))[0].status, "qualified");
  assert.ok(sent.some(message => message.to === a.pushToken)); assert.ok(!sent.some(message => message.to === b.pushToken));
  pass("delayed signed payment grants only the stable owner after email reuse, with coupon/referral identity preserved");
  const snapshot = (await db.select().from(s.invoices).where(eq(s.invoices.orderNumber, paidOrder.orderNumber)))[0];
  const downloaded = await invoice(a, paidOrder.orderNumber);
  assert.equal(downloaded.status, 200); const html = await downloaded.text();
  assert.ok(html.includes(oldEmail)); assert.ok(!html.includes(a.email));
  assert.equal((await invoice(b, paidOrder.orderNumber)).status, 403);
  for (const user of [a, b]) {
    const response = await dashboard.GET(request("/api/mobile/dashboard", user));
    assert.equal(response.status, 200); const data = await response.json();
    assert.equal(data.orders.some((row: { orderNumber: string }) => row.orderNumber === paidOrder.orderNumber), user.id === a.id);
    assert.equal(data.invoices.some((row: { orderNumber: string }) => row.orderNumber === paidOrder.orderNumber), user.id === a.id);
  }
  pass("web invoice download and native order/invoice lists use account ID while displaying immutable purchase details");
  const [notice] = await db.select().from(s.notificationsDb).where(eq(s.notificationsDb.dedupeKey, `order:${paidOrder.orderNumber}:paid`));
  assert.equal(notice.targetUserId, a.id); assert.equal(notice.userEmail, null);
  const visibleA = await (await notices.GET(request("/api/mobile/notifications", a))).json();
  const visibleB = await (await notices.GET(request("/api/mobile/notifications", b))).json();
  assert.ok(visibleA.notifications.some((row: { id: number }) => row.id === notice.id));
  assert.ok(!visibleB.notifications.some((row: { id: number }) => row.id === notice.id));
  assert.equal((await notices.PATCH(request("/api/mobile/notifications", b, { id: notice.id }, "PATCH"))).status, 404);
  assert.equal((await notices.PATCH(request("/api/mobile/notifications", a, { id: notice.id }, "PATCH"))).status, 200);
  pass("private bound notifications stay private in lists, unread counts and mark-read operations");
  const expiry = access[0].expiresAt, sentBefore = sent.length;
  await Promise.all([callback(paidOrder), callback(paidOrder)]);
  assert.equal((await db.select().from(s.invoices).where(eq(s.invoices.orderNumber, paidOrder.orderNumber))).length, 1);
  assert.equal((await db.select().from(s.couponsDb).where(eq(s.couponsDb.id, coupon.id)))[0].usedCount, 1);
  assert.equal((await db.select().from(s.courseAccess).where(eq(s.courseAccess.id, access[0].id)))[0].expiresAt, expiry);
  assert.equal(sent.length, sentBefore);
  pass("concurrent payment retries preserve one invoice, one coupon redemption, one grant and one paid notice");
  await callback(paidOrder, "REFUNDED");
  assert.ok((await db.select().from(s.courseAccess).where(eq(s.courseAccess.id, access[0].id)))[0].revokedAt);
  assert.equal((await db.select().from(s.referralAttributions).where(eq(s.referralAttributions.id, attribution.id)))[0].status, "pending");
  await callback(paidOrder);
  await db.transaction(tx => fulfillment.fulfillPaidOrderTx(tx, { ...stored, status: "pending" }, [{ courseSlug: "qa-physics", accessDurationDays: 90 }], { chargeId: paidOrder.tapChargeId, actorEmail: "qa", now }));
  assert.equal((await db.select().from(s.orders).where(eq(s.orders.id, paidOrder.id)))[0].status, "refunded");
  assert.ok((await db.select().from(s.courseAccess).where(eq(s.courseAccess.id, access[0].id)))[0].revokedAt);
  assert.deepEqual((await db.select().from(s.invoices).where(eq(s.invoices.id, snapshot.id)))[0], snapshot);
  pass("late refunds revoke the correct current-email access; stale fulfillment and callbacks cannot resurrect it");
  const unbound = await order("unbound", null, b.email), blockedOwner = await actor("blocked");
  const blocked = await order("blocked", blockedOwner, blockedOwner.email);
  await db.update(s.users).set({ status: "deleted" }).where(eq(s.users.id, blockedOwner.id));
  const beforeReview = sent.length;
  for (const candidate of [unbound, blocked]) {
    assert.equal((await callback(candidate)).status, "payment_review");
    assert.equal((await callback(candidate)).status, "payment_review");
    assert.equal((await db.select().from(s.courseAccess).where(eq(s.courseAccess.orderNumber, candidate.orderNumber))).length, 0);
    assert.equal((await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityId, candidate.orderNumber), eq(s.auditLogs.action, "ownership-review")))).length, 1);
  }
  assert.equal(sent.length, beforeReview);
  assert.equal((await push.sendPushNotification({ userId: null, audience: "public" }, "private", "fixture")).attempted, 0);
  assert.equal((await push.sendPushNotification({ userId: b.id + 1000000, userEmail: a.email, audience: "public" }, "private", "fixture")).attempted, 0);
  assert.equal((await push.sendPushNotification({ audience: "user" }, "private", "fixture")).attempted, 0);
  const unsafe = await notifications.createAndSendNotification({ values: { targetUserId: null, userEmail: null, audience: "student", title: "unsafe", body: "fixture" }, target: { userId: null } });
  assert.equal(unsafe.saved, false); assert.equal(sent.length, beforeReview);
  pass("unbound/deleted owners enter review without grants or broadcasts; missing push identities fail closed");
  const [queued] = await db.insert(s.notificationsDb).values({ userEmail: a.email, audience: "student", title: "Queued identity fixture", body: "private", pushEnabled: true, pushStatus: "pending" }).returning();
  assert.equal(queued.targetUserId, a.id);
  const retired = a.email; a.email = `owner-qa-${nonce}-latest@example.test`;
  await db.update(s.users).set({ email: a.email }).where(eq(s.users.id, a.id));
  const c = await actor("second-reuse", retired);
  // Isolate this dispatch without destroying other test artifacts or campaigns.
  const heldCampaigns = await db.select({ id: s.notificationsDb.id }).from(s.notificationsDb).where(and(eq(s.notificationsDb.pushEnabled, true), sql`${s.notificationsDb.id} <> ${queued.id}`));
  for (const row of heldCampaigns) await db.update(s.notificationsDb).set({ pushEnabled: false }).where(eq(s.notificationsDb.id, row.id));
  try { await campaigns.dispatchDuePushNotifications(50); }
  finally { for (const row of heldCampaigns) await db.update(s.notificationsDb).set({ pushEnabled: true }).where(eq(s.notificationsDb.id, row.id)); }
  const delivered = sent.filter(message => message.title === "Queued identity fixture");
  assert.deepEqual(delivered.map(message => message.to), [a.pushToken]);
  assert.ok(!delivered.some(message => message.to === c.pushToken));
  pass("scheduled push uses the inserted recipient ID even after another email change and reuse");
  const deleting = await actor("deleting", undefined, await auth.hashPassword("SyntheticDelete#Pass1"));
  const deletedOrder = await order("deleted-snapshot", deleting, deleting.email);
  const deleteReq = request("/api/mobile/account", deleting, { confirmation: "حذف حسابي", password: "SyntheticDelete#Pass1" }, "DELETE");
  deleteReq.headers.set("authorization", `Bearer ${deleting.token}`); deleteReq.headers.set("x-meras-client", "mobile-v1"); deleteReq.headers.delete("origin");
  deleteReq.headers.set("x-meras-platform", "android");
  const response = await mobileAccount.DELETE(deleteReq);
  assert.equal(response.status, 200, await response.text());
  const tombstone = (await db.select().from(s.users).where(eq(s.users.id, deleting.id)))[0];
  assert.equal(tombstone.status, "deleted"); assert.notEqual(tombstone.email, deleting.email);
  const retained = (await db.select().from(s.orders).where(eq(s.orders.id, deletedOrder.id)))[0];
  assert.equal(retained.userId, deleting.id); assert.equal(retained.customerEmail, deleting.email);
  assert.equal(await auth.getSessionUser(request("/api/auth/me", deleting)), null);
  assert.equal((await callback(deletedOrder)).status, "payment_review");
  pass("account deletion revalidates the session and retains an immutable financial owner tombstone");
  for (const mutation of ["revoke", "contact"] as const) {
    const buyer = await actor(`checkout-${mutation}`);
    await db.update(s.users).set({ phone: `+9665${String(10000000 + buyer.id)}`, universitySlug: "qa-university", specialty: "علوم الاختبار", academicLevel: "1" }).where(eq(s.users.id, buyer.id));
    let release!: () => void, entered!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const unlocked = new Promise<void>(resolve => { release = resolve; });
    const holder = db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${buyer.id})`);
      entered(); await unlocked;
      if (mutation === "revoke") await tx.update(s.authSessions).set({ revokedAt: new Date().toISOString() }).where(eq(s.authSessions.userId, buyer.id));
      else await tx.update(s.users).set({ email: `owner-qa-${nonce}-race-changed@example.test` }).where(eq(s.users.id, buyer.id));
    });
    await ready;
    const pending = checkout.POST(request("/api/checkout", buyer, { courseSlug: "qa-math", checkoutKey: `owner_checkout_${nonce}_${mutation}` }));
    let waiting = false;
    try {
      for (let attempt = 0; attempt < 120; attempt++) {
        const lock = await db.execute(sql`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND classid = 0 AND objid = ${buyer.id}::oid) AS waiting`);
        if (lock.rows[0]?.waiting === true) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    } finally { release(); await holder; }
    const response = await pending;
    assert.equal(waiting, true, "Checkout must serialize on the account before creating a charge");
    assert.equal(response.status, mutation === "revoke" ? 401 : 409, await response.text());
    assert.equal((await db.select().from(s.orders).where(eq(s.orders.userId, buyer.id))).length, 0);
  }
  pass("checkout waiting on an account lock rechecks revoked sessions and changed contact data before creating an order or charge");
  writeFileSync(".data/qa-order-ownership-report.json", JSON.stringify({ passed: checks.length, checks, reviewOrder: unbound.orderNumber, liveProviders: false, database: "isolated PostgreSQL", boundary: "real routes/signatures/SQL; synthetic transport, not live payment or physical phone" }, null, 2));
} finally {
  globalThis.fetch = originalFetch; delete process.env.TAP_SECRET_KEY;
  await closeDb();
}
