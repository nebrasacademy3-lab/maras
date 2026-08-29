import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const helper = await readFile(join(here, "../lib/admin-deletion.ts"), "utf8");
const route = await readFile(join(here, "../app/api/admin/console/route.ts"), "utf8");

test("admin deletion uses a fixed entity whitelist", () => {
  const match = helper.match(/ADMIN_DELETION_TYPES = \[([\s\S]*?)\] as const/);
  assert.ok(match, "fixed deletion whitelist is present");
  const entries = [...match[1].matchAll(/"([a-z_]+)"/g)].map((entry) => entry[1]);
  assert.deepEqual(entries, [
    "institution", "specialty", "course", "unit", "lesson", "video", "user", "course_request",
    "support_ticket", "coupon", "notification", "review", "supervisor_assignment",
  ]);
  assert.match(route, /action === "deleteEntity"/);
  assert.doesNotMatch(route, /payload\.table|payload\.tableName|payload\.entityTable/);
});

test("destructive deletion requires the exact Arabic confirmation", () => {
  assert.match(helper, /input\.confirmation !== "حذف"/);
  assert.match(route, /confirmation\.trim\(\)/);
  assert.match(route, /entityType, entityId, actor/);
});

test("financial and audit records are protected from deletion", () => {
  assert.match(helper, /orders/);
  assert.match(helper, /invoices/);
  assert.match(helper, /paymentEvents/);
  assert.match(helper, /لا يمكن حذف المادة لأنها مرتبطة بطلب مدفوع/);
  assert.match(helper, /لا يمكن حذف الحساب لأنه مرتبط بسجل طلبات/);
  assert.doesNotMatch(helper, /tx\.delete\(auditLogs/);
  assert.doesNotMatch(helper, /tx\.delete\(orders/);
  assert.doesNotMatch(helper, /tx\.delete\(invoices/);
  assert.doesNotMatch(helper, /tx\.delete\(paymentEvents/);
});

test("paid course content cannot be deleted through a child entity", () => {
  assert.match(helper, /orderItems\.orderNumber/);
  assert.match(helper, /row\.status === "paid"/);
  assert.match(helper, /input\.entityType === "course"\) await ensureCourseDeletable/);
  for (const entity of ["unit", "lesson", "video"]) {
    const start = helper.indexOf(`if (input.entityType === "${entity}")`);
    assert.ok(start >= 0, `${entity} deletion guard is missing`);
    const block = helper.slice(start, helper.indexOf("\n  if (input.entityType === ", start + 10));
    assert.match(block, /ensureCourseDeletable/, `${entity} deletion bypasses paid/access protection`);
  }
});

test("account safety and storage cleanup contracts are present", () => {
  assert.match(helper, /لا يمكنك حذف حسابك الإداري الحالي/);
  assert.match(helper, /لا يمكن حذف آخر مدير نشط/);
  assert.match(helper, /deleteObject\(item\.key\)/);
  assert.match(helper, /cleanup_warning/);
  assert.match(helper, /supportReplyFiles/);
  assert.match(helper, /courseRequestFiles/);
  assert.match(helper, /children-first|children-first/i);
});

test("the current or last active administrator cannot be deleted", () => {
  assert.match(helper, /target\.email === input\.actor/);
  assert.match(helper, /eq\(users\.role, "admin"\)/);
  assert.match(helper, /eq\(users\.status, "active"\)/);
  assert.match(helper, /activeAdmins\.length <= 1/);
  assert.match(helper, /لا يمكن حذف آخر مدير نشط/);
});
