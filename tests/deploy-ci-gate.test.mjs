import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCiRuns, requireSuccessfulCi, REQUIRED_CI } from "../scripts/deploy-ci-gate.mjs";
const sha = "a".repeat(40);
const env = { RAILWAY_GIT_COMMIT_SHA: sha, RAILWAY_GIT_BRANCH: "main", RAILWAY_GIT_REPO_OWNER: "nebrasacademy3-lab", RAILWAY_GIT_REPO_NAME: "maras" };
const run = (path, overrides = {}) => ({ id: 1, path, head_sha: sha, head_branch: "main", event: "push", status: "completed", conclusion: "success", ...overrides });
const successful = () => ({ workflow_runs: REQUIRED_CI.map((path, i) => run(path, { id: i + 1 })) });
const options = { env, pause: async () => {}, log: () => {}, maxAttempts: 2 };
test("release gate requires both workflows on the exact main commit", () => {
  assert.equal(evaluateCiRuns(successful(), sha).ready, true);
  for (const override of [{ head_sha: "b".repeat(40) }, { head_branch: "other" }, { event: "pull_request" }]) assert.equal(evaluateCiRuns({ workflow_runs: REQUIRED_CI.map(path => run(path, override)) }, sha).ready, false);
});
test("missing workflow or in-progress checks cannot authorize deployment", () => {
  assert.equal(evaluateCiRuns({ workflow_runs: [] }, sha).ready, false);
  assert.equal(evaluateCiRuns({ workflow_runs: [run(REQUIRED_CI[0])] }, sha).ready, false);
  assert.equal(evaluateCiRuns({ workflow_runs: REQUIRED_CI.map(path => run(path, { status: "in_progress", conclusion: null })) }, sha).ready, false);
});
test("failure, skipped, neutral and cancelled workflows are rejected", () => {
  for (const conclusion of ["failure", "skipped", "neutral", "cancelled", "timed_out", null]) assert.equal(evaluateCiRuns({ workflow_runs: REQUIRED_CI.map(path => run(path, { conclusion })) }, sha).failed, true);
});
test("the newest required run supersedes an earlier passing run", () => {
  const payload = successful(); payload.workflow_runs.push(run(REQUIRED_CI[0], { id: 10, conclusion: "failure" }));
  assert.equal(evaluateCiRuns(payload, sha).failed, true);
  payload.workflow_runs[2].status = "queued";
  assert.equal(evaluateCiRuns(payload, sha).ready, false);
});
test("post-deployment verification is not a circular pre-deploy dependency", () => {
  const payload = successful(); payload.workflow_runs.push(run(".github/workflows/production-readonly.yml", { id: 10, status: "in_progress", conclusion: null }));
  assert.equal(evaluateCiRuns(payload, sha).ready, true);
});
test("release gate never calls the network without trusted deployment metadata", async () => {
  let calls = 0; const fetcher = async () => { calls++; return Response.json(successful()); };
  for (const unsafe of [{}, { ...env, RAILWAY_GIT_BRANCH: "preview" }, { ...env, RAILWAY_GIT_COMMIT_SHA: "https://evil.example" }, { ...env, RAILWAY_GIT_REPO_OWNER: "other" }]) await assert.rejects(requireSuccessfulCi({ ...options, env: unsafe, fetcher }));
  assert.equal(calls, 0);
});
test("verification without a token is read-only, fixed-origin and emits only safe metadata", async () => {
  const logs = [];
  const result = await requireSuccessfulCi({ ...options, log: value => logs.push(value), fetcher: async (url, init) => {
    assert.equal(url.origin, "https://api.github.com"); assert.equal(url.pathname, "/repos/nebrasacademy3-lab/maras/actions/runs"); assert.equal(url.searchParams.get("head_sha"), sha);
    assert.equal(init.method, "GET"); assert.equal(init.redirect, "error"); assert.equal(init.credentials, "omit"); assert.equal(init.body, undefined); assert.equal(init.headers.authorization, undefined);
    return Response.json({ ...successful(), privateFixture: "do-not-log-fixture" });
  }});
  assert.equal(result.ready, true); assert.doesNotMatch(logs.join(""), /do-not-log-fixture/);
});
test("pending verification has a bounded retry count", async () => {
  let calls = 0;
  await assert.rejects(requireSuccessfulCi({ ...options, fetcher: async () => { calls++; return Response.json({ workflow_runs: [] }); } }), /verification window/);
  assert.equal(calls, 2);
});
test("unavailable, redirected and rate-limited API responses fail closed", async () => {
  for (const status of [302, 401, 403, 429, 500]) {
    let calls = 0;
    await assert.rejects(requireSuccessfulCi({ ...options, fetcher: async () => { calls++; return new Response("do-not-log-fixture", { status }); } }), /deployment blocked/);
    assert.equal(calls, status === 429 || status === 500 ? 2 : 1);
  }
});
test("network errors do not expose credentials or authorize deployment", async () => {
  await assert.rejects(requireSuccessfulCi({ ...options, fetcher: async () => { throw new Error("do-not-log-fixture"); } }), error => /deployment blocked/.test(error.message) && !/do-not-log-fixture/.test(error.message));
});
test("malformed and oversized CI inventories cannot authorize deployment", async () => {
  assert.throws(() => evaluateCiRuns({}, sha));
  await assert.rejects(requireSuccessfulCi({ ...options, fetcher: async () => new Response("not-json") }), /not valid JSON/);
  await assert.rejects(requireSuccessfulCi({ ...options, fetcher: async () => new Response("x".repeat(2 * 1024 * 1024 + 1)) }), /allowed size/);
});
