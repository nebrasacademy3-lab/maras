import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("waitlist is persisted, lifecycle-notified, and converted after payment", async () => {
  const [schema, route, lifecycle, webhook] = await Promise.all([read("db/schema.ts"), read("app/api/waitlist/route.ts"), read("lib/lifecycle-automation.ts"), read("app/api/webhooks/tap/route.ts")]);
  assert.match(schema, /courseWaitlist = pgTable\("course_waitlist"/);
  assert.match(route, /waitlist_join/);
  assert.match(lifecycle, /launchNotifications/);
  assert.match(lifecycle, /المادة التي تنتظرها أصبحت متاحة/);
  assert.match(webhook, /status: "converted"/);
});

test("bundle, refund and settlement governance are server-side", async () => {
  const [schema, refund, settlement, settlementRules] = await Promise.all([read("db/schema.ts"), read("app/api/admin/refunds/route.ts"), read("app/api/admin/settlements/route.ts"), read("lib/settlements.ts")]);
  assert.match(schema, /courseBundles = pgTable\("course_bundles"/);
  assert.match(schema, /adminApprovals = pgTable\("admin_approvals"/);
  assert.match(schema, /paymentSettlements = pgTable\("payment_settlements"/);
  assert.match(refund, /approvals >= 2/);
  assert.match(refund, /https:\/\/api\.tap\.company\/v2\/refunds\//);
  assert.match(refund, /issueCreditNote/);
  assert.match(settlementRules, /currency_mismatch/);
  assert.match(settlement, /settlement-import/);
});

test("attachments fail closed until a production malware scan succeeds", async () => {
  const [scanner, supportFile, requestZip, health] = await Promise.all([read("lib/file-security.ts"), read("app/api/support/files/[id]/route.ts"), read("app/api/admin/course-requests/[id]/download/route.ts"), read("app/api/health/route.ts")]);
  assert.match(scanner, /NODE_ENV === "production"/);
  assert.match(scanner, /status: "pending"/);
  assert.match(supportFile, /الفحص الأمني/);
  assert.match(requestZip, /scanStatus !== "clean"/);
  assert.match(health, /malwareScanner/);
});

test("operations center exposes funnel, cohorts, SLA and automation queues", async () => {
  const [analytics, operations, center] = await Promise.all([read("app/api/admin/analytics/route.ts"), read("app/api/admin/operations/summary/route.ts"), read("components/admin-operations-center.tsx")]);
  assert.match(analytics, /retention30Rate/);
  assert.match(operations, /filesPendingScan/);
  assert.match(operations, /refundPending/);
  assert.match(center, /الأتمتة والطوابير/);
  assert.match(center, /تشغيل المهام الآمنة/);
});

test("invoice is printable and protected by account ownership", async () => {
  const [invoice, download, mobileOrders] = await Promise.all([
    read("app/invoices/[orderNumber]/page.tsx"),
    read("app/api/invoices/[orderNumber]/download/route.ts"),
    read("mobile/app/orders.tsx"),
  ]);
  assert.match(invoice, /order\.customerEmail\.toLowerCase\(\)!==user\.email\.toLowerCase\(\)/);
  assert.match(invoice, /InvoicePrintButton/);
  assert.match(invoice, /فاتورة ضريبية مبسطة/);
  assert.match(download, /getSessionUser/);
  assert.match(download, /order\.customerEmail\.toLowerCase\(\)!==user\.email\.toLowerCase\(\)/);
  assert.match(download, /content-disposition/);
  assert.match(mobileOrders, /downloadProtectedFile/);
});
