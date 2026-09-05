import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("public partners API exposes only the already-filtered bounded projection", async () => {
  const [store, route, logoRoute] = await Promise.all([
    read("lib/platform-partners.ts"),
    read("app/api/public/partners/route.ts"),
    read("app/api/public/partners/[id]/logo/route.ts"),
  ]);
  assert.match(store, /eq\(platformPartners\.status, "published"\)/);
  assert.match(store, /eq\(platformPartners\.rightsConfirmed, true\)/);
  assert.match(store, /kind === "accreditation".+credentialNumber.+rightsReference.+verificationUrl/s);
  assert.match(store, /isHttps\(row\.logoUrl\) \? row\.logoUrl/);
  assert.match(route, /slice\(0, MAX_PUBLIC_PARTNERS\)/);
  assert.match(route, /"x-content-type-options": "nosniff"/);
  assert.match(logoRoute, /partner\.kind === "accreditation".+credentialNumber.+rightsReference.+verificationUrl/s);
});

test("mobile home hides an empty partner rail and bounds cached logo rendering", async () => {
  const [partners, home] = await Promise.all([
    read("mobile/src/components/HomePartners.tsx"),
    read("mobile/app/(tabs)/index.tsx"),
  ]);
  assert.match(partners, /api<PublicPartnersResponse>\("\/api\/public\/partners"\)/);
  assert.match(partners, /slice\(0, 12\)/);
  assert.match(partners, /if \(!partners\.length\) return null/);
  assert.match(partners, /cachePolicy="memory-disk"/);
  assert.match(partners, /partner\.kind === "accreditation"\) return partner\.verificationUrl/);
  assert.match(home, /<HomePartners \/>/);
});

test("mobile administration controls payment marketing and incomplete social data stays hidden", async () => {
  const [admin, contact] = await Promise.all([
    read("mobile/app/admin.tsx"),
    read("mobile/app/contact.tsx"),
  ]);
  assert.match(admin, /payment_methods_marketing_enabled/);
  assert.match(admin, /values: \{ payment_methods_marketing_enabled: value \}/);
  assert.match(contact, /\{socials\.length \? <>/);
  assert.doesNotMatch(contact, /ستُضاف الحسابات الاجتماعية/);
});
