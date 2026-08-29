import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  hasConfirmedExistingStaffUpdate,
  resolveStaffIdentityMatches,
  STAFF_UPDATE_CONFIRMATION,
  staffAccountSummary,
} from "../lib/staff-account-contract.ts";

const route = await readFile(new URL("../app/api/admin/staff/route.ts", import.meta.url), "utf8");
const account = (overrides = {}) => ({
  id: 1,
  email: "staff@example.com",
  phone: "+966500000001",
  fullName: "موظف تجريبي",
  role: "supervisor",
  status: "active",
  universitySlug: "ksu",
  specialty: "علوم الحاسب",
  passwordHash: "must-not-leak",
  ...overrides,
});

test("an existing staff update requires both the strict flag and exact Arabic confirmation", () => {
  assert.equal(hasConfirmedExistingStaffUpdate({}), false);
  assert.equal(hasConfirmedExistingStaffUpdate({ allowExisting: true }), false);
  assert.equal(hasConfirmedExistingStaffUpdate({ allowExisting: "true", confirmation: STAFF_UPDATE_CONFIRMATION }), false);
  assert.equal(hasConfirmedExistingStaffUpdate({ allowExisting: true, confirmation: "تحديث" }), false);
  assert.equal(hasConfirmedExistingStaffUpdate({ allowExisting: true, confirmation: `  ${STAFF_UPDATE_CONFIRMATION}  ` }), true);
});

test("email and phone matches resolve one account or expose a two-account collision", () => {
  const first = account();
  const same = resolveStaffIdentityMatches([first], "STAFF@example.com", first.phone);
  assert.equal(same.existing?.id, first.id);
  assert.equal(same.identitiesConflict, false);

  const second = account({ id: 2, email: "other@example.com", phone: "+966500000002" });
  const collision = resolveStaffIdentityMatches([first, second], first.email, second.phone);
  assert.equal(collision.existing, null);
  assert.equal(collision.emailAccount?.id, first.id);
  assert.equal(collision.phoneAccount?.id, second.id);
  assert.equal(collision.identitiesConflict, true);
});

test("the public existing-account summary never includes password material", () => {
  const summary = staffAccountSummary(account());
  assert.equal("passwordHash" in summary, false);
  assert.deepEqual(Object.keys(summary).sort(), [
    "email", "fullName", "id", "phone", "role", "specialty", "status", "universitySlug",
  ]);
});

test("the staff route rejects implicit updates and preserves administrator guards", () => {
  assert.match(route, /\.limit\(2\)/);
  assert.match(route, /code:\s*"STAFF_ACCOUNT_EXISTS"/);
  assert.match(route, /payload\.allowExisting !== true/);
  assert.match(route, /hasConfirmedExistingStaffUpdate\(payload\)/);
  assert.match(route, /code:\s*"STAFF_IDENTITY_CONFLICT"/);
  assert.match(route, /existing\.id === session\.id && role !== "admin"/);
  assert.match(route, /eq\(users\.role, "admin"\), eq\(users\.status, "active"\)/);
  assert.match(route, /STAFF_UPDATE_CONFIRMATION/);
});
