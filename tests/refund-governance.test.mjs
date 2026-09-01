import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("..", import.meta.url);
const [refundsSource, adminRoute, webhookRoute] = await Promise.all([
  readFile(new URL("lib/refunds.ts", root), "utf8"),
  readFile(new URL("app/api/admin/refunds/route.ts", root), "utf8"),
  readFile(new URL("app/api/webhooks/tap/route.ts", root), "utf8"),
]);

const pureRefundSource = refundsSource.slice(
  refundsSource.indexOf("const TAP_REFUND_FAILURE_STATUSES"),
  refundsSource.indexOf("export async function reconcileRefundRequest"),
);
const pureRefundJavaScript = ts.transpileModule(pureRefundSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const refundPolicy = await import(`data:text/javascript;base64,${Buffer.from(pureRefundJavaScript).toString("base64")}`);

test("refund amounts accept exact positive halalas and reject ambiguous values", () => {
  assert.equal(refundPolicy.requestedRefundMinor({ amountMinor: 125 }), 125);
  assert.equal(refundPolicy.requestedRefundMinor({ amount: "12.50" }), 1250);
  assert.equal(refundPolicy.requestedRefundMinor({ amount: "0.01" }), 1);
  assert.equal(refundPolicy.requestedRefundMinor({ amountMinor: -1, amount: 50 }), null);
  assert.equal(refundPolicy.requestedRefundMinor({ amountMinor: 1.5 }), null);
  assert.equal(refundPolicy.requestedRefundMinor({ amount: "1.001" }), null);
  assert.equal(refundPolicy.requestedRefundMinor({ amount: "not-a-number" }), null);
  assert.equal(refundPolicy.requestedRefundMinor({ amountMinor: true }), null);
  assert.equal(refundPolicy.requestedRefundMinor({ amount: true }), null);
});

test("Tap refund statuses distinguish terminal failure from ambiguous pending", () => {
  assert.equal(refundPolicy.tapRefundRequestStatus("REFUNDED"), "completed");
  for (const status of ["DECLINED", "FAILED", "RESTRICTED", "REJECTED", "CANCELLED", "ABANDONED", "TIMED_OUT", "TIMEDOUT"]) {
    assert.equal(refundPolicy.tapRefundRequestStatus(status), "provider_failed");
  }
  for (const status of ["PENDING", "ACCEPTED", "IN_PROGRESS", "UNKNOWN", "unexpected"]) {
    assert.equal(refundPolicy.tapRefundRequestStatus(status), "provider_pending");
  }
});

test("confirmed Tap refunds are counted in integer halalas once per refund id", () => {
  const events = [
    { status: "REFUND_REFUNDED", payload: JSON.stringify({ id: "re_one", amount: 10.01, status: "REFUNDED" }) },
    { status: "REFUND_REFUNDED", payload: JSON.stringify({ id: "re_one", amount: 10.01, status: "REFUNDED" }) },
    { status: "REFUND_REFUNDED", payload: JSON.stringify({ id: "re_two", amount: 2.5, status: "REFUNDED" }) },
    { status: "REFUND_FAILED", payload: JSON.stringify({ id: "re_bad", amount: 99, status: "FAILED" }) },
  ];
  assert.deepEqual([...refundPolicy.confirmedRefundMinorById(events)], [["re_one", 1001], ["re_two", 250]]);
});

test("admin refunds enforce financial permission, step-up, maker-checker, reservation, and send claim", () => {
  assert.match(adminRoute, /ADMIN_PERMISSIONS\.FINANCE_VIEW/);
  assert.match(adminRoute, /ADMIN_PERMISSIONS\.FINANCE_MANAGE/);
  assert.match(adminRoute, /requireAdminStepUp\(request, user\)/);
  assert.match(adminRoute, /requestedByEmail\.toLowerCase\(\) === user\.email\.toLowerCase\(\)/);
  assert.match(adminRoute, /count\(distinct lower\(/);
  assert.match(adminRoute, /note\.length < 4/);
  assert.match(adminRoute, /lower\(\$\{adminApprovals\.approverEmail\}\) <> lower\(\$\{current\.requestedByEmail\}\)/);
  assert.match(adminRoute, /pg_advisory_xact_lock\(hashtext\(\$\{orderNumber\}\)\)/);
  assert.match(adminRoute, /occupiedRefundMinor\(order, events, requests\)/);
  assert.match(adminRoute, /request\.requestedByEmail\.toLowerCase\(\) === user\.email\.toLowerCase\(\)/);
  assert.match(adminRoute, /replayed: true/);
  assert.match(adminRoute, /order\.currency\.toUpperCase\(\) !== "SAR"/);
  assert.match(adminRoute, /const next = approvals >= 2 \? "provider_processing"/);
  assert.match(adminRoute, /status: "provider_pending", reviewNote: "نتيجة الاتصال بـ Tap غير مؤكدة/);
  assert.match(adminRoute, /reference: \{ merchant: approvedRefund\.requestNumber, idempotent: approvedRefund\.requestNumber \}/);
  assert.match(adminRoute, /providerRefundId: providerMatchesRequest \? providerId : null/);
  assert.match(adminRoute, /status: "REFUND_REFUNDED"/);
  assert.match(adminRoute, /applyConfirmedRefundToOrder\(\{ orderNumber: approvedRefund\.orderNumber, chargeId: tapChargeId \}\)/);
});

test("Tap refund webhook binds early callbacks and reconciles exact minor-unit totals", () => {
  assert.match(webhookRoute, /\/v2\/refunds\/\$\{encodeURIComponent\(refundId\)\}/);
  assert.match(webhookRoute, /verified\.metadata\?\.refund_request \|\| verified\.reference\?\.merchant \|\| verified\.reference\?\.idempotent/);
  assert.match(webhookRoute, /managedRequest\.amountMinor !== amountMinor/);
  assert.match(webhookRoute, /applyConfirmedRefundToOrder\(\{ orderNumber: order\.orderNumber, chargeId \}\)/);
  assert.doesNotMatch(webhookRoute, /Boolean\(cleanText\(value\.charge_id/);
});

test("credit notes are serialized and allocate the invoice tax without exceeding it", () => {
  assert.match(refundsSource, /confirmedRefundMinorById\(refundEvents\)/);
  assert.match(refundsSource, /refundedAmountMinor > currentTotalMinor/);
  assert.match(refundsSource, /refundedAmountMinor >= currentTotalMinor/);
  assert.match(refundsSource, /credit-note:\$\{input\.orderNumber\}/);
  assert.match(refundsSource, /invoice\.taxAmountMinor \?\? majorAmountToMinor\(invoice\.taxAmount\)/);
  assert.match(refundsSource, /remainingTaxMinor/);
  assert.match(refundsSource, /input\.amountMinor === remainingAmountMinor/);
  assert.doesNotMatch(refundsSource, /15\s*\/\s*115/);
});
