import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const backendRoot = new URL("..", import.meta.url);
const mobileRoot = new URL("../../mobile/", import.meta.url);
const readBackend = (relative) => readFile(new URL(relative, backendRoot), "utf8");
const readMobile = (relative) => readFile(new URL(relative, mobileRoot), "utf8");

test("checkout attempts have a persistent unique database identity", async () => {
  const [schema, migration, journal] = await Promise.all([
    readBackend("db/schema.ts"),
    readBackend("drizzle/0012_checkout_idempotency.sql"),
    readBackend("drizzle/meta/_journal.json"),
  ]);
  for (const column of ["checkout_attempt_hash", "checkout_request_hash", "checkout_url", "checkout_expires_at"]) {
    assert.match(schema, new RegExp("[\"']" + column + "[\"']"), "schema omits " + column);
    assert.match(migration, new RegExp("ADD COLUMN \"" + column + "\""), "migration omits " + column);
  }
  assert.match(schema, /uniqueIndex\(["']orders_checkout_attempt_unique["']\)\.on\(table\.checkoutAttemptHash\)/);
  assert.match(migration, /CREATE UNIQUE INDEX "orders_checkout_attempt_unique"[\s\S]*"checkout_attempt_hash"/);
  assert.equal(JSON.parse(journal).entries.at(-1)?.tag, "0012_checkout_idempotency");
});

test("checkout replays one request, rejects key reuse for another cart, and gives Tap one stable reference", async () => {
  const checkout = await readBackend("app/api/checkout/route.ts");
  assert.match(checkout, /request\.headers\.get\(["']idempotency-key["']\)/);
  assert.match(checkout, /CHECKOUT_ATTEMPT_PATTERN\.test\(attemptKey\)/);
  assert.match(checkout, /hashOpaqueToken\(\x60checkout:\$\{user\.id\}:\$\{attemptKey\}\x60\)/,
    "the client key is not scoped to the authenticated account before persistence");
  assert.match(checkout, /hashOpaqueToken\(JSON\.stringify\(\{ courseSlugs: uniqueSlugs, coupon \}\)\)/,
    "the idempotency key is not bound to the canonical cart and coupon payload");
  assert.match(checkout, /eq\(orders\.checkoutAttemptHash, attemptHash\)/);
  assert.match(checkout, /checkoutRequestHash !== requestHash/);
  assert.match(checkout, /code: ["']IDEMPOTENCY_CONFLICT["']/);
  assert.match(checkout, /isUniqueConstraintError\(error\)[\s\S]{0,360}replayAttempt\(/,
    "two simultaneous first requests do not converge on the unique checkout attempt");

  assert.match(checkout, /status: 202/);
  assert.match(checkout, /["']retry-after["']:\s*["']2["']/);
  assert.match(checkout, /catch \{[\s\S]{0,220}return pendingResponse\(order, courseSlugs, reused\)/,
    "an ambiguous Tap timeout is incorrectly closed and retried as a new charge");
  assert.match(checkout, /reference:\s*\{[^}]*transaction: order\.orderNumber[^}]*order: order\.orderNumber[^}]*idempotent: order\.orderNumber/,
    "Tap does not receive the order's stable idempotent reference");
});

test("both web checkout surfaces and the Expo cart reuse one strong key for the same intent", async () => {
  const [webAttempt, webSingle, webCart, mobileAttempt, mobileCart, mobileApi] = await Promise.all([
    readBackend("lib/checkout-attempt-client.ts"),
    readBackend("components/checkout-client.tsx"),
    readBackend("components/cart-client.tsx"),
    readMobile("src/lib/checkout-attempt.ts"),
    readMobile("app/cart.tsx"),
    readMobile("src/lib/api.ts"),
  ]);

  for (const [label, helper] of [["web", webAttempt], ["Expo", mobileAttempt]]) {
    assert.match(helper, /courseSlugs: \[\.\.\.new Set\(courseSlugs\.filter\(Boolean\)\)\]\.sort\(\)/,
      label + " checkout intent depends on cart ordering");
    assert.match(helper, /coupon: coupon\?\.trim\(\)\.toUpperCase\(\) \|\| ["']["']/,
      label + " checkout intent does not canonicalize coupons");
    assert.match(helper, /const memoryAttempts = new Map/,
      label + " creates a new key on retry when persistent storage is temporarily unavailable");
    assert.match(helper, /if \(stored\) return stored\.key/,
      label + " does not reuse the existing attempt for an unchanged intent");
    assert.match(helper, /MAX_ATTEMPT_AGE/);
    assert.match(helper, /KEY_PATTERN\.test/);
  }
  assert.match(webAttempt, /crypto\.randomUUID/);
  assert.match(webAttempt, /localStorage\.(?:getItem|setItem)/);
  assert.match(mobileAttempt, /Crypto\.randomUUID/);
  assert.match(mobileAttempt, /SecureStore\.(?:getItemAsync|setItemAsync)/);

  for (const [label, client] of [["single-course web", webSingle], ["web cart", webCart], ["Expo cart", mobileCart]]) {
    assert.match(client, /getCheckoutAttemptKey\(intent\)/, label + " does not allocate a persistent attempt key");
    assert.match(client, /["']idempotency-key["']:\s*attemptKey/, label + " does not send the attempt key");
    const keyAt = client.indexOf("getCheckoutAttemptKey(intent)");
    const retryAt = client.indexOf("for (let retry", keyAt);
    assert.ok(keyAt >= 0 && retryAt > keyAt, label + " generates a fresh key inside its retry loop");
    assert.match(client, /(?:response\.status === 202|result\.pending|data\.pending)/,
      label + " cannot reconcile an ambiguous pending attempt");
  }
  assert.match(webSingle, /data\.newAttemptRequired[\s\S]{0,80}clearCheckoutAttempt\(intent\)/);
  assert.match(webCart, /data\.newAttemptRequired[\s\S]{0,80}clearCheckoutAttempt\(intent\)/);
  assert.match(mobileApi, /newAttemptRequired:\s*boolean/);
  assert.match(mobileCart, /reason\.newAttemptRequired[\s\S]{0,100}clearCheckoutAttempt\(intent\)/);
});
