import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("..", import.meta.url);
const financeSource = await readFile(new URL("lib/finance.ts", root), "utf8");
const financeJavaScript = ts.transpileModule(financeSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const finance = await import(`data:text/javascript;base64,${Buffer.from(financeJavaScript).toString("base64")}`);

test("full refunds are capped at the captured order total", () => {
  assert.deepEqual(finance.resolveRefundAmount(
    { total: 149.99, status: "refunded" },
    [{ status: "REFUNDED", payload: JSON.stringify({ amount: 999 }) }],
  ), { amount: 149.99, complete: true, source: "full_refund" });
});

test("partial refunds are de-duplicated by provider refund id", () => {
  const first = JSON.stringify({ refunds: [{ id: "re_1", amount: 20, status: "SUCCEEDED" }] });
  const second = JSON.stringify({ refunds: [{ id: "re_1", amount: 20, status: "SUCCEEDED" }, { id: "re_2", amount: 12.5, status: "SUCCEEDED" }] });
  const result = finance.resolveRefundAmount(
    { total: 100, status: "partially_refunded" },
    [{ providerEventId: "one", status: "PARTIALLY_REFUNDED", payload: first }, { providerEventId: "two", status: "PARTIALLY_REFUNDED", payload: second }],
  );
  assert.deepEqual(result, { amount: 32.5, complete: true, source: "events" });
});

test("official Tap refund webhook objects are summed by refund id", () => {
  const result = finance.resolveRefundAmount(
    { total: 100, status: "partially_refunded" },
    [
      { providerEventId: "refund-one", status: "REFUND_REFUNDED", payload: JSON.stringify({ id: "re_one", object: "refund", amount: 15, status: "REFUNDED" }) },
      { providerEventId: "refund-one-repeat", status: "REFUND_REFUNDED", payload: JSON.stringify({ id: "re_one", object: "refund", amount: 15, status: "REFUNDED" }) },
      { providerEventId: "refund-two", status: "REFUND_REFUNDED", payload: JSON.stringify({ id: "re_two", object: "refund", amount: 22.5, status: "REFUNDED" }) },
    ],
  );
  assert.deepEqual(result, { amount: 37.5, complete: true, source: "events" });
});

test("repeated cumulative refund snapshots use the greatest confirmed amount", () => {
  const result = finance.resolveRefundAmount(
    { total: 200, status: "partially_refunded" },
    [
      { status: "PARTIALLY_REFUNDED", payload: JSON.stringify({ amount_refunded: 25 }) },
      { status: "PARTIALLY_REFUNDED", payload: JSON.stringify({ amount_refunded: 40 }) },
      { status: "PARTIALLY_REFUNDED", payload: JSON.stringify({ amount_refunded: 40 }) },
    ],
  );
  assert.equal(result.amount, 40);
  assert.equal(result.complete, true);
});

test("a partial-refund signal without an amount is flagged instead of guessed", () => {
  assert.deepEqual(finance.resolveRefundAmount(
    { total: 100, status: "partially_refunded" },
    [{ status: "PARTIALLY_REFUNDED", payload: "{}" }],
  ), { amount: 0, complete: false, source: "missing_partial_amount" });
});

test("financial metrics calculate in minor units and exclude unpaid orders", () => {
  const metrics = finance.financeMetrics([
    { orderNumber: "M-1", total: 100.01, subtotal: 110.01, discount: 10, status: "paid" },
    { orderNumber: "M-2", total: 50, subtotal: 50, discount: 0, status: "refunded" },
    { orderNumber: "M-3", total: 999, subtotal: 999, discount: 0, status: "failed" },
  ], new Map(), new Map([["M-1", 13.04], ["M-2", 6.52]]));
  assert.equal(metrics.gross, 150.01);
  assert.equal(metrics.refunds, 50);
  assert.equal(metrics.net, 100.01);
  assert.equal(metrics.capturedOrders, 2);
  assert.equal(metrics.tax, 19.56);
});

test("CSV cells neutralize spreadsheet formulas", () => {
  assert.equal(finance.csvCell("=HYPERLINK(\"bad\")"), '"\'=HYPERLINK(""bad"")"');
  assert.equal(finance.csvCell("normal"), '"normal"');
});

test("finance API and UI expose complete filters, details, review queues, and CSV", async () => {
  const [route, component, page, webhook] = await Promise.all([
    readFile(new URL("app/api/admin/finance/route.ts", root), "utf8"),
    readFile(new URL("components/finance-center.tsx", root), "utf8"),
    readFile(new URL("app/admin/finance/page.tsx", root), "utf8"),
    readFile(new URL("app/api/webhooks/tap/route.ts", root), "utf8"),
  ]);
  assert.match(route, /authorizePermission\(request, ADMIN_PERMISSIONS\.FINANCE_VIEW\)/);
  assert.match(route, /ADMIN_PERMISSIONS\.FINANCE_EXPORT/);
  assert.match(route, /requireAdminStepUp\(request, authorization\.user\)/);
  assert.match(route, /db\.select\(\)\.from\(orders\)\.orderBy/);
  assert.match(route, /db\.select\(\)\.from\(orderItems\)\.orderBy/);
  assert.match(route, /verificationPending/);
  assert.match(route, /paymentReview/);
  assert.match(route, /format"\) === "csv"/);
  assert.match(route, /items: resolvedItems\.map/);
  assert.match(route, /paymentEvents:/);
  assert.match(route, /invoice,/);
  assert.match(route, /access:/);
  for (const filter of ["from", "to", "institution", "course", "paymentMethod", "status", "search"]) assert.match(component, new RegExp(filter));
  assert.match(component, /تصدير CSV/);
  assert.match(page, /requireRole\("\/admin\/finance", \["admin"\]\)/);
  assert.match(webhook, /isRefundPayload\(posted\)/);
  assert.match(webhook, /\/v2\/refunds\/\$\{encodeURIComponent\(refundId\)\}/);
  assert.match(webhook, /applyConfirmedRefundToOrder/);
  assert.match(webhook, /if \(status !== "REFUNDED"\)/);
  assert.match(webhook, /event: "payment_paid"/);
  assert.match(webhook, /tx\.delete\(cartItems\)/);
});
