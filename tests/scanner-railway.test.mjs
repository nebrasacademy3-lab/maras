import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { createScannerServer, listenScanner } from "../services/scanner/server.mjs";

const token = "railway-scanner-test-" + "x".repeat(40);
const clean = { status: "clean", clean: true, threat: null };
async function serverFor(t, options = {}) {
  const server = createScannerServer({ token, ...options });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { server, url: "http://127.0.0.1:" + server.address().port };
}

test("Railway readiness scans fixed content without exposing credentials or bypassing scan authentication", async t => {
  const observed = [];
  const { url } = await serverFor(t, { scan: async bytes => { observed.push(bytes.toString()); return clean; } });
  const response = await fetch(url + "/ready", { headers: { host: "healthcheck.railway.app" } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(observed, ["Meras scanner readiness probe"]);
  const body = Buffer.from("user attachment");
  const unauthenticated = await fetch(url + "/scan", { method: "POST", body, headers: { "x-content-sha256": createHash("sha256").update(body).digest("hex") } });
  assert.equal(unauthenticated.status, 401);
  assert.equal((await fetch(url + "/health")).status, 401);
  assert.equal((await fetch(url + "/ready", { method: "POST", body })).status, 401);
  assert.equal(observed.length, 1);
});

test("Railway readiness fails closed for engine failures and contradictory results without leaking details", async t => {
  for (const result of [new Error("secret-internal-host-and-password"), { ...clean, clean: false }, { ...clean, threat: "Malware" }, { ...clean, status: "quarantined" }]) {
    const { url } = await serverFor(t, { scan: async () => { if (result instanceof Error) throw result; return result; } });
    const response = await fetch(url + "/ready");
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false });
  }
});

test("parallel and repeated public readiness checks share one bounded engine probe", async t => {
  let calls = 0;
  const { url } = await serverFor(t, { scan: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 30)); return clean; } });
  const responses = await Promise.all(Array.from({ length: 12 }, () => fetch(url + "/ready")));
  assert.equal(responses.every(response => response.status === 200), true);
  assert.equal(calls, 1);
  assert.equal((await fetch(url + "/ready")).status, 200);
  assert.equal(calls, 1);
});

test("readiness reports unavailable while scan concurrency is exhausted", async t => {
  let release;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const { url } = await serverFor(t, { concurrency: 1, scan: async () => { entered(); await held; return clean; } });
  t.after(() => release());
  const body = Buffer.from("synthetic file");
  const scan = fetch(url + "/scan", { method: "POST", body, headers: { authorization: "Bearer " + token, "x-content-sha256": createHash("sha256").update(body).digest("hex") } });
  await started;
  const ready = await fetch(url + "/ready");
  assert.equal(ready.status, 503);
  assert.deepEqual(await ready.json(), { ok: false });
  release();
  assert.equal((await scan).status, 200);
});

test("scanner listener accepts IPv6 and IPv4 for both Railway private network generations", async t => {
  const server = createScannerServer({ token, scan: async () => clean });
  t.after(() => { server.closeAllConnections(); server.close(); });
  listenScanner(server, 0);
  try { await once(server, "listening"); }
  catch (error) {
    if (error.code === "EAFNOSUPPORT" || error.code === "EADDRNOTAVAIL") { t.skip("Host has no IPv6 loopback support"); return; }
    throw error;
  }
  const port = server.address().port;
  const responses = await Promise.all([fetch("http://[::1]:" + port + "/ready"), fetch("http://127.0.0.1:" + port + "/ready")]);
  assert.equal(responses.every(response => response.status === 200), true);
});
