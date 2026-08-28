import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("..", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

test("configured platform-settings failures are distinguishable from an intentional no-database build", async () => {
  const settings = await read("lib/platform-settings.ts");
  assert.match(settings, /if \(!process\.env\.DATABASE_URL\) return \{ value: output, available: true \}/,
    "local builds without a database cannot intentionally use documented defaults");
  assert.match(settings, /catch \{[\s\S]{0,120}return \{ value: output, available: false \}/,
    "a configured database read failure is still reported as available");
  assert.match(settings, /export async function getMutationPublicSettings/);
  assert.match(settings, /if \(!snapshot\.available\) throw new Error\(["']PLATFORM_SETTINGS_UNAVAILABLE["']\)/,
    "state-changing routes cannot fail closed when configured settings are unavailable");
});

test("every feature-controlled sensitive mutation uses the fail-closed settings reader", async () => {
  const routes = [
    ["web registration", "app/api/auth/register/route.ts"],
    ["native registration", "app/api/mobile/auth/register/route.ts"],
    ["cart additions", "app/api/cart/route.ts"],
    ["coupon validation", "app/api/coupons/validate/route.ts"],
    ["checkout", "app/api/checkout/route.ts"],
    ["course requests", "app/api/course-requests/route.ts"],
    ["support writes", "app/api/support/route.ts"],
  ];
  for (const [label, relative] of routes) {
    const source = await read(relative);
    assert.match(source, /getMutationPublicSettings/, `${label} uses public defaults for a sensitive mutation`);
    assert.match(source, /catch \{ return jsonError\([^;]+, 503\); \}/,
      `${label} does not return a safe service-unavailable response when settings cannot be verified`);
  }
});
