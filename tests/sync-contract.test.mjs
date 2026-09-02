import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

test("sync endpoint enforces origin, session, and bounded hot-path limiting", async () => {
  const [source, guard] = await Promise.all([read("app/api/sync/route.ts"), read("lib/sync-guard.ts")]);
  assert.match(source, /sameOriginRequest\(request\)/);
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
  const source = await read("mobile/src/providers/RealtimeSyncProvider.tsx");
  assert.match(source, /AppState\.addEventListener/);
  assert.match(source, /appState\.current !== "active"/);
  assert.match(source, /invalidateQueries/);
  for (const key of ["dashboard", "cart", "favorites", "support", "notifications", "supervisor-workspace", "supervisor-requests", "admin-console"]) assert.match(source, new RegExp(`\\[\\"${key}\\"\\]`));
  assert.match(source, /reason\.status === 401/);
  assert.match(source, /reason\.status === 429/);
});

test("admin centers subscribe to realtime sync and the newer tables emit the admin channel", async () => {
  const [migration, journal, referrals, ai, bundles, tracks, finance, operations] = await Promise.all([
    read("drizzle/0025_admin_center_sync.sql"),
    read("drizzle/meta/_journal.json"),
    read("components/admin-referrals-center.tsx"),
    read("components/admin-ai-center.tsx"),
    read("components/admin-bundles-center.tsx"),
    read("components/admin-learning-tracks-center.tsx"),
    read("components/finance-center.tsx"),
    read("components/admin-operations-center.tsx"),
  ]);
  for (const table of ["referral_tiers", "referral_attributions", "user_rewards", "coupon_uses", "ai_api_keys", "ai_entitlements", "ai_subscription_orders", "course_bundles", "refund_requests", "payment_settlement_lines", "course_waitlist", "audit_logs"]) {
    assert.match(migration, new RegExp(`CREATE TRIGGER sync_${table}_admin AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION meras_sync_admin_statement\\(\\);`));
  }
  assert.match(journal, /"tag": "0025_admin_center_sync"/);
  for (const component of [referrals, ai, bundles, tracks, finance, operations]) assert.match(component, /useRealtimeSync\(/);
});
