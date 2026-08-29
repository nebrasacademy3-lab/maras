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

test("published course templates remain purchasable while videos are added", () => {
  assert.match(catalogStore, /availableForPurchase: true/);
  assert.doesNotMatch(cart, /قيد التجهيز ولا يمكن إضافتها للسلة/);
  assert.doesNotMatch(checkout, /قيد التجهيز ولا تقبل الدفع/);
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
