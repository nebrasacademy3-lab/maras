import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { nativeSource } from "./helpers/native-source.mjs";
const { createReadinessProbe } = await nativeSource("lib/readiness-probe.ts");
const { checkDatabaseReadiness } = await nativeSource("lib/readiness-database.ts", {});

function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { resolve, reject, promise }; }

test("one hundred concurrent readiness requests share one dependency probe and short cache", async () => {
  let calls = 0;
  const work = deferred();
  const check = createReadinessProbe(async () => { calls++; return work.promise; }, { timeoutMs: 1000, ttlMs: 50 });
  const reads = Array.from({ length: 100 }, () => check());
  assert.ok(reads.every(value => value === reads[0]));
  work.resolve(true);
  assert.deepEqual(await Promise.all(reads), Array(100).fill("ready"));
  assert.equal(await check(), "ready"); assert.equal(calls, 1);
  await sleep(70); assert.equal(await check(), "ready"); assert.equal(calls, 2);
});

test("a timeout aborts the probe but does not admit more unresolved work or late success", async () => {
  let calls = 0, signal;
  const work = deferred();
  const check = createReadinessProbe(async (value) => { calls++; signal = value; return work.promise; }, { timeoutMs: 25, ttlMs: 0 });
  assert.equal(await check(), "unavailable"); assert.equal(signal.aborted, true);
  await sleep(40);
  assert.deepEqual(await Promise.all(Array.from({ length: 100 }, () => check())), Array(100).fill("unavailable"));
  assert.equal(calls, 1, "a timed-out non-cooperative dependency retains the reservation");
  work.resolve(true);
  await sleep(0);
  assert.equal(await check(), "ready"); assert.equal(calls, 2, "only new successful work restores readiness");
});

test("throwing and rejecting probes fail closed and can recover after the cache expires", async () => {
  let attempts = 0;
  const check = createReadinessProbe(() => {
    attempts++;
    if (attempts === 1) throw new Error("synthetic secret");
    if (attempts === 2) return Promise.reject(new Error("synthetic secret"));
    return Promise.resolve(true);
  }, { timeoutMs: 100, ttlMs: 1 });
  assert.equal(await check(), "unavailable"); await sleep(5);
  assert.equal(await check(), "unavailable"); await sleep(5);
  assert.equal(await check(), "ready"); assert.equal(attempts, 3);
  for (const options of [{ timeoutMs: NaN }, { timeoutMs: 0 }, { ttlMs: -1 }]) assert.throws(() => createReadinessProbe(async () => true, options));
});

function databaseFixture() {
  const releases = [], queries = [], work = deferred();
  const client = { release: value => releases.push(value), query: async value => { queries.push(value); return work.promise; } };
  return { releases, queries, work, client, pool: { connect: async () => client } };
}

test("a successful database readiness query uses a short timeout and releases once", async () => {
  const f = databaseFixture(), controller = new AbortController();
  f.work.resolve({ rows: [{ value: 1 }] });
  assert.equal(await checkDatabaseReadiness(f.pool, controller.signal), true);
  assert.deepEqual(f.queries, [{ text: "select 1", query_timeout: 2000 }]);
  assert.deepEqual(f.releases, [false]); controller.abort(); assert.deepEqual(f.releases, [false]);
});

test("aborting a borrowed database connection destroys it once, never returning a busy connection", async () => {
  const f = databaseFixture(), controller = new AbortController();
  const result = checkDatabaseReadiness(f.pool, controller.signal);
  await sleep(0); controller.abort(); f.work.reject(new Error("connection destroyed"));
  assert.equal(await result, false); assert.deepEqual(f.releases, [true]);
});

test("late database acquisition after deadline is destroyed without a query", async () => {
  const f = databaseFixture(), acquisition = deferred(), controller = new AbortController();
  const result = checkDatabaseReadiness({ connect: () => acquisition.promise }, controller.signal);
  controller.abort(); acquisition.resolve(f.client);
  assert.equal(await result, false); assert.deepEqual(f.queries, []); assert.deepEqual(f.releases, [true]);
  assert.equal(await checkDatabaseReadiness({ connect: () => { throw new Error("must not connect"); } }, controller.signal), false);
});

test("database query failure destroys the connection without exposing its error", async () => {
  const f = databaseFixture(); f.work.reject(new Error("postgres://private-account:private-secret@private-host"));
  assert.equal(await checkDatabaseReadiness(f.pool, new AbortController().signal), false);
  assert.deepEqual(f.releases, [true]);
});

test("health controller preserves status, correlation and fail-closed required configuration", async () => {
  let databaseReady = true, storageReady = true;
  const env = { NODE_ENV: "production", SESSION_SECRET: "s".repeat(40), ADMIN_API_TOKEN: "a".repeat(40), ADMIN_UPLOAD_TOKEN: "u".repeat(40), VIDEO_SIGNING_SECRET: "v".repeat(40) };
  const route = await nativeSource("app/api/health/route.ts", {
    process: { env },
    getPool: () => ({}),
    checkDatabaseReadiness: async () => databaseReady,
    checkStorageReadiness: async () => storageReady,
    createReadinessProbe: check => createReadinessProbe(check, { timeoutMs: 100, ttlMs: 0 }),
    observeRequest: (_request, _label, operation) => operation("synthetic-correlation-id"),
    scannerConfigured: () => false,
  });
  const request = () => new Request("https://maras-qa.example/api/health");
  const first = await route.GET(request()), body = await first.json();
  assert.equal(first.status, 200); assert.equal(body.status, "degraded"); assert.equal(body.requestId, "synthetic-correlation-id");
  assert.equal(first.headers.get("cache-control"), "no-store, max-age=0");
  for (const value of [env.SESSION_SECRET, env.ADMIN_API_TOKEN, env.ADMIN_UPLOAD_TOKEN, env.VIDEO_SIGNING_SECRET]) assert.equal(JSON.stringify(body).includes(value), false);
  env.SESSION_SECRET = "short"; assert.equal((await route.GET(request())).status, 503);
  env.SESSION_SECRET = "s".repeat(40); databaseReady = false; await sleep(0); assert.equal((await route.GET(request())).status, 503);
  databaseReady = true; storageReady = false; await sleep(0); assert.equal((await route.GET(request())).status, 503);
});
