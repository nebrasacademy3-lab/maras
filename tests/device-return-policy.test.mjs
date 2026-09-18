import test from "node:test";
import assert from "node:assert/strict";
import { pureSource } from "./helpers/pure-source.mjs";
const policy = await pureSource("lib/device-access-policy.ts");
const now = Date.parse("2026-09-16T10:00:00Z");
const revoked = { revokedAt: "2026-09-15T10:00:00Z" };
test("legacy revoked devices remain blocked, not silently reopened", () => {
  assert.equal(policy.deviceReturnDecision(revoked, now), "blocked");
  assert.equal(policy.deviceReturnDecision({ ...revoked, returnPolicy: "invented" }, now), "blocked");
  assert.equal(policy.deviceReturnDecision({ revokedAt: null }, now), "active");
});
test("allowing return and waiting for approval are separate decisions", () => {
  assert.equal(policy.deviceReturnDecision({ ...revoked, returnPolicy: "allowed" }, now), "allowed");
  assert.equal(policy.deviceReturnDecision({ ...revoked, returnPolicy: "approval" }, now), "approval");
});
test("temporary bans use the server instant and fail closed on an invalid deadline", () => {
  assert.equal(policy.deviceReturnDecision({ ...revoked, returnPolicy: "allowed", blockedUntil: "2026-09-16T10:00:01Z" }, now), "temporary");
  assert.equal(policy.deviceReturnDecision({ ...revoked, returnPolicy: "allowed", blockedUntil: "2026-09-16T10:00:00Z" }, now), "allowed");
  assert.equal(policy.deviceReturnDecision({ ...revoked, returnPolicy: "allowed", blockedUntil: "invalid" }, now), "blocked");
});
test("session revocation does not create an enrollment policy mutation", () => {
  const command = policy.parseDeviceCommand({ action: "end_sessions", deviceId: 1, reason: "طلب الطالب", expectedRevision: 0 });
  assert.equal(policy.deviceActionPolicy(command, now), null);
});
test("temporary restriction has a bounded duration and explicit post-expiry permission", () => {
  const command = policy.parseDeviceCommand({ action: "block_until", deviceId: 1, reason: "مراجعة مؤقتة", expectedRevision: 2, durationHours: 24 });
  assert.deepEqual(policy.deviceActionPolicy(command, now), { returnPolicy: "allowed", blockedUntil: "2026-09-17T10:00:00.000Z" });
  for (const durationHours of [0, -1, 1.5, 2161, Infinity, "not a number"]) assert.throws(() => policy.parseDeviceCommand({ ...command, durationHours }));
});
test("new operations require a revision and never accept arbitrary actions or targets", () => {
  const valid = { action: "allow_return", deviceId: 2, reason: "تم التحقق من الطلب", expectedRevision: 0 };
  policy.parseDeviceCommand(valid);
  for (const fields of [{ action: "delete_user" }, { deviceId: -1 }, { deviceId: 1.1 }, { expectedRevision: -1 }, { expectedRevision: undefined }, { reason: "x" }, { reason: "x".repeat(601) }]) assert.throws(() => policy.parseDeviceCommand({ ...valid, ...fields }));
});
test("legacy DELETE cannot smuggle an allow policy into its compatibility action", () => {
  const command = policy.parseDeviceCommand({ action: "allow_return", deviceId: 1, reason: "طلب استبدال" }, true);
  assert.equal(command.action, "revoke_block");
  assert.deepEqual(policy.deviceActionPolicy(command, now), { returnPolicy: "blocked", blockedUntil: null });
});
