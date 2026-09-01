import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const pricingSource = await read("lib/bundle-pricing.ts");
const pricingJavaScript = ts.transpileModule(pricingSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const pricing = await import(`data:text/javascript;base64,${Buffer.from(pricingJavaScript).toString("base64")}`);

test("bundle pricing is calculated in minor units and always leaves a payable amount", () => {
  assert.equal(pricing.calculateBundleDiscountMinor("percent", 15, 30_000), 4_500);
  assert.equal(pricing.calculateBundleDiscountMinor("fixed", 25.55, 30_000), 2_555);
  assert.equal(pricing.calculateBundleDiscountMinor("fixed", 999, 30_000), 29_900);
  assert.equal(pricing.calculateBundleDiscountMinor("percent", 20, 100), 0);
});

test("allocated item discounts reconcile exactly to the order discount", () => {
  const shares = pricing.allocateBundleDiscountMinor([10_000, 20_000, 7_500], 5_625);
  assert.equal(shares.reduce((sum, share) => sum + share, 0), 5_625);
  assert.ok(shares.every((share, index) => share >= 0 && share <= [10_000, 20_000, 7_500][index]));
});

test("public bundles expose only active exact multi-course quotes", async () => {
  const [route, bundles] = await Promise.all([
    read("app/api/public/bundles/route.ts"),
    read("lib/course-bundles.ts"),
  ]);
  assert.match(route, /listActiveCourseBundles/);
  assert.match(route, /s-maxage=60/);
  assert.match(bundles, /status[^\n]*published/);
  assert.match(bundles, /startsAt[^\n]*timestamptz/);
  assert.match(bundles, /expiresAt[^\n]*timestamptz/);
  assert.match(bundles, /uniqueSlugs\.length < 2/);
  assert.match(bundles, /requested\.length !== included\.length/);
  assert.match(bundles, /course\.availableForPurchase/);
});

test("admin bundle CRUD is protected, validated, and audited transactionally", async () => {
  const route = await read("app/api/admin/bundles/route.ts");
  assert.match(route, /roleAllowed\(user, \["admin"\]\)/);
  assert.match(route, /isAdminRequest\(request\)/);
  assert.match(route, /sameOriginRequest\(request\)/);
  assert.match(route, /courseSlugs\.length < 2 \|\| courseSlugs\.length > 30/);
  assert.match(route, /tx\.insert\(auditLogs\)/);
  assert.match(route, /entityType: "course_bundle"/);
  assert.match(route, /eq\(orders\.bundleSlug, bundle\.slug\)/);
  assert.match(route, /requireAdminStepUp/);
  assert.match(route, /ADMIN_PERMISSIONS\.RECORDS_DELETE/);
  assert.match(route, /غَيّر|غيّر/);
});

test("bundle management is available in both web and native administration", async () => {
  const [web, mobile, route] = await Promise.all([
    read("components/admin-bundles-center.tsx"),
    read("mobile/app/admin.tsx"),
    read("app/api/admin/bundles/route.ts"),
  ]);
  assert.match(web, /AdminBundlesCenter/);
  assert.match(web, /courseSlugs/);
  assert.match(web, /discountValue/);
  assert.match(mobile, /MobileBundleAdmin/);
  assert.match(mobile, /admin-bundles/);
  assert.match(route, /catalog: catalog\.map/);
});

test("checkout trusts only a server bundle quote and persists reconcilable minor fields", async () => {
  const checkout = await read("app/api/checkout/route.ts");
  assert.match(checkout, /getActiveCourseBundleQuote\(requestedBundleSlug, uniqueSlugs\)/);
  assert.match(checkout, /requestedCoupon && requestedBundleSlug/);
  assert.match(checkout, /bundleSlug: bundleQuote\?\.slug \|\| null/);
  assert.match(checkout, /subtotalMinor, discountMinor, taxAmountMinor: 0, totalMinor/);
  assert.match(checkout, /existing\.bundleSlug === \(requestedBundleSlug \|\| null\)/);
  assert.match(checkout, /bundle_slug: bundleQuote\?\.slug/);
  assert.match(checkout, /\.for\("share"\)/);
  assert.match(checkout, /kind: "bundle_changed"/);
});

test("bundle buying is visible in web/direct carts but remains gated from reader builds", async () => {
  const [webCart, mobileCart, course, mobileApi] = await Promise.all([
    read("components/cart-client.tsx"),
    read("mobile/app/cart.tsx"),
    read("mobile/app/course/[slug].tsx"),
    read("mobile/src/lib/api.ts"),
  ]);
  assert.match(webCart, /\/api\/public\/bundles/);
  assert.match(webCart, /bundleSlug: selectedBundleSlug/);
  assert.match(mobileCart, /enabled: STORE_COMMERCE_ENABLED/);
  assert.match(mobileCart, /bundleSlug: selectedBundleSlug/);
  assert.match(mobileApi, /pathname === "\/api\/checkout"/);
  assert.match(course, /\/api\/waitlist/);
  assert.match(course, /أعلمني عند فتح الاشتراك/);
  assert.match(await read("proxy.ts"), /"\/api\/waitlist"/);
});
