import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(join(here, "..", relative), "utf8");
const checkout = await read("app/api/checkout/route.ts");
const cart = await read("app/api/cart/route.ts");
const catalogStore = await read("lib/catalog-store.ts");
const videoUpload = await read("app/api/admin/videos/route.ts");
const account = await read("app/api/mobile/account/route.ts");
const health = await read("app/api/health/route.ts");
const push = await read("app/api/mobile/push/route.ts");
const logo = await read("app/api/logos/[slug]/route.ts");

test("checkout has abuse protection, atomic order creation, and an upstream timeout", () => {
  assert.match(checkout, /checkRateLimit\("checkout"/);
  assert.match(checkout, /db\.transaction\(async \(tx\)/);
  assert.match(checkout, /AbortSignal\.timeout\(15_000\)/);
  assert.match(checkout, /status: "failed"/);
});

test("checkout serializes matching carts and gives Tap a bounded redirect lifetime", () => {
  assert.match(checkout, /const requestedSorted = \[\.\.\.uniqueSlugs\]\.sort\(\)/);
  assert.match(checkout, /const requestedCartJson = JSON\.stringify\(requestedSorted\)/);
  assert.match(checkout, /checkout:\$\{user\.id\}:\$\{requestedCartJson\}/);
  assert.match(checkout, /pg_advisory_xact_lock\(hashtext\(/);
  assert.match(checkout, /INTERVAL '30 minutes'/);
  assert.match(checkout, /jsonb_agg\(oi\.course_slug ORDER BY oi\.course_slug\)/);
  assert.match(checkout, /IS NOT DISTINCT FROM/);
  assert.ok(checkout.indexOf("pg_advisory_xact_lock") < checkout.indexOf("jsonb_agg"));
  assert.ok(checkout.indexOf("jsonb_agg") < checkout.indexOf("tx.insert(orders)"));
  assert.doesNotMatch(checkout, /recentOrders[\s\S]{0,500}\.limit\(20\)/);
  assert.match(checkout, /transaction: \{ expiry: \{ period: CHECKOUT_EXPIRY_MINUTES, type: "MINUTE" \} \}/);
});

test("published courses require at least one ready lesson before cart or payment", () => {
  assert.match(catalogStore, /lessons\.length > 0 && readyLessons > 0/);
  assert.doesNotMatch(catalogStore, /readyLessons === lessons\.length/);
  assert.match(cart, /!course\.availableForPurchase/);
  assert.match(checkout, /selected\.filter\(\(course\) => !course\.availableForPurchase\)/);
});

test("video upload requires detected container bytes and refreshes catalog state", () => {
  assert.match(videoUpload, /function compatibleVideoType/);
  assert.match(videoUpload, /if \(!compatibleVideoType\(declaredType, detectedType\)\)/);
  assert.match(videoUpload, /invalidateCatalogCache\(\)/);
});

test("self-account deletion is student-only, transactional, and cleans support objects", () => {
  assert.match(account, /current\.role !== "student"/);
  assert.match(account, /supportReplyFiles/);
  assert.match(account, /db\.transaction\(async \(tx\)/);
  assert.match(account, /deleteObject\(objectKey\)/);
  assert.doesNotMatch(account, /db\.update\(auditLogs\)/);
  assert.match(account, /financialRecordsRetained: true/);
});

test("health endpoint does not expose database exception details", () => {
  assert.match(health, /catch \{\n/);
  assert.doesNotMatch(health, /error:\s*error/);
  assert.match(health, /no-store/);
});

test("push device writes have per-user rate limiting", () => {
  assert.equal((push.match(/checkRateLimit\("push-device-write"/g) || []).length, 2);
});

test("public logos derive a safe content type from the stored extension", () => {
  assert.match(logo, /function imageTypeForKey/);
  assert.match(logo, /image\/webp/);
  assert.match(logo, /x-content-type-options/);
});
