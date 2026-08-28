import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("..", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

test("disabled purchases block additions but keep cart cleanup available", async () => {
  const route = await read("app/api/cart/route.ts");
  const parseAt = route.indexOf("request.json()");
  const guardAt = route.indexOf("!settingEnabled(platformSettings.purchases_enabled)");
  assert.ok(parseAt >= 0 && guardAt > parseAt, "feature guard must inspect the requested mutation");
  assert.match(route, /payload\.clear !== true && payload\.active !== false/);
  assert.match(route, /if \(payload\.clear === true\)[\s\S]*delete\(cartItems\)/);
  assert.match(route, /if \(payload\.active === false\) await db\.delete\(cartItems\)/);
});

test("notification campaigns keep per-user read state and exact unread totals", async () => {
  const [schema, service, route, dashboard] = await Promise.all([
    read("db/schema.ts"),
    read("lib/notifications.ts"),
    read("app/api/mobile/notifications/route.ts"),
    read("app/dashboard/page.tsx"),
  ]);
  assert.match(schema, /export const notificationReads = pgTable\("notification_reads"/);
  assert.match(schema, /primaryKey\(\{ name: "notification_reads_pk"/);
  assert.match(service, /eq\(notificationReads\.userId, user\.id\)/);
  assert.match(service, /countUnreadVisibleNotifications/);
  assert.match(service, /db\.transaction\(async \(tx\)/);
  assert.doesNotMatch(route, /update\(notificationsDb\).*readAt/s);
  assert.match(route, /countUnreadVisibleNotifications\(user\)/);
  assert.match(dashboard, /getVisibleNotifications\(user, 30\)/);
});

test("Tap references cannot bind two orders and post-payment reversals revoke access", async () => {
  const webhook = await read("app/api/webhooks/tap/route.ts");
  assert.match(webhook, /chargeOrder && referenceOrder && chargeOrder\.id !== referenceOrder\.id/);
  assert.doesNotMatch(webhook, /or\(eq\(orders\.tapChargeId, chargeId\), eq\(orders\.orderNumber, orderNumber\)\)/);
  for (const status of ["REFUNDED", "REVERSED", "CHARGEBACK"]) assert.match(webhook, new RegExp(status));
  assert.match(webhook, /update\(courseAccess\)\.set\(\{ revokedAt: now \}\)/);
  assert.match(webhook, /eq\(courseAccess\.orderNumber, current\.orderNumber\)/);
  assert.match(webhook, /GREATEST\(0, \$\{couponsDb\.usedCount\} - 1\)/);
  assert.match(webhook, /status === "PARTIALLY_REFUNDED"\) return "partially_refunded"/);
  assert.match(webhook, /nextStatus === "partially_refunded"/);
  const partialBlock = webhook.slice(webhook.indexOf('if (nextStatus === "partially_refunded")'), webhook.indexOf('if (["refunded", "reversed", "chargeback"].includes(nextStatus))'));
  assert.doesNotMatch(partialBlock, /revokedAt: now/);
  assert.match(partialBlock, /يظل وصولك للمواد فعالًا/);
  assert.match(webhook, /paymentReversed \|\| releaseReservation/);
});

test("the generated upgrade migration preserves legacy reads and wires scoped sync", async () => {
  const [migration, checkoutMigration, journal, railway] = await Promise.all([
    read("drizzle/0011_api_contract_integrity.sql"),
    read("drizzle/0012_checkout_idempotency.sql"),
    read("drizzle/meta/_journal.json"),
    read("scripts/start-railway.sh"),
  ]);
  const parsed = JSON.parse(journal);
  assert.ok(parsed.entries.some((entry) => entry.tag === "0011_api_contract_integrity"));
  assert.equal(parsed.entries.at(-1)?.tag, "0012_checkout_idempotency");
  assert.match(migration, /CREATE TABLE "notification_reads"/);
  assert.match(migration, /ON DELETE cascade/);
  assert.match(migration, /INNER JOIN "users" u ON lower\(u\."email"\) = lower\(n\."user_email"\)/);
  assert.match(migration, /CREATE TRIGGER sync_notification_reads_scoped/);
  assert.match(migration, /meras_touch_sync\('notifications', 'user:' \|\| user_key\)/);
  assert.match(migration, /ADD COLUMN "coupon_reserved" boolean DEFAULT false NOT NULL/);
  assert.match(migration, /ADD COLUMN "coupon_reservation_expires_at" text/);
  assert.match(migration, /ALTER COLUMN "total" SET DATA TYPE numeric\(12, 2\)/);
  assert.match(migration, /auth_rate_limits_expiry_idx/);
  for (const column of ["checkout_attempt_hash", "checkout_request_hash", "checkout_url", "checkout_expires_at"]) assert.match(checkoutMigration, new RegExp(`ADD COLUMN "${column}"`));
  assert.match(checkoutMigration, /CREATE UNIQUE INDEX "orders_checkout_attempt_unique"/);
  assert.match(railway, /drizzle-kit migrate/);
});

test("coupon reservations expire, revalidate under lock, and release exactly once", async () => {
  const checkout = await read("app/api/checkout/route.ts");
  assert.match(checkout, /releaseExpiredCouponReservations\(now\)/);
  assert.match(checkout, /SELECT id FROM coupons WHERE code = \$\{couponQuote\.code\} FOR UPDATE/);
  assert.match(checkout, /couponReservationExpiresAt: couponQuote \? checkoutExpiresAt : null/);
  assert.match(checkout, /eq\(orders\.couponReserved, true\)/);
  assert.match(checkout, /GREATEST\(0, \$\{couponsDb\.usedCount\} - 1\)/);
});

test("student support reads are SQL-scoped and hide staff identities", async () => {
  const route = await read("app/api/support/route.ts");
  assert.match(route, /inArray\(supportReplies\.ticketId, ticketIds\)/);
  assert.match(route, /inArray\(supportReplyFiles\.replyId, replyIds\)/);
  const studentShape = route.slice(route.lastIndexOf("id: ticket.id"), route.indexOf("export async function DELETE"));
  assert.doesNotMatch(studentShape, /assignedTo:/);
  assert.doesNotMatch(studentShape, /authorEmail:/);
  assert.match(route, /support-status-write/);
});

test("specialty aliases share one recommendation and supervisor scope", async () => {
  const [academic, catalog, requests] = await Promise.all([
    read("lib/academic-data.ts"),
    read("lib/catalog-store.ts"),
    read("app/api/course-requests/route.ts"),
  ]);
  assert.match(academic, /specialtyNameVariants/);
  assert.match(academic, /specialtiesEquivalent/);
  assert.match(academic, /program\.aliases/);
  assert.match(catalog, /matchesProgram = \(course: Course\) => specialtiesEquivalent/);
  assert.match(requests, /inArray\(supervisorAssignments\.specialty, specialtyNames\)/);
});

test("platform settings validate completely before an atomic save", async () => {
  const route = await read("app/api/admin/console/route.ts");
  const block = route.slice(route.indexOf('if (action === "saveSettings")'), route.indexOf('if (action === "createNotification")'));
  const validationEnd = block.indexOf("await db.transaction");
  assert.ok(validationEnd > block.indexOf("for (const [key, value] of entries)"));
  assert.doesNotMatch(block.slice(0, validationEnd), /\.insert\(platformSettings\)/);
  assert.match(block.slice(validationEnd), /tx\.insert\(platformSettings\)/);
  assert.match(block.slice(validationEnd), /tx\.insert\(auditLogs\)/);
});

test("native pre-auth and public preview requests work without weakening browser origin checks", async () => {
  const [auth, mobileApi, login, register, forgot, reset, assistant, video, sync] = await Promise.all([
    read("lib/auth.ts"),
    read("lib/mobile-api.ts"),
    read("app/api/mobile/auth/login/route.ts"),
    read("app/api/mobile/auth/register/route.ts"),
    read("app/api/auth/forgot-password/route.ts"),
    read("app/api/auth/reset-password/route.ts"),
    read("app/api/assistant/route.ts"),
    read("app/api/video/session/route.ts"),
    read("app/api/sync/route.ts"),
  ]);
  assert.match(mobileApi, /x-meras-client/);
  assert.match(mobileApi, /if \(sameOriginRequest\(request\)\) return true/);
  assert.match(mobileApi, /if \(origin\) return false/);
  assert.match(mobileApi, /contentType !== "application\/json"/);
  assert.doesNotMatch(mobileApi, /&& sameOriginRequest\(request\);/);
  assert.match(login, /isMobileRequest\(request\)/);
  assert.match(register, /isMobileRequest\(request\)/);
  for (const route of [forgot, reset, assistant]) assert.match(route, /!sameOriginRequest\(request\) && !isMobileRequest\(request\)/);
  assert.match(video, /!isMobileRequest\(request\)/);
  assert.match(sync, /!isMobileRequest\(request\)/);
  assert.match(sync, /export async function POST\(request: Request\)/);
  assert.ok(auth.indexOf("if (!origin)") < auth.indexOf("if (bearerToken(request.headers)) return true"), "a supplied cross-site Origin must be checked before Bearer bypass");
});

test("checkout uses a user-scoped strong idempotency key across server, Tap, web, and Expo", async () => {
  const [schema, checkout, webAttempt, webCart, webCheckout, mobileAttempt, mobileCart] = await Promise.all([
    read("db/schema.ts"),
    read("app/api/checkout/route.ts"),
    read("lib/checkout-attempt-client.ts"),
    read("components/cart-client.tsx"),
    read("components/checkout-client.tsx"),
    read("../mobile/src/lib/checkout-attempt.ts"),
    read("../mobile/app/cart.tsx"),
  ]);
  assert.match(schema, /uniqueIndex\("orders_checkout_attempt_unique"\)\.on\(table\.checkoutAttemptHash\)/);
  assert.match(checkout, /CHECKOUT_ATTEMPT_PATTERN/);
  assert.match(checkout, /checkout:\$\{user\.id\}:\$\{attemptKey\}/);
  assert.match(checkout, /IDEMPOTENCY_CONFLICT/);
  assert.match(checkout, /reference: \{ transaction: order\.orderNumber, order: order\.orderNumber, idempotent: order\.orderNumber \}/);
  assert.match(checkout, /x-idempotent-replay/);
  assert.match(checkout, /isUniqueConstraintError\(error\)/);
  assert.match(checkout, /return pendingResponse\(order, courseSlugs, reused\)/);
  assert.match(checkout, /pg_advisory_xact_lock\(hashtextextended/);
  assert.match(checkout, /eq\(orders\.checkoutRequestHash, checkoutRequestHash\)/);
  assert.match(checkout, /if \(inFlight\) return inFlight/);
  for (const client of [webCart, webCheckout, mobileCart]) assert.match(client, /["']idempotency-key["']/);
  for (const attempt of [webAttempt, mobileAttempt]) {
    assert.match(attempt, /checkout:v1:/);
    assert.match(attempt, /24 \* 60 \* 60 \* 1000/);
    assert.match(attempt, /MAX_STORED_ATTEMPTS = 12/);
    assert.match(attempt, /new Map<string, StoredAttempt>/);
    assert.match(attempt, /filter\(\(attempt\) => attempt\.intent !== intent\)/);
  }
  assert.match(webAttempt, /memoryAttempts\.set\(intent, created\)/);
  assert.match(webAttempt, /catch \{ \/\* memoryAttempts guarantees same-page retry safety/);
  assert.match(mobileCart, /timeoutMs: 30_000/);
});

test("zero-priced published courses complete atomically without a Tap charge", async () => {
  const checkout = await read("app/api/checkout/route.ts");
  assert.match(checkout, /async function completeFreeCheckout/);
  assert.match(checkout, /source: "free_checkout"/);
  assert.match(checkout, /if \(freeCheckout\) return completeFreeCheckout/);
  assert.match(checkout, /if \(!freeCheckout && !tapSecretKey\)/);
  const tapBlock = checkout.slice(checkout.indexOf("async function startTapCheckout"), checkout.indexOf("async function replayAttempt"));
  assert.match(tapBlock, /order\.total === 0 && order\.subtotal === 0/);
  assert.ok(tapBlock.indexOf("completeFreeCheckout") < tapBlock.indexOf('fetch("https://api.tap.company'));
});

test("sensitive operational mutations fail closed when configured settings cannot be read", async () => {
  const [settings, publicRoute, home, course] = await Promise.all([
    read("lib/platform-settings.ts"),
    read("app/api/public/settings/route.ts"),
    read("app/page.tsx"),
    read("app/courses/[slug]/page.tsx"),
  ]);
  assert.match(settings, /available: false/);
  assert.match(settings, /getMutationPublicSettings/);
  assert.match(settings, /PLATFORM_SETTINGS_UNAVAILABLE/);
  assert.match(settings, /getFailClosedPublicSettings/);
  assert.match(settings, /purchases_enabled: "false"/);
  assert.match(publicRoute, /getMutationPublicSettings/);
  assert.match(publicRoute, /503/);
  for (const surface of [home, course]) assert.match(surface, /getFailClosedPublicSettings/);
  for (const routePath of ["app/api/auth/register/route.ts", "app/api/mobile/auth/register/route.ts", "app/api/checkout/route.ts", "app/api/course-requests/route.ts", "app/api/support/route.ts"]) {
    const route = await read(routePath);
    assert.match(route, /getMutationPublicSettings/);
    assert.match(route, /catch \{ return jsonError\([^\n]+503\); \}/);
  }
});

test("native Tap return uses a sanitized public bridge while web keeps its dashboard return", async () => {
  const [checkout, page, bridge] = await Promise.all([
    read("app/api/checkout/route.ts"),
    read("app/payment/return/page.tsx"),
    read("components/mobile-payment-return.tsx"),
  ]);
  assert.match(checkout, /request\.headers\.get\("x-meras-client"\) === MOBILE_CLIENT/);
  assert.match(checkout, /\/payment\/return\?channel=mobile&order=/);
  assert.match(checkout, /\/dashboard\?payment=return&order=/);
  assert.match(page, /\^MR-\[A-Z0-9-\]/);
  assert.match(bridge, /merasalelm:\/\/orders\?payment=return&order=/);
  assert.doesNotMatch(page + bridge, /getDb|orders\)|customerEmail|total/);
});

test("assistant financial context expands multi-course order items", async () => {
  const context = await read("lib/assistant-context.ts");
  assert.match(context, /inArray\(orderItems\.orderNumber, orderRows\.map/);
  assert.match(context, /slugs\.length \? slugs : \[order\.courseSlug\]/);
  assert.match(context, /orderTitles\(row\)/);
});
