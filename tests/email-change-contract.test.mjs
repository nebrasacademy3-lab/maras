import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const [schema, migration, route, service, web, mobile] = await Promise.all([
  read("db/schema.ts"),
  read("drizzle/0035_email_change_identity.sql"),
  read("app/api/profile/email/route.ts"),
  read("lib/email-change.ts"),
  read("components/email-change-form.tsx"),
  read("mobile/src/components/EmailChangePanel.tsx"),
]);

test("email change proves both addresses while preserving immutable account ownership", () => {
  assert.match(schema, /emailChangeRequests = pgTable\("email_change_requests"/);
  assert.match(migration, /email_change_requests_user_fk/);
  for (const field of ["currentCodeHash", "newCodeHash", "currentVerifiedAt", "newVerifiedAt"]) assert.ok(service.includes(field));
  assert.doesNotMatch(service, /migrateEmailReferences|UPDATE\s+"(?:support_tickets|orders|course_access|favorites|cart_items|lesson_notes|lesson_progress)"/i);
  assert.match(service, /update\(users\)\.set\(\{ email: challenge\.newEmail, emailVerifiedAt: now, updatedAt: now \}\)\.where\(eq\(users\.id, userId\)\)/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /requireCurrentSession\(tx, userId, tokenHash\)/);
  assert.match(service, /authSessions/);
  assert.match(service, /email-change-request/);
  assert.match(service, /EMAIL_CHANGE_ENABLED === "true"/);
});

test("web and native surfaces expose request, verification and cancellation without exposing codes", () => {
  assert.match(route, /action === "request"/);
  assert.match(route, /action === "verify"/);
  assert.match(route, /action === "cancel"/);
  assert.match(web, /VerificationCodeInput/);
  assert.match(web, /currentPassword/);
  assert.match(web, /window\.location\.assign/);
  assert.match(mobile, /EmailChangePanel/);
  assert.match(mobile, /jsonBody/);
  assert.doesNotMatch(route, /currentCode|newCode/);
});
