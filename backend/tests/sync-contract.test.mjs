import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

test("sync endpoint accepts the native protocol, rejects supplied cross-site origins, and bounds its hot path", async () => {
  const [source, guard, mobileApi] = await Promise.all([
    read("app/api/sync/route.ts"),
    read("lib/sync-guard.ts"),
    read("lib/mobile-api.ts"),
  ]);
  assert.match(source, /isMobileRequest\(request\)/);
  assert.match(mobileApi, /x-meras-client/);
  assert.match(mobileApi, /if \(origin\) return false/);
  assert.match(mobileApi, /if \(sameOriginRequest\(request\)\) return true/);
  assert.match(source, /getSessionUser\(request\)/);
  assert.match(source, /allowSyncRequest\(identity\)/);
  assert.match(guard, /SYNC_WINDOW_MS/);
  assert.match(guard, /MAX_SYNC_REQUESTS/);
  assert.match(source, /return jsonError\("طلبات مزامنة كثيرة/);
});

test("sync response is version-only and exposes scoped channels", async () => {
  const [route, snapshot] = await Promise.all([read("app/api/sync/route.ts"), read("lib/sync-snapshot.ts")]);
  assert.match(route, /getSyncSnapshot\(user\)/);
  assert.match(snapshot, /channels:\s*signatures/);
  for (const channel of ["catalog", "settings", "announcements", "account", "commerce", "support", "notifications", "requests", "supervisor", "admin"]) assert.match(snapshot, new RegExp(`\\"${channel}\\"`));
  assert.match(snapshot, /createHash\("sha256"\)/);
  assert.doesNotMatch(snapshot, /passwordHash|message|body|objectKey/);
});

test("web sync prefers server-sent events with adaptive polling fallback", async () => {
  const [source, stream] = await Promise.all([read("components/realtime-sync.tsx"), read("app/api/sync/stream/route.ts")]);
  assert.match(source, /document\.visibilityState === "hidden"/);
  assert.match(source, /60_000/);
  assert.match(source, /new EventSource\("\/api\/sync\/stream"/);
  assert.match(source, /45_000/);
  assert.match(source, /5_000/);
  assert.match(source, /new CustomEvent\(REALTIME_SYNC_EVENT/);
  assert.match(source, /Math\.min\(reconnectDelay \* 2/);
  assert.match(stream, /text\/event-stream/);
  assert.match(stream, /x-accel-buffering/);
  assert.match(stream, /acquireSyncConnection/);
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
