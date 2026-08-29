import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("broadcast notification read state is stored per user", async () => {
  const [schema, route, migration] = await Promise.all([
    read("db/schema.ts"),
    read("app/api/mobile/notifications/route.ts"),
    read("drizzle/0011_notification_read_state.sql"),
  ]);
  assert.match(schema, /export const notificationReads/);
  assert.match(schema, /notification_reads_notification_user_unique/);
  assert.match(route, /notificationReads\.userEmail/);
  assert.match(route, /onConflictDoUpdate/);
  assert.doesNotMatch(route, /update\(notificationsDb\)\.set\(\{ readAt/);
  assert.match(migration, /sync_notification_reads_scoped/);
});

test("announcement endpoint includes public and signed-in role campaigns", async () => {
  const route = await read("app/api/public/announcements/route.ts");
  assert.match(route, /getSessionUser\(request\)/);
  assert.match(route, /notificationsDb\.audience, user\.role/);
  assert.match(route, /notificationsDb\.audience, "public"/);
});
