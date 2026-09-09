import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isolated, sql, eq, and, gt, isNull, tables, database } from "./helpers/business-fixtures.mjs";
const primitives = await isolated("../lib/api.ts");
const bodies = await isolated("../lib/request-body.ts");
const devices = await isolated("../lib/auth-devices.ts", { ...tables, eq, and, isNull, sql });
const nativeRequest = (id, extra = {}) => new Request("https://test/api/mobile/auth/login", { headers: { "x-meras-client": "mobile-v1", "x-meras-platform": "ios", "x-meras-device-id": id, ...extra } });
const identityA = "installation-aaaaaaaaaaaaaaaaaaaa";
const identityB = "installation-bbbbbbbbbbbbbbbbbbbb";
const identityC = "installation-cccccccccccccccccccc";
async function authFor(db) { return isolated("../lib/auth.ts", { ...tables, eq, and, gt, isNull, sql, getDb: () => db, enrollStudentDeviceTx: devices.enrollStudentDeviceTx }); }
function studentDb() { return database({ users: [{ id: 7, role: "student", status: "active", email: "student@example.test" }] }); }

test("logout, expired sessions and password-reset-style revocation never free either student device", async () => {
  const db = studentDb(); const auth = await authFor(db);
  const first = await auth.createSession(7, nativeRequest(identityA));
  await auth.createSession(7, nativeRequest(identityB));
  await auth.revokeSession(nativeRequest(identityA, { authorization: `Bearer ${first.token}` }));
  for (const session of db.rows.authSessions) { session.expiresAt = "2000-01-01"; session.revokedAt = new Date().toISOString(); }
  await assert.rejects(auth.createSession(7, nativeRequest(identityC)), devices.DeviceLimitError);
  const reentry = await auth.createSession(7, nativeRequest(identityA));
  assert.equal(reentry.deviceId, identityA);
  assert.equal(db.rows.authDevices.length, 2);
  assert.equal(db.rows.authDevices.filter(row => !row.revokedAt).length, 2);
  assert.equal(db.rows.authSessions.filter(row => !row.revokedAt).length, 1);
});

test("three concurrent first logins atomically reserve at most two durable slots", async () => {
  const db = studentDb(); const auth = await authFor(db);
  const outcomes = await Promise.allSettled([identityA, identityB, identityC].map(id => auth.createSession(7, nativeRequest(id))));
  assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 2);
  assert.equal(outcomes.filter(result => result.status === "rejected" && result.reason instanceof devices.DeviceLimitError).length, 1);
  assert.equal(db.rows.authDevices.length, 2);
  assert.equal(db.rows.authSessions.length, 2);
});

test("the same enrolled device can sign in concurrently without taking additional slots; staff retain exemption", async () => {
  const db = studentDb(); const auth = await authFor(db);
  await Promise.all([auth.createSession(7, nativeRequest(identityA)), auth.createSession(7, nativeRequest(identityA))]);
  assert.equal(db.rows.authDevices.length, 1);
  assert.equal(db.rows.authSessions.filter(row => !row.revokedAt).length, 1);
  db.rows.users[0].role = "admin";
  await auth.createSession(7, nativeRequest(identityB)); await auth.createSession(7, nativeRequest(identityC));
  assert.equal(db.rows.authDevices.length, 1, "staff sessions must not consume student enrollments");
});

test("browser identity uses a durable HttpOnly cookie and never collapses identical user agents", async () => {
  const auth = await authFor(studentDb());
  const first = await auth.sessionDeviceIdentity(new Request("https://test", { headers: { "user-agent": "identical-browser" } }));
  const second = await auth.sessionDeviceIdentity(new Request("https://test", { headers: { "user-agent": "identical-browser" } }));
  assert.notEqual(first.deviceId, second.deviceId);
  assert.ok(first.deviceId.length >= 32);
  const cookie = auth.browserDeviceCookie(new Request("https://test"), first.deviceId);
  assert.match(cookie, /HttpOnly;/); assert.match(cookie, /Secure;/); assert.match(cookie, /Max-Age=34560000/);
  const again = await auth.sessionDeviceIdentity(new Request("https://test", { headers: { cookie: cookie.split(";")[0], "x-meras-device-id": "changed-browser-header-aaaaaaaaaaaa" } }));
  assert.equal(again.deviceId, first.deviceId);
  const legacy = await auth.sessionDeviceIdentity(new Request("https://test", { headers: { "x-meras-device-id": identityA, "x-meras-platform": "web" } }));
  assert.equal(legacy.deviceId, identityA, "existing local-storage identity upgrades without consuming another slot");
});

