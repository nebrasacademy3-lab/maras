import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("..", import.meta.url);
const source = await readFile(new URL("lib/settlements.ts", root), "utf8");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const settlements = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

test("settlement amounts are parsed exactly in currency minor units", () => {
  assert.equal(settlements.parseSettlementMinor("12.34", "SAR"), 1234);
  assert.equal(settlements.parseSettlementMinor("12.345", "SAR"), null);
  assert.equal(settlements.parseSettlementMinor("12.345", "KWD"), 12345);
  assert.equal(settlements.parseSettlementMinor("", "SAR", { allowBlank: true }), 0);
  assert.equal(settlements.parseSettlementMinor("-1.00", "SAR"), null);
  assert.equal(settlements.parseSettlementMinor("-1.00", "SAR", { allowNegative: true }), -100);
});

test("settlement matching fails closed on identifier, capture, gross, and arithmetic mismatches", () => {
  const order = { id: 1, orderNumber: "M-1", tapChargeId: "chg_1", currency: "SAR", status: "partially_refunded", total: 100, totalMinor: 10000 };
  const amounts = { grossMinor: 10000, refundMinor: 1000, feeMinor: 200, taxMinor: 30, netMinor: 8770 };
  assert.equal(settlements.resolveSettlementMatch({ currency: "SAR", orderNumber: "M-1", chargeId: "chg_1", amounts, confirmedRefundMinor: 1000, orderByNumber: order, orderByCharge: order }).status, "matched");
  assert.equal(settlements.resolveSettlementMatch({ currency: "SAR", orderNumber: "M-1", chargeId: "chg_1", amounts, confirmedRefundMinor: 900, orderByNumber: order, orderByCharge: order }).status, "refund_mismatch");
  assert.equal(settlements.resolveSettlementMatch({ currency: "SAR", orderNumber: "M-1", chargeId: "chg_2", amounts, orderByNumber: order, orderByCharge: { ...order, id: 2, orderNumber: "M-2", tapChargeId: "chg_2" } }).status, "identifier_conflict");
  assert.equal(settlements.resolveSettlementMatch({ currency: "AED", orderNumber: "M-1", chargeId: "chg_1", amounts, orderByNumber: order }).status, "currency_mismatch");
  assert.equal(settlements.resolveSettlementMatch({ currency: "SAR", orderNumber: "M-1", chargeId: "chg_1", amounts, orderByNumber: { ...order, status: "pending" } }).status, "order_not_captured");
  assert.equal(settlements.resolveSettlementMatch({ currency: "SAR", orderNumber: "M-1", chargeId: "chg_1", amounts: { ...amounts, grossMinor: 9900 }, orderByNumber: order }).status, "gross_mismatch");
  assert.equal(settlements.resolveSettlementMatch({ currency: "SAR", orderNumber: "M-1", chargeId: "chg_1", amounts: { ...amounts, netMinor: 9000 }, orderByNumber: order }).status, "arithmetic_mismatch");
});

test("settlement API requires finance permissions and step-up before importing", async () => {
  const route = await readFile(new URL("app/api/admin/settlements/route.ts", root), "utf8");
  assert.match(route, /ADMIN_PERMISSIONS\.FINANCE_VIEW/);
  assert.match(route, /ADMIN_PERMISSIONS\.FINANCE_MANAGE/);
  assert.match(route, /requireAdminStepUp\(request, user\)/);
  assert.match(route, /sameOriginRequest\(request\)/);
  assert.match(route, /refundMinor/);
  assert.match(route, /resolveSettlementMatch/);
  assert.match(source, /identifier_conflict/);
  assert.match(route, /issueCounts/);
  assert.match(route, /pg_advisory_xact_lock\(hashtext\('payment-settlement-import'\)\)/);
  assert.match(route, /paymentSettlementLines\.providerTransactionId/);
  assert.doesNotMatch(route, /select\(\)\.from\(orders\)\.limit\(100_000\)/);
});

test("finance governance explains mismatches and exposes refund-aware statements", async () => {
  const component = await readFile(new URL("components/finance-governance.tsx", root), "utf8");
  assert.match(component, /الموافقون/);
  assert.match(component, /منشئ الطلب/);
  assert.match(component, /refund \(اختياري\)/);
  assert.match(component, /settlementIssueLabel/);
  assert.match(component, /provider_processing/);
});
