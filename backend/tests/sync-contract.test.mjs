import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

test("sync endpoint enforces origin, session, and database-backed rate limiting", async () => {
  const source = await read("app/api/sync/route.ts");
  assert.match(source, /sameOriginRequest\(request\)/);
  assert.match(source, /getSessionUser\(request\)/);
  assert.match(source, /checkRateLimit\("sync-heartbeat"/);
  assert.match(source, /return jsonError\("طلبات مزامنة كثيرة/);
});

test("sync response is version-only and exposes scoped channels", async () => {
  const source = await read("app/api/sync/route.ts");
  assert.match(source, /channels:\s*\{/);
  for (const channel of ["catalog", "account", "commerce", "support", "notifications", "requests", "supervisor", "admin"]) assert.match(source, new RegExp(`${channel}: value`));
  assert.doesNotMatch(source, /return Response\.json\(\{[^}]*email/si);
  assert.doesNotMatch(source, /passwordHash|message|body|objectKey/);
});

test("web sync uses adaptive visibility polling and emits a custom event", async () => {
  const source = await read("components/realtime-sync.tsx");
  assert.match(source, /document\.visibilityState === "hidden"/);
  assert.match(source, /60_000/);
  assert.match(source, /15_000/);
  assert.match(source, /new CustomEvent\(REALTIME_SYNC_EVENT/);
  assert.match(source, /Math\.min\(delay \* 2/);
});

test("Expo sync provider is foreground-only and invalidates query channels", async () => {
  const source = await read("../mobile/src/providers/RealtimeSyncProvider.tsx");
  assert.match(source, /AppState\.addEventListener/);
  assert.match(source, /appState\.current !== "active"/);
  assert.match(source, /invalidateQueries/);
  for (const key of ["dashboard", "cart", "favorites", "support", "notifications", "supervisor-workspace", "supervisor-requests", "admin-console"]) assert.match(source, new RegExp(`\\[\\"${key}\\"\\]`));
  assert.match(source, /reason\.status === 401/);
  assert.match(source, /reason\.status === 429/);
});
