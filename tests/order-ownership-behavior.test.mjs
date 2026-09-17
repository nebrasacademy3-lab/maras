import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { isolated, tables, eq, sql, database } from "./helpers/business-fixtures.mjs";
import { pureSource } from "./helpers/pure-source.mjs";
const ownership = await isolated("../lib/order-ownership.ts", { ...tables, eq, sql });

test("an absent or invalid stored owner cannot invoke an email lookup or grant access", async () => {
  const tx = { execute: () => { throw Error("must not query"); }, select: () => { throw Error("must not query"); } };
  for (const userId of [null, undefined, 0, -1, "1", 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(ownership.lockOrderOwnerTx(tx, { userId, customerEmail: "current@example.test" }), error => error.code === "ORDER_OWNER_UNRESOLVED");
  }
});
test("stored identity resolves only that active account, never the current holder of its historical email", async () => {
  const db = database({ users: [{ id: 1, email: "new@example.test", status: "active" }, { id: 2, email: "old@example.test", status: "active" }] });
  const actual = await db.transaction(tx => ownership.lockOrderOwnerTx(tx, { userId: 1, customerEmail: "old@example.test" }));
  assert.deepEqual(actual, { id: 1, email: "new@example.test", status: "active" });
  for (const status of ["deleted", "suspended", "unknown"]) {
    db.rows.users[0].status = status;
    await assert.rejects(db.transaction(tx => ownership.lockOrderOwnerTx(tx, { userId: 1 })), error => error.code === "ORDER_OWNER_UNAVAILABLE");
  }
});

const equal = (column, value) => row => row[column] === value;
const all = (...terms) => row => terms.filter(Boolean).every(term => term(row));
const any = (...terms) => row => terms.filter(Boolean).some(term => term(row));
const nul = column => row => row[column] == null;
const visibility = await pureSource("lib/notification-visibility.ts", { notificationsDb: { targetUserId: "target", userEmail: "email", audience: "audience" }, eq: equal, and: all, or: any, isNull: nul });
test("private notification visibility never falls through into role or public broadcasts", () => {
  const a = { id: 1, role: "student" }, b = { id: 2, role: "student" };
  for (const audience of ["student", "public", "user"]) {
    const privateRow = { target: 1, email: null, audience };
    assert.equal(visibility.notificationRecipientWhere(a)(privateRow), true);
    assert.equal(visibility.notificationRecipientWhere(b)(privateRow), false);
    assert.equal(visibility.notificationRecipientWhere(null)(privateRow), false);
    const unresolved = { target: null, email: "old@example.test", audience };
    for (const user of [a, b, null]) assert.equal(visibility.notificationRecipientWhere(user)(unresolved), false);
  }
  assert.equal(visibility.notificationRecipientWhere(a)({ target: null, email: null, audience: "student" }), true);
  assert.equal(visibility.notificationRecipientWhere(null)({ target: null, email: null, audience: "student" }), false);
  assert.equal(visibility.notificationRecipientWhere(null)({ target: null, email: null, audience: "public" }), true);
});

test("push target null/invalid/omitted ID cannot accidentally broadcast a private payload", async () => {
  const push = await pureSource("lib/push.ts", { getDb: () => { throw Error("must not query"); } });
  for (const target of [{}, { userId: null, audience: "public" }, { userId: undefined, userEmail: "old@example.test" }, { userId: -1 }, { userId: 1.5 }, { audience: "user" }, { audience: "invalid" }]) {
    const result = await push.sendPushNotification(target, "Private", "Fixture");
    assert.equal(result.attempted, 0); assert.deepEqual(result.providerErrors, ["PUSH_RECIPIENT_UNRESOLVED"]);
  }
});
test("push queries the active bound user even when historical email and public audience are also supplied", async () => {
  const rows = [
    { "device.id": 10, "device.token": "A", "device.status": "active", "user.id": 1, "user.email": "new@example.test", "user.role": "student", "user.status": "active" },
    { "device.id": 11, "device.token": "B", "device.status": "active", "user.id": 2, "user.email": "old@example.test", "user.role": "student", "user.status": "active" },
    { "device.id": 12, "device.token": "C", "device.status": "active", "user.id": 1, "user.email": "new@example.test", "user.role": "student", "user.status": "deleted" },
  ];
  const sent = [];
  const db = { select: fields => ({ from: () => ({ innerJoin: () => ({ where: async predicate => rows.filter(predicate).map(row => Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, row[field]]))) }) }) }) };
  const push = await pureSource("lib/push.ts", { getDb: () => db, eq: equal, and: all, users: { id: "user.id", email: "user.email", status: "user.status", role: "user.role" }, pushDevices: { id: "device.id", token: "device.token", status: "device.status", userId: "device.userId" }, fetch: async (_url, init) => { sent.push(...JSON.parse(init.body)); return Response.json({ data: [{ status: "ok" }] }); } });
  const result = await push.sendPushNotification({ userId: 1, userEmail: "old@example.test", audience: "public" }, "Private", "Fixture");
  assert.equal(result.accepted, 1); assert.deepEqual(sent.map(row => row.to), ["A"]);
});
test("notification persistence rejects an unresolved explicit target before saving a broadcast-shaped row", async () => {
  const notifications = await pureSource("lib/notifications.ts", { getDb: () => { throw Error("must not persist"); } });
  for (const input of [
    { values: { targetUserId: null, userEmail: null }, target: { userId: null } },
    { values: { targetUserId: 1 }, target: { userId: 2 } },
    { values: { userEmail: null }, target: { userEmail: "private@example.test" } },
  ]) {
    const result = await notifications.createAndSendNotification(input);
    assert.equal(result.saved, false); assert.equal(result.attempted, 0); assert.equal(result.persistenceError, "NOTIFICATION_RECIPIENT_UNRESOLVED");
  }
});
test("order consumers use IDs while provider matching and invoice details retain the historical snapshot", async () => {
  const source = path => readFile(new URL("../" + path, import.meta.url), "utf8");
  const emailChange = await source("lib/email-change.ts");
  assert.doesNotMatch(emailChange, /UPDATE "(?:orders|invoices|ai_subscription_orders|notifications)"/);
  const callback = await source("app/api/webhooks/tap/route.ts");
  assert.match(callback, /verified\.customer\.email\.toLowerCase\(\) === order\.customerEmail\.toLowerCase\(\)/);
  assert.match(callback, /lockOrderOwnerTx\(tx, current\)/);
  for (const path of ["app/api/mobile/dashboard/route.ts", "app/dashboard/page.tsx", "lib/assistant-context.ts"]) {
    const text = await source(path);
    assert.match(text, /eq\(orders\.userId, user\.id\)/);
    assert.match(text, /notificationRecipientWhere\(user\)/);
  }
  const checkout = await source("app/api/checkout/route.ts");
  assert.ok(checkout.indexOf('kind: "session_expired"') < checkout.indexOf("tx.insert(orders)"));
  assert.match(checkout, /userId: user\.id, orderNumber/);
});
test("immediate delivery uses the persisted recipient ID instead of resolving the supplied historical email again", async () => {
  const targets = [], updates = [];
  const db = { insert: () => ({ values: () => ({ returning: async () => [{ id: 42, targetUserId: 1, userEmail: "old@example.test", audience: "student" }] }) }), update: () => ({ set: values => ({ where: async () => { updates.push(values); } }) }) };
  const notifications = await pureSource("lib/notifications.ts", { getDb: () => db, notificationsDb: {}, eq: () => true, sendPushNotification: async target => { targets.push(target); return { attempted: 1, accepted: 1, rejected: 0, invalidated: 0, providerErrors: [] }; } });
  const result = await notifications.createAndSendNotification({ values: { userEmail: "old@example.test", audience: "student", title: "private", body: "fixture" }, target: { userEmail: "old@example.test" } });
  assert.equal(result.saved, true); assert.deepEqual(targets, [{ userId: 1 }]); assert.equal(updates[0].pushStatus, "accepted");
});
test("failed notification persistence sends no unrecorded or unbound private push", async () => {
  let calls = 0;
  const notifications = await pureSource("lib/notifications.ts", { getDb: () => ({ insert: () => { throw Error("synthetic offline"); } }), notificationsDb: {}, sendPushNotification: async () => { calls++; } });
  const result = await notifications.createAndSendNotification({ values: { targetUserId: 1, title: "private", body: "fixture" }, target: { userId: 1 } });
  assert.equal(result.saved, false); assert.equal(result.attempted, 0); assert.equal(calls, 0);
});
