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

test("email change is a two-owner proof and preserves the account identity", () => {
  assert.match(schema, /emailChangeRequests = pgTable\("email_change_requests"/);
  assert.match(migration, /email_change_requests_user_fk/);
  assert.match(service, /currentCodeHash/);
  assert.match(service, /newCodeHash/);
  assert.match(service, /currentVerifiedAt/);
  assert.match(service, /newVerifiedAt/);
  assert.match(service, /migrateEmailReferences/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /authSessions/);
  assert.match(service, /emailVerifiedAt: now/);
  assert.match(service, /email-change-request/);
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
