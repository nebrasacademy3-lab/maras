import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runtimeServices } from "../scripts/runtime-supervisor.mjs";
import { requireSuccessfulCi, REQUIRED_CI } from "../scripts/deploy-ci-gate.mjs";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const sha = "a".repeat(40);
const env = { RAILWAY_GIT_COMMIT_SHA: sha, RAILWAY_GIT_BRANCH: "main" };
const successful = () => ({ workflow_runs: REQUIRED_CI.map((path, i) => ({ id: i + 1, path, head_sha: sha, head_branch: "main", event: "push", status: "completed", conclusion: "success" })) });
const options = { env, pause: async () => {}, log: () => {}, maxAttempts: 3 };

// No inherited production credentials, database, object storage, or AI settings.
const childEnv = { NODE_ENV: "test", PATH: process.env.PATH || "", ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) };

test("cleanup starts with the server-entry loader before tsx; web keeps its own guard", () => {
  const services = runtimeServices({});
  const cleanup = services.find(service => service.name === "storage-cleanup-worker");
  const ai = services.find(service => service.name === "ai-worker");
  assert.deepEqual(cleanup.args.slice(0, -1), ai.args.slice(0, -1));
  assert.deepEqual(cleanup.args.slice(0, 2), ["--import", "./scripts/ai-worker-runtime.mjs"]);
  assert.equal(cleanup.args.at(-1), "scripts/storage-cleanup-worker.ts");
  assert.equal(services.find(service => service.name === "web").args.includes("./scripts/ai-worker-runtime.mjs"), false);
});

test("server marker resolves in a dedicated Node worker without changing global resolution", () => {
  const loader = runtimeServices({}).find(service => service.name === "storage-cleanup-worker").args.slice(0, 2);
  const result = spawnSync(process.execPath, [...loader, "--input-type=module", "-e", "await import('server-only'); console.log('SERVER_MARKER_OK');"], { cwd, env: childEnv, encoding: "utf8", timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /SERVER_MARKER_OK/);
});

test("real cleanup dependency graph imports under the production worker argv", { timeout: 30000 }, () => {
  const cleanup = runtimeServices({}).find(service => service.name === "storage-cleanup-worker");
  assert.match(readFileSync(new URL("../lib/study-resumable-upload.ts", import.meta.url), "utf8"), /import ["']server-only["']/);
  const script = "const m = await import('./lib/study-resumable-upload.ts'); if (typeof m.expireStudyUploads !== 'function') throw new Error('Missing cleanup export'); console.log('STORAGE_IMPORT_OK');";
  const result = spawnSync(process.execPath, [...cleanup.args.slice(0, -1), "--input-type=module", "-e", script], { cwd, env: childEnv, encoding: "utf8", timeout: 25000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /STORAGE_IMPORT_OK/);
});

test("CI uses only the explicit deployment token at the fixed API origin and never logs it", async () => {
  const logs = [], token = "synthetic-deploy-token-not-a-secret";
  const result = await requireSuccessfulCi({ ...options, env: { ...env, DEPLOY_GITHUB_TOKEN: token }, log: value => logs.push(value), fetcher: async (url, init) => {
    assert.equal(url.origin, "https://api.github.com");
    assert.equal(init.headers.authorization, `Bearer ${token}`);
    assert.equal(init.redirect, "error");
    assert.equal(init.credentials, "omit");
    return Response.json(successful());
  }});
  assert.equal(result.ready, true);
  assert.equal(logs.join(""), logs.join("").replaceAll(token, ""));
});

test("malformed CI credentials fail before a network request", async () => {
  let calls = 0;
  for (const token of ["abc\r\nInjected:value", "x".repeat(4097)]) {
    await assert.rejects(requireSuccessfulCi({ ...options, env: { ...env, DEPLOY_GITHUB_TOKEN: token }, fetcher: async () => { calls++; return Response.json(successful()); } }), /Invalid deployment CI credential/);
  }
  assert.equal(calls, 0);
});

test("temporary GitHub errors recover with bounded retries and safe diagnostics", async () => {
  let calls = 0;
  const waits = [], logs = [];
  const result = await requireSuccessfulCi({ ...options, pause: async ms => { waits.push(ms); }, log: value => logs.push(value), fetcher: async () => {
    calls++;
    if (calls === 1) throw new Error("synthetic-secret-do-not-log");
    if (calls === 2) return new Response("synthetic-secret-do-not-log", { status: 503 });
    return Response.json(successful());
  }});
  assert.equal(result.ready, true);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [2000, 4000]);
  assert.doesNotMatch(logs.join(""), /synthetic-secret-do-not-log/);
});

test("rate-limit Retry-After and reset times are respected before retrying", async () => {
  for (const [status, headers, minimum] of [[429, { "retry-after": "90" }, 90000], [403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "180" }, 181000], [429, {}, 60000]]) {
    let clock = 0, calls = 0;
    const waits = [];
    const result = await requireSuccessfulCi({ ...options, now: () => clock, pause: async ms => { waits.push(ms); clock += ms; }, fetcher: async () => ++calls === 1 ? new Response("limited", { status, headers }) : Response.json(successful()) });
    assert.equal(result.ready, true);
    assert.ok(waits[0] >= minimum);
    assert.equal(calls, 2);
  }
});

test("rate limits beyond the deadline fail closed without making an early request", async () => {
  let calls = 0, pauses = 0;
  await assert.rejects(requireSuccessfulCi({ ...options, now: () => 0, pause: async () => { pauses++; }, fetcher: async () => { calls++; return new Response("limited", { status: 429, headers: { "retry-after": "3600" } }); } }), /deployment blocked/);
  assert.equal(calls, 1);
  assert.equal(pauses, 0);
});

test("authentication and permission failures do not retry or bypass the release gate", async () => {
  for (const status of [301, 302, 401, 403, 404]) {
    let calls = 0;
    await assert.rejects(requireSuccessfulCi({ ...options, fetcher: async () => { calls++; return new Response("unsafe-body", { status }); } }), error => error.message.includes(`HTTP ${status}`) && !error.message.includes("unsafe-body"));
    assert.equal(calls, 1);
  }
});