test("administrator replacement revokes only the chosen device, records reason and blocks its future enrollment", async () => {
  const db = studentDb(); const auth = await authFor(db);
  await auth.createSession(7, nativeRequest(identityA)); await auth.createSession(7, nativeRequest(identityB));
  db.rows.pushDevices.push({ id: 1, userId: 7, deviceId: identityA, status: "active" }, { id: 2, userId: 7, deviceId: identityB, status: "active" });
  const result = await db.transaction(tx => devices.revokeRegisteredDeviceTx(tx, { userId: 7, deviceId: db.rows.authDevices[0].id, actorEmail: "admin@example.test", reason: "Lost phone replacement", ipAddress: "127.0.0.1", now: "2026-09-09T00:00:00Z" }));
  assert.equal(result.changed, true);
  assert.equal(db.rows.authSessions.find(row => row.deviceId === identityA).revokedAt, "2026-09-09T00:00:00Z");
  assert.equal(db.rows.pushDevices[0].status, "revoked"); assert.equal(db.rows.pushDevices[1].status, "active");
  assert.equal(db.rows.auditLogs.length, 1); assert.match(db.rows.auditLogs[0].afterJson, /Lost phone replacement/);
  await assert.rejects(auth.createSession(7, nativeRequest(identityA)), devices.DeviceLimitError);
  await auth.createSession(7, nativeRequest(identityC));
  assert.equal(db.rows.authDevices.filter(row => !row.revokedAt).length, 2);
  const mismatch = await db.transaction(tx => devices.revokeRegisteredDeviceTx(tx, { userId: 8, deviceId: 2, actorEmail: "admin@example.test", reason: "Invalid ownership", ipAddress: "127.0.0.1", now: "2026-09-09T00:00:00Z" }));
  assert.equal(mismatch.found, false); assert.equal(db.rows.auditLogs.length, 1);
});

test("student session revocation cannot unregister an approved device or admit a third one", async () => {
  const db = studentDb(); const auth = await authFor(db);
  await auth.createSession(7, nativeRequest(identityA)); const current = await auth.createSession(7, nativeRequest(identityB));
  const route = await isolated("../app/api/profile/sessions/route.ts", { ...tables, ...primitives, ...bodies, ...auth, eq, and, gt, isNull, desc: value => value, getDb: () => db, getSessionUser: async () => ({ id: 7 }), sameOriginRequest: () => true, checkRateLimit: async () => true, isNativeAppRequest: () => true });
  const response = await route.DELETE(new Request("https://test/api/profile/sessions", { method: "DELETE", headers: { authorization: `Bearer ${current.token}` }, body: JSON.stringify({ id: db.rows.authSessions[0].id }) }));
  assert.equal(response.status, 200); assert.equal(db.rows.authDevices.length, 2);
  await assert.rejects(auth.createSession(7, nativeRequest(identityC)), devices.DeviceLimitError);
  const list = await (await route.GET(new Request("https://test/api/profile/sessions", { headers: { authorization: `Bearer ${current.token}` } }))).json();
  assert.equal(list.registeredDevices.length, 2); assert.equal(list.registeredDevices.filter(row => row.current).length, 1);
  assert.ok(!JSON.stringify(list).includes(identityA), "raw installation credentials are private");
});

test("device replacement API requires administrator role, step-up and a reason before writes", async () => {
  class AdminMfaError extends Error { status = 428; code = "MFA_STEP_UP_REQUIRED"; }
  for (const scenario of [{ role: "student", mfa: true, status: 403 }, { role: "supervisor", mfa: true, status: 403 }, { role: "admin", mfa: false, status: 428 }, { role: "admin", mfa: true, reason: "", status: 400 }]) {
    const route = await isolated("../app/api/admin/students/[email]/devices/route.ts", { ...tables, ...primitives, ...bodies, ...devices, eq, and, asc: value => value, AdminMfaError, getSessionUser: async () => ({ id: 5, role: scenario.role }), sameOriginRequest: () => true, isNativeAppRequest: () => false, checkRateLimit: async () => true, requireAdminStepUp: async () => { if (!scenario.mfa) throw new AdminMfaError(); }, getDb: () => { throw new Error("database touched before authorization/validation"); } });
    const result = await route.DELETE(new Request("https://test/api/admin/students/student@example.test/devices", { method: "DELETE", body: JSON.stringify({ deviceId: 1, reason: scenario.reason || "" }) }), { params: Promise.resolve({ email: "student@example.test" }) });
    assert.equal(result.status, scenario.status);
  }
});

test("migration preserves retained first-device history across logout and invalidates unapproved legacy sessions", async () => {
  const migration = await readFile(new URL("../drizzle/0028_durable_student_devices.sql", import.meta.url), "utf8");
  const backfill = migration.slice(migration.indexOf("WITH first_sessions"), migration.indexOf("-- Previously active third devices"));
  assert.match(backfill, /row_number\(\) OVER \(PARTITION BY user_id ORDER BY created_at::timestamptz, id\)/);
  assert.match(backfill, /position <= 2/); assert.match(backfill, /NOT LIKE 'fallback-%'/);
  assert.doesNotMatch(backfill, /s\.revoked_at IS NULL|s\.expires_at/);
  assert.match(migration, /UPDATE auth_sessions s SET revoked_at/); assert.match(migration, /UPDATE push_devices p SET status = 'revoked'/);
  const settings = await isolated("../lib/platform-settings.ts");
  assert.equal(await settings.getStudentDeviceLimit(), 2);
  for (const path of ["app/api/auth/login/route.ts", "app/api/auth/register/route.ts", "app/api/mobile/auth/login/route.ts", "app/api/mobile/auth/register/route.ts", "lib/oauth.ts"]) {
    assert.match(await readFile(new URL("../" + path, import.meta.url), "utf8"), /await createSession\(/, `${path} uses the shared enrollment boundary`);
  }
});
