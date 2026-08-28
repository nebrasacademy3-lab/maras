import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const backendRoot = new URL("..", import.meta.url);
const mobileRoot = new URL("../../mobile/", import.meta.url);
const readBackend = (relative) => readFile(new URL(relative, backendRoot), "utf8");
const readMobile = (relative) => readFile(new URL(relative, mobileRoot), "utf8");

function assertArabicLabel(source, value, surface) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const quoted = `["']${escaped}["']`;
  const arabic = `[\\u0600-\\u06ff]`;
  const supportedForms = new RegExp(
    `(?:${quoted}|\\b${escaped}\\b)\\s*:\\s*["'][^"']*${arabic}[^"']*["']` +
      `|case\\s+${quoted}\\s*:\\s*return\\s*["'][^"']*${arabic}[^"']*["']` +
      `|\\[\\s*${quoted}\\s*,\\s*["'][^"']*${arabic}[^"']*["']\\]`,
  );
  assert.match(source, supportedForms, `${surface}: missing an Arabic label for ${value}`);
}

test("Expo reader builds do not render cart, coupon, Tap, or add-to-cart actions", async () => {
  const [cart, course] = await Promise.all([
    readMobile("app/cart.tsx"),
    readMobile("app/course/[slug].tsx"),
  ]);

  assert.match(cart, /STORE_MODE/, "cart does not inspect the configured store mode");
  const readerGuard = /if\s*\(\s*STORE_MODE\s*(?:===\s*["']reader["']|!==\s*["']external["'])\s*\)\s*return\b/;
  const guard = readerGuard.exec(cart);
  assert.ok(guard, "cart must return a reader-safe screen before rendering commerce controls");
  const firstCommerceControl = Math.min(
    ...["كود الخصم", "تطبيق", "الدفع عبر Tap"].map((label) => {
      const index = cart.indexOf(label);
      return index < 0 ? Number.POSITIVE_INFINITY : index;
    }),
  );
  assert.ok(
    guard.index < firstCommerceControl,
    "the reader guard must run before coupon and Tap controls are rendered",
  );

  const addToCart = course.indexOf("إضافة إلى السلة");
  assert.ok(addToCart >= 0, "course purchase UI contract could not locate the add-to-cart control");
  const purchaseCondition = course.slice(Math.max(0, addToCart - 700), addToCart);
  assert.match(
    purchaseCondition,
    /STORE_MODE\s*(?:===\s*["']external["']|!==\s*["']reader["'])|(?:canPurchase|commerceAvailable|commerceEnabled|purchasesAvailable)/,
    "the add-to-cart control is not gated to external-store builds",
  );
  if (!/STORE_MODE\s*(?:===\s*["']external["']|!==\s*["']reader["'])/.test(purchaseCondition)) {
    assert.match(
      course,
      /(?:canPurchase|commerceAvailable|commerceEnabled|purchasesAvailable)\s*=\s*[^;\n]*STORE_MODE\s*(?:===\s*["']external["']|!==\s*["']reader["'])/,
      "the named purchase guard is not derived from STORE_MODE external",
    );
  }
});

test("Expo admin renders Arabic status, role, audience, and choice labels", async () => {
  const admin = await readMobile("app/admin.tsx");

  for (const value of [
    "student", "supervisor", "admin",
    "active", "suspended", "published", "hidden",
    "new", "assigned", "reviewing", "planned", "producing", "available", "declined",
    "open", "waiting", "resolved", "closed",
    "pending", "initiated", "paid", "failed", "cancelled", "voided", "rejected",
    "uploading", "ready", "disabled",
    "public", "user",
    "percent", "fixed",
  ]) {
    assertArabicLabel(admin, value, "mobile admin");
  }

  assert.doesNotMatch(
    admin,
    /function adminLabel\([^)]*\)[^\n{]*\{[^\n}]*\|\|\s*value/,
    "mobile admin falls back to exposing an unknown internal English value",
  );

  const safeTextBoundary = /function Text\([^)]*\)[\s\S]{0,420}(?:adminLabel\(child\)|adminLabels\[child\]\s*\?\s*adminLabels\[child\])/.test(admin);

  const rawRenderPatterns = [
    />\s*\{row\.status\}\s*<\/Text>/,
    />\s*\{row\.role\}\s*<\/Text>/,
    /\{row\.audience\}\s*[·<]/,
    />\s*\{selected\.status\}\s*<\/Text>/,
    />\s*\{status\}\s*<\/Text>/,
  ];
  for (const pattern of rawRenderPatterns) {
    if (pattern.test(admin)) {
      assert.ok(safeTextBoundary, `mobile admin still renders an internal English value without a safe translation boundary: ${pattern}`);
    }
  }
});

test("Expo student and supervisor surfaces use Arabic fallbacks for unknown statuses", async () => {
  const [requests, orders, support, supervisor] = await Promise.all([
    readMobile("app/requests.tsx"),
    readMobile("app/orders.tsx"),
    readMobile("app/support.tsx"),
    readMobile("app/supervisor.tsx"),
  ]);

  assert.match(requests, /\)\[status\]\s*\|\|\s*["']حالة غير معروفة["']/);
  assert.doesNotMatch(requests, /\)\[status\]\s*\|\|\s*status\b/);
  assert.match(orders, /orderLabels\[order\.status\]\s*\|\|\s*["']حالة غير معروفة["']/);
  assert.doesNotMatch(orders, /orderLabels\[order\.status\]\s*\|\|\s*order\.status/);
  assert.match(support, /labels\[ticket\.status\]\s*\|\|\s*["']حالة غير معروفة["']/);
  assert.doesNotMatch(support, /labels\[ticket\.status\]\s*\|\|\s*ticket\.status/);
  assert.match(supervisor, /labels\[status\]\s*\|\|\s*["']حالة غير معروفة["']/);
  assert.doesNotMatch(supervisor, /labels\[status\]\s*\|\|\s*status\b/);
});

test("web supervisor translates upload states instead of exposing storage enums", async () => {
  const supervisor = await readBackend("components/supervisor-dashboard.tsx");
  assertArabicLabel(supervisor, "ready", "web supervisor");
  assertArabicLabel(supervisor, "uploading", "web supervisor");
  assert.doesNotMatch(
    supervisor,
    /<em>\s*\{row\.status\}\s*<\/em>/,
    "web supervisor exposes the raw video storage status",
  );
  assert.doesNotMatch(
    supervisor,
    /supervisorStatus[^\n]*\|\|\s*value/,
    "web supervisor falls back to exposing unknown storage enums",
  );
});

test("web student, support, admin, and supervisor messages never expose raw internal enums", async () => {
  const [student, support, admin, supervisorRequests, adminApi] = await Promise.all([
    readBackend("components/student-dashboard.tsx"),
    readBackend("components/support-form.tsx"),
    readBackend("components/admin-dashboard.tsx"),
    readBackend("app/api/supervisor/requests/route.ts"),
    readBackend("app/api/admin/console/route.ts"),
  ]);

  assert.match(student, /\)\[status\]\s*\|\|\s*["']حالة غير معروفة["']/,
    "web student status fallback exposes a raw server enum");
  assert.match(student, /\)\[currency\]\s*\|\|\s*["']عملة غير معروفة["']/,
    "web student currency fallback exposes a raw server enum");
  assert.match(student, /\)\[category\]\s*\|\|\s*["']تصنيف غير معروف["']/,
    "web student support category fallback exposes a raw server enum");
  assert.doesNotMatch(student, /\)\[(?:status|currency|category)\]\s*\|\|\s*(?:status|currency|category)\b/);

  assert.match(support, /statusLabel\[ticket\.status\]\s*\|\|\s*["']حالة غير معروفة["']/);
  assert.match(support, /statusLabel\[selected\.status\]\s*\|\|\s*["']حالة غير معروفة["']/);
  assert.doesNotMatch(support, /statusLabel\[[^\]]+\.status\]\s*\|\|\s*[^"']*(?:ticket|selected)\.status/,
    "web support exposes an unknown raw ticket status");

  for (const [helper, fallback] of [
    ["audienceLabel", "جمهور غير معروف"],
    ["categoryLabel", "تصنيف غير معروف"],
    ["currencyLabel", "عملة غير معروفة"],
  ]) {
    const body = admin.match(new RegExp(`const ${helper}=\\(value:string\\)=>\\([\\s\\S]{0,260}`))?.[0] || "";
    assert.match(body, new RegExp(`\\|\\|["']${fallback}["']`),
      `web admin ${helper} can expose an unknown internal value`);
    assert.doesNotMatch(body, /\|\|\s*value\b/,
      `web admin ${helper} falls back to raw English data`);
  }

  assert.match(supervisorRequests, /\)\[status\]\s*\|\|\s*["']حالة غير معروفة["']/,
    "supervisor notification body can expose an unknown English request status");
  assert.doesNotMatch(supervisorRequests, /\)\[status\]\s*\|\|\s*status\b/);

  assert.match(adminApi, /function requestStatusLabel[\s\S]{0,520}\)\[value\]\s*\|\|\s*["']حالة غير معروفة["']/,
    "admin request notifications can expose a raw request status");
  assert.match(adminApi, /function ticketStatusLabel[\s\S]{0,420}\)\[value\]\s*\|\|\s*["']حالة غير معروفة["']/,
    "admin support notifications can expose a raw ticket status");
  assert.match(adminApi, /requestStatusLabel\(status\)/);
  assert.match(adminApi, /ticketStatusLabel\(status\)/);
  assert.doesNotMatch(adminApi, /إلى\s+[«']?\$\{status\}/,
    "admin notification text interpolates a raw internal status");
});
