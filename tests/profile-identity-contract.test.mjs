import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePath = new URL("../app/api/profile/route.ts", import.meta.url);
const source = await readFile(routePath, "utf8");

test("student profile route locks phone changes after registration", () => {
  assert.match(
    source,
    /current\.role === "student" && current\.profileCompleted && phone !== current\.phone/,
    "student phone edits must be rejected after profile completion",
  );
  assert.match(
    source,
    /لا يمكن تغيير رقم الجوال بعد إكمال التسجيل/,
    "the API must return an explicit recovery message",
  );
  assert.match(
    source,
    /phoneVerifiedAt: null/,
    "a changed phone must never remain verified",
  );
});

test("phone uniqueness remains enforced before profile writes", () => {
  assert.match(source, /duplicatePhone/);
  assert.match(source, /رقم الجوال مستخدم في حساب آخر/);
});
