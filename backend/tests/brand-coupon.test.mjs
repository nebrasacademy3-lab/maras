import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("coupon service validates active windows and preserves course scope", async () => {
  const [coupons, checkout, admin] = await Promise.all([
    read("lib/coupons.ts"),
    read("app/api/checkout/route.ts"),
    read("app/api/admin/console/route.ts"),
  ]);
  assert.match(coupons, /coupon\.status !== "active"/);
  assert.match(coupons, /coupon\.startsAt/);
  assert.match(coupons, /coupon\.expiresAt/);
  assert.match(coupons, /courseSlug: coupon\.courseSlug/);
  assert.match(checkout, /const discountIndex = couponQuote\?\.courseSlug/);
  assert.match(checkout, /const itemDiscount = index === discountIndex \? discount : 0/);
  assert.match(admin, /\["active", "disabled"\]/);
  assert.match(admin, /المادة المحددة للكوبون غير موجودة/);
});

test("web and Expo footers consume the same live public settings", async () => {
  const [footer, mobileFooter, screen, settingsRoute, brand, favicon, manifest] = await Promise.all([
    read("components/site-footer.tsx"),
    read(new URL("../mobile/src/components/MobileFooter.tsx", root)),
    read(new URL("../mobile/src/components/ui.tsx", root)),
    read("app/api/public/settings/route.ts"),
    read("components/brand-logo.tsx"),
    read("public/favicon.svg"),
    read("public/manifest.webmanifest"),
  ]);
  assert.match(footer, /<BrandLogo markOnly \/>/);
  assert.match(footer, /settings\.social_/);
  assert.match(mobileFooter, /\/api\/public\/settings/);
  assert.match(mobileFooter, /settings\.whatsapp_url/);
  assert.match(screen, /<MobileFooter \/>/);
  assert.match(settingsRoute, /cache-control.*no-store/);
  assert.match(brand, /brand-logo-mark-only/);
  assert.match(favicon, /fill="#FFFFFF"/);
  assert.match(favicon, /<path/);
  assert.match(manifest, /\/brand\/app-icon-light\.png/);
});
