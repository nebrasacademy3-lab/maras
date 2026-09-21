import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { isolated } from "./helpers/business-fixtures.mjs";
const policy = await isolated("../lib/instructor-policy.ts");
const security = await isolated("../lib/instructor-security.ts", { createCipheriv, createDecipheriv, createHmac, randomBytes, getSessionUser: async request => JSON.parse(request.headers.get("test-user") || "null"), requireAdminStepUp: async () => { throw new Error("Step-up required"); } });
const request = user => new Request("https://maras-qa.example/api/instructor/profile", { headers: { "test-user": JSON.stringify(user) } });

test("instructor endpoints reject students, supervisors, guests and unverified addresses", async () => {
  for (const user of [null, { role: "student", emailVerified: true }, { role: "supervisor", emailVerified: true }, { role: "admin", isPlatformOwner: true, emailVerified: true }, { role: "instructor", emailVerified: false }]) await assert.rejects(security.instructorActor(request(user)));
  assert.equal((await security.instructorActor(request({ role: "instructor", emailVerified: true, id: 7 }))).id, 7);
});
test("only the single platform owner can administer instructors and writes require step-up", async () => {
  for (const user of [null, { role: "instructor", isPlatformOwner: false }, { role: "supervisor", isPlatformOwner: true }, { role: "admin", isPlatformOwner: false }]) await assert.rejects(security.instructorOwner(request(user)));
  const owner = request({ role: "admin", isPlatformOwner: true, id: 1 });
  assert.equal((await security.instructorOwner(owner)).id, 1);
  await assert.rejects(security.instructorOwner(owner, true), /Step-up required/);
});
test("sensitive data is authenticated, owner-bound and fails closed without encryption configuration", () => {
  const previous = process.env.INSTRUCTOR_DATA_ENCRYPTION_KEY;
  try {
    delete process.env.INSTRUCTOR_DATA_ENCRYPTION_KEY;
    assert.throws(() => security.encryptInstructorData("private", "bank:7"), /غير مهيأة/);
    process.env.INSTRUCTOR_DATA_ENCRYPTION_KEY = "ab".repeat(32);
    const encrypted = security.encryptInstructorData("private", "bank:7");
    assert.notEqual(encrypted, security.encryptInstructorData("private", "bank:7"));
    assert.equal(security.decryptInstructorData(encrypted, "bank:7"), "private");
    assert.throws(() => security.decryptInstructorData(encrypted, "bank:8"));
    assert.throws(() => security.decryptInstructorData(encrypted, "address:7"));
    const fields = encrypted.split("."); fields[2] = fields[2][0] === "A" ? "B" + fields[2].slice(1) : "A" + fields[2].slice(1);
    assert.throws(() => security.decryptInstructorData(fields.join("."), "bank:7"));
  } finally { if (previous === undefined) delete process.env.INSTRUCTOR_DATA_ENCRYPTION_KEY; else process.env.INSTRUCTOR_DATA_ENCRYPTION_KEY = previous; }
});
test("signature accepts bounded numeric strokes, rejects blanks, injected SVG and oversized input", () => {
  const stroke = Array.from({ length: 20 }, (_, i) => ({ x: i / 25, y: Math.sin(i) / 4 + 0.5 }));
  assert.equal(policy.validateInstructorSignature([stroke]), true);
  for (const value of [[], "<svg onload='x'>", [[{ x: 0, y: 0 }, { x: 1, y: 1 }]], [stroke.map(() => ({ x: 0.5, y: 0.5 }))], [stroke.map(p => ({ ...p, x: Infinity }))], Array.from({ length: 41 }, () => stroke)]) assert.equal(policy.validateInstructorSignature(value), false);
});
test("payment rate and bank validation reject rounding, invalid checksums and non-canonical phones", () => {
  assert.equal(policy.validInstructorRate(5000), true);
  for (const value of [0, -1, 1.5, Infinity, "5000", 100000001]) assert.equal(policy.validInstructorRate(value), false);
  assert.equal(policy.validInstructorIban("SA03 8000 0000 6080 1016 7519"), true);
  assert.equal(policy.validInstructorIban("SA0480000000608010167519"), false);
  assert.equal(policy.validInstructorPhone("+966501234567"), true);
  assert.equal(policy.validInstructorPhone("0501234567"), false);
});
