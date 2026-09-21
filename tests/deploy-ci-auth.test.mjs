import assert from "node:assert/strict";
import test from "node:test";
import { requireSuccessfulCi, REQUIRED_CI } from "../scripts/deploy-ci-gate.mjs";
const sha = "a".repeat(40);
const env = { RAILWAY_GIT_COMMIT_SHA: sha, RAILWAY_GIT_BRANCH: "main", RAILWAY_GIT_REPO_OWNER: "nebrasacademy3-lab", RAILWAY_GIT_REPO_NAME: "maras" };
const successful = () => ({ workflow_runs: REQUIRED_CI.map((path, i) => ({ id: i + 1, path, head_sha: sha, head_branch: "main", event: "push", status: "completed", conclusion: "success" })) });
const options = { env, pause: async () => {}, log: () => {}, maxAttempts: 2 };
// Preserve the readiness branch's authentication coverage alongside main's retry tests.
test("private repository token is sent only to the fixed HTTPS origin and never logged", async () => {
  const token = "synthetic-actions-read-token", logs = [];
  const result = await requireSuccessfulCi({ ...options, env: { ...env, DEPLOY_GITHUB_TOKEN: token }, log: value => logs.push(value), fetcher: async (url, init) => {
    assert.equal(url.origin, "https://api.github.com");
    assert.equal(init.headers.authorization, `Bearer ${token}`);
    assert.equal(init.redirect, "error");
    return Response.json(successful());
  }});
  assert.equal(result.ready, true);
  assert.ok(!logs.join("").includes(token));
});
test("private repository access failure explains configuration without exposing secrets", async () => {
  for (const status of [401, 404]) {
    await assert.rejects(requireSuccessfulCi({ ...options, env: { ...env, DEPLOY_GITHUB_TOKEN: "synthetic-secret" }, fetcher: async () => new Response("synthetic-secret", { status }) }), error => /DEPLOY_GITHUB_TOKEN.*Actions:read/.test(error.message) && !error.message.includes("synthetic-secret"));
  }
});
test("malformed token is rejected before any network request", async () => {
  let calls = 0;
  await assert.rejects(requireSuccessfulCi({ ...options, env: { ...env, DEPLOY_GITHUB_TOKEN: "bad\r\ntoken" }, fetcher: async () => { calls++; return Response.json(successful()); } }), /invalid format/);
  assert.equal(calls, 0);
});
