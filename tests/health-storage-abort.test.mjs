import assert from "node:assert/strict";
import test from "node:test";
import { nativeSource } from "./helpers/native-source.mjs";

const { createReadinessProbe } = await nativeSource("lib/readiness-probe.ts");
async function healthRoute(checkStorageReadiness) {
  return nativeSource("app/api/health/route.ts", {
    getPool: () => ({}),
    createReadinessProbe: check => createReadinessProbe(check, { timeoutMs: 30, ttlMs: 0 }),
    checkDatabaseReadiness: async (_pool, signal) => { assert.ok(signal instanceof AbortSignal); return true; },
    checkStorageReadiness,
    observeRequest: (_request, _operation, handler) => handler("synthetic-health-check"),
    scannerConfigured: () => true,
    process: { env: { NODE_ENV: "test" } },
  });
}

test("concurrent health requests share and abort one storage probe, returning 503", async () => {
  let calls = 0;
  let receivedSignal;
  let settled = false;
  const route = await healthRoute(signal => {
    calls++;
    receivedSignal = signal;
    assert.ok(signal instanceof AbortSignal);
    return new Promise(resolve => signal.addEventListener("abort", () => {
      settled = true;
      resolve(false);
    }, { once: true }));
  });
  const responses = await Promise.all(Array.from({ length: 8 }, () =>
    route.GET(new Request("https://maras-qa.example/api/health"))));
  assert.equal(calls, 1);
  assert.equal(receivedSignal?.aborted, true);
  assert.equal(settled, true, "the underlying storage operation receives cancellation, not just a raced timeout");
  for (const response of responses) {
    assert.equal(response.status, 503);
    const value = await response.json();
    assert.equal(value.ok, false);
    assert.equal(value.readiness.storage, "unavailable");
  }
});

test("a healthy storage probe receives its live signal and returns ready", async () => {
  const route = await healthRoute(async signal => {
    assert.ok(signal instanceof AbortSignal);
    assert.equal(signal.aborted, false);
    return true;
  });
  const response = await route.GET(new Request("https://maras-qa.example/api/health"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).readiness.storage, "ready");
});
