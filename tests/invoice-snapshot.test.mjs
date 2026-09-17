import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { pureSource } from "./helpers/pure-source.mjs";
const { invoiceCustomerSnapshot } = await pureSource("lib/invoice-snapshot.ts");
const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");
test("invoice customer snapshot survives mutable contact correction, including an empty original phone", () => {
  const invoice = { customerEmail: "old@example.test", snapshotJson: JSON.stringify({ customer: { name: "Original", email: "old@example.test", phone: "" } }) };
  assert.deepEqual(invoiceCustomerSnapshot(invoice, { customerName: "Changed", customerPhone: "999" }), { name: "Original", email: "old@example.test", phone: "" });
});
test("legacy invoice fallback never obtains historical email from the mutable order", () => {
  for (const snapshotJson of [null, "bad json", "[]", '{"customer":null}', '{"customer":[]}']) {
    assert.deepEqual(invoiceCustomerSnapshot({ customerEmail: "old@example.test", snapshotJson }, { customerName: "Legacy", customerPhone: null }), { name: "Legacy", email: "old@example.test", phone: "" });
  }
});
test("invoice web and download authorize by order but display the invoice snapshot; native listing follows its order", async () => {
  for (const path of ["app/invoices/[orderNumber]/page.tsx", "app/api/invoices/[orderNumber]/download/route.ts"]) {
    const source = await read(path);
    assert.match(source, /invoiceCustomerSnapshot\(invoice, order\)/);
    assert.match(source, /order\.customerEmail\.toLowerCase\(\)!==user\.email\.toLowerCase\(\)/);
    assert.doesNotMatch(source, /escapeHtml\(order\.customer(?:Name|Email|Phone)\)|\{order\.customer(?:Name|Email|Phone)\}/);
  }
  const mobile = await read("app/api/mobile/dashboard/route.ts");
  assert.match(mobile, /innerJoin\(orders, eq\(orders\.orderNumber, invoices\.orderNumber\)\)/);
  assert.doesNotMatch(mobile, /eq\(invoices\.customerEmail, user\.email\)/);
});
test("contact migration leaves invoice and historical actor snapshots untouched", async () => {
  const service = await read("lib/email-change.ts");
  assert.doesNotMatch(service, /UPDATE "invoices"/);
  assert.doesNotMatch(service, /SET "(actor_email|author_email|approver_email|requested_by_email)"/);
});
