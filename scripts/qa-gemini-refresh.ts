/** Real PostgreSQL and file permissions; synthetic Google only. Never live credentials or billing. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { chmod, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
const local = JSON.parse(readFileSync(".data/qa-database.json", "utf8")) as { url: string };
if (process.env.DATABASE_URL !== local.url || new URL(local.url).hostname !== "127.0.0.1" || new URL(local.url).pathname !== "/maras_qa") throw new Error("Dedicated loopback QA database required");
for (const name of ["GEMINI_CONTROL_PLANE_ACCESS_TOKEN", "GEMINI_CONTROL_PLANE_TOKEN_FILE", "GEMINI_API_KEY", "GEMINI_API_KEYS", "GEMINI_FREE_API_KEY", "GEMINI_FREE_API_KEYS", "GEMINI_PAID_API_KEY", "GEMINI_PAID_API_KEYS", "GOOGLE_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "RAILWAY_PROJECT_ID", "RAILWAY_ENVIRONMENT_ID", "S3_BUCKET", "BUCKET", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "TAP_SECRET_KEY", "RESEND_API_KEY", "OPENAI_API_KEY"]) if (process.env[name]) throw new Error("Live configuration prohibited");
process.env.AI_KEYS_ENCRYPTION_KEY ||= randomBytes(32).toString("hex");
const [{ getDb, closeDb }, keys, admission, verification, state, worker] = await Promise.all([import("../db"), import("../lib/ai-keys"), import("../lib/gemini-project-admission"), import("../lib/gemini-project-verification"), import("../lib/gemini-refresh-state"), import("../lib/gemini-project-refresh")]);
const db = getDb(), originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Live transport prohibited"); };
if (process.argv.includes("--synthetic-crash-claim")) {
  const claim = await state.claimGeminiProjectRefresh();
  assert.ok(claim); process.send?.(claim, () => process.exit(83));
} else {
  const number = "9" + String(Date.now()) + randomBytes(2).readUInt16BE().toString().padStart(5, "0");
  const projectId = "maras-renew-qa-" + randomBytes(4).toString("hex"), raw = "AIza_SYNTHETIC_RENEW_" + randomUUID().replaceAll("-", "");
  const fingerprint = keys.aiKeyFingerprint(raw), model = "gemini-renew-qa-model";
  const plan = { projectNumber: number, projectId, keys: [{ resource: `projects/${number}/locations/global/keys/qa-renew`, fingerprint }], models: [{ model, rpm: 20, tpm: 20000, rpd: 100, concurrent: 2, inputTokens: 1000, outputTokens: 256 }] };
  const directory = await mkdtemp(join(tmpdir(), "maras-renew-qa-")), tokenFile = join(directory, "token.json");
  await chmod(directory, 0o700);
  const checks: string[] = [], calls: Array<{ url: string; token: string }> = [];
  let token = "synthetic-initial-token", denied = false, hook: (() => Promise<void>) | null = null;
  const pass = (name: string) => { checks.push(name); console.info("PASS GEMINI RENEWAL", name); };
  async function rotate(next: string, remaining = 600000) {
    token = next;
    const replacement = join(directory, randomUUID() + ".json");
    await writeFile(replacement, JSON.stringify({ accessToken: next, expiresAt: new Date(Date.now() + remaining).toISOString() }), { mode: 0o600 });
    await rename(replacement, tokenFile);
  }
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url));
    assert.equal(init?.method, "GET"); assert.equal(init?.redirect, "error"); assert.equal(target.search, "");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer " + token);
    calls.push({ url: target.href, token });
    if (hook) { const once = hook; hook = null; await once(); }
    init?.signal?.throwIfAborted();
    if (denied) return Response.json({ error: token + raw }, { status: 403 });
    if (target.href === `https://cloudresourcemanager.googleapis.com/v3/projects/${number}`) return Response.json({ name: `projects/${number}`, projectId, state: "ACTIVE" });
    if (target.href === `https://apikeys.googleapis.com/v2/${plan.keys[0].resource}/keyString`) return Response.json({ keyString: raw });
    if (target.href === `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`) return Response.json({ name: `projects/${projectId}/billingInfo`, projectId, billingEnabled: false, billingAccountName: "" });
    throw new Error("Unexpected endpoint; no generation or external transport allowed");
  };
  const refresh = () => verification.refreshGeminiProject(plan, token);
  const enable = async () => { const proof = await refresh(); await state.registerGeminiProjectRefresh(plan, proof.revision); return proof; };
  const due = () => db.execute(sql`UPDATE gemini_project_refresh SET next_attempt_at = clock_timestamp() - interval '1 second' WHERE project_number = ${number}`);
  const row = async () => (await db.execute(sql`SELECT *, valid_until > clock_timestamp() AS fresh FROM gemini_projects WHERE project_number = ${number}`)).rows[0];
  const schedule = async () => (await db.execute(sql`SELECT * FROM gemini_project_refresh WHERE project_number = ${number}`)).rows[0];
  async function crashClaim() {
    const child = spawn(process.execPath, ["--import", "./scripts/ai-worker-runtime.mjs", "--require", "./scripts/tsx-runtime-bootstrap.cjs", "--import", "tsx", fileURLToPath(import.meta.url), "--synthetic-crash-claim"], { env: process.env, stdio: ["ignore", "ignore", "pipe", "ipc"] });
    let claim: Awaited<ReturnType<typeof state.claimGeminiProjectRefresh>> = null;
    child.on("message", value => { claim = value as typeof claim; });
    child.stderr?.resume();
    const timer = setTimeout(() => child.kill("SIGKILL"), 15000);
    try { assert.equal(await new Promise((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); }), 83); assert.ok(claim); return claim as NonNullable<Awaited<ReturnType<typeof state.claimGeminiProjectRefresh>>>; }
    finally { clearTimeout(timer); }
  }
  try {
    await rotate(token);
    await db.execute(sql`INSERT INTO ai_api_keys(label, project_label, encrypted_key, fingerprint) VALUES ('synthetic-renewal-qa', 'untrusted', ${keys.encryptAiApiKey(raw)}, ${fingerprint})`);
    const proof = await refresh();
    assert.equal(await state.claimGeminiProjectRefresh(), null);
    await assert.rejects(state.registerGeminiProjectRefresh(plan, randomUUID()), /GEMINI_REFRESH_PROOF_CHANGED/);
    await assert.rejects(state.registerGeminiProjectRefresh({ ...plan, models: [{ ...plan.models[0], rpm: 19 }] }, proof.revision), /GEMINI_REFRESH_PROOF_CHANGED/);
    assert.equal((await db.execute(sql`SELECT count(*)::int AS n FROM gemini_project_refresh WHERE project_number = ${number}`)).rows[0].n, 0);
    pass("proof alone does not schedule work; registration rejects stale revisions and different plans");

    await state.registerGeminiProjectRefresh(plan, proof.revision);
    const persisted = JSON.stringify(await schedule());
    for (const secret of [raw, token]) assert.equal(persisted.includes(secret), false);
    assert.equal(await state.claimGeminiProjectRefresh(), null);
    pass("operator-approved plan is centrally stored without credentials and is not immediately rechecked");

    await due(); calls.length = 0;
    const competing = await Promise.all(Array.from({ length: 12 }, () => worker.runGeminiProjectRefreshOnce(tokenFile)));
    assert.equal(competing.filter(result => result.worked).length, 1);
    assert.equal(competing.find(result => result.worked)?.state, "verified"); assert.equal(calls.length, 3);
    assert.equal((await schedule()).lease_id, null); assert.equal((await row()).fresh, true);
    pass("twelve simultaneous workers produce exactly one leased read-only verification");

    const reservation = await admission.reserveGeminiProject(raw, model, 128);
    await admission.settleGeminiProject(reservation, true);
    await db.execute(sql`UPDATE gemini_project_limits SET backoff_until = clock_timestamp() + interval '1 minute' WHERE project_number = ${number}`);
    const previous = await row(); await rotate("synthetic-rotated-token"); await due(); calls.length = 0;
    assert.equal((await worker.runGeminiProjectRefreshOnce(tokenFile)).state, "verified");
    assert.ok(calls.every(call => call.token === "synthetic-rotated-token")); assert.notEqual((await row()).revision, previous.revision);
    assert.equal((await db.execute(sql`SELECT count(*)::int AS n FROM gemini_project_reservations WHERE project_number = ${number}`)).rows[0].n, 1);
    assert.equal((await db.execute(sql`SELECT backoff_until > clock_timestamp() AS preserved FROM gemini_project_limits WHERE project_number = ${number}`)).rows[0].preserved, true);
    pass("atomic token rotation renews proof without resetting provider usage or shared backoff");

    await due(); denied = true; calls.length = 0;
    assert.equal((await worker.runGeminiProjectRefreshOnce(tokenFile)).state, "failed");
    assert.equal((await row()).fresh, false); assert.equal((await schedule()).last_error, "VERIFICATION_FAILED");
    assert.equal((await worker.runGeminiProjectRefreshOnce(tokenFile)).state, "idle"); assert.equal(calls.length, 1);
    for (const secret of [token, raw]) assert.equal(JSON.stringify(await schedule()).includes(secret), false);
    pass("Google denial expires old proof, records only a safe code and shares the retry delay");

    denied = false; await due(); await rotate("synthetic-expired-token", -1000); calls.length = 0;
    assert.equal((await worker.runGeminiProjectRefreshOnce(tokenFile)).state, "failed"); assert.equal(calls.length, 0);
    assert.equal((await schedule()).last_error, "TOKEN_UNAVAILABLE"); assert.equal((await row()).fresh, false);
    await rotate("synthetic-recovered-token"); await due();
    assert.equal((await worker.runGeminiProjectRefreshOnce(tokenFile)).state, "verified"); assert.equal((await schedule()).failures, 0);
    pass("expired credentials never reach Google and a rotated valid credential recovers without a restart");

    await due(); hook = () => state.disableGeminiProjectRefresh(number).then(() => undefined);
    assert.equal((await worker.runGeminiProjectRefreshOnce(tokenFile)).state, "superseded");
    assert.equal((await row()).fresh, false); assert.equal((await schedule()).enabled, false); assert.equal((await schedule()).state, "disabled");
    assert.equal(await state.claimGeminiProjectRefresh(), null);
    pass("disable during a live verification invalidates the proof and fences the old worker's publication");

    await enable(); await due(); const dead = await crashClaim();
    assert.equal(await state.claimGeminiProjectRefresh(), null);
    await db.execute(sql`UPDATE gemini_project_refresh SET lease_until = clock_timestamp() - interval '1 second' WHERE project_number = ${number}`);
    const successor = await state.claimGeminiProjectRefresh(); assert.ok(successor); assert.notEqual(successor.leaseId, dead.leaseId);
    await verification.refreshGeminiProject(plan, token, { fence: successor });
    const currentRevision = (await row()).revision;
    await assert.rejects(verification.refreshGeminiProject(plan, token, { fence: dead }), /AI_PROJECT_VERIFICATION_FAILED/);
    assert.equal(await state.finishGeminiProjectRefresh(dead, "VERIFICATION_FAILED"), false);
    assert.equal((await row()).revision, currentRevision); assert.equal((await row()).fresh, true);
    assert.equal((await schedule()).lease_id, successor.leaseId);
    assert.equal(await state.finishGeminiProjectRefresh(successor), true);
    pass("an actual child-process crash retains the lease; expiry recovers without stale proof writes or releases");

    await due(); const replaced = await state.claimGeminiProjectRefresh(); assert.ok(replaced);
    plan.models[0].rpm = 18; const changedProof = await enable();
    await assert.rejects(verification.refreshGeminiProject(plan, token, { fence: replaced }), /AI_PROJECT_VERIFICATION_FAILED/);
    assert.equal(await state.finishGeminiProjectRefresh(replaced, "VERIFICATION_FAILED"), false);
    assert.equal((await row()).revision, changedProof.revision); assert.equal((await row()).fresh, true);
    pass("registering a new plan revokes old claim ownership without letting its failure expire the new proof");

    await due(); const older = await state.claimGeminiProjectRefresh(); assert.ok(older);
    const manual = await refresh();
    assert.equal(await state.finishGeminiProjectRefresh(older, "TOKEN_UNAVAILABLE"), true);
    assert.equal((await row()).revision, manual.revision); assert.equal((await row()).fresh, true);
    pass("an older failed renewal cannot invalidate a newer independent operator verification");

    await due(); await db.execute(sql`UPDATE gemini_project_refresh SET plan_digest = ${"0".repeat(64)} WHERE project_number = ${number}`); calls.length = 0;
    assert.equal((await worker.runGeminiProjectRefreshOnce(tokenFile)).state, "failed"); assert.equal(calls.length, 0);
    assert.equal((await schedule()).last_error, "PLAN_INVALID"); assert.equal((await row()).fresh, false);
    pass("a damaged persisted plan is rejected before transport instead of silently increasing limits");

    await enable(); await due(); await db.execute(sql`UPDATE ai_api_keys SET status = 'disabled' WHERE fingerprint = ${fingerprint}`);
    assert.equal((await worker.runGeminiProjectRefreshOnce(tokenFile)).state, "failed"); assert.equal((await row()).fresh, false);
    assert.equal((await db.execute(sql`SELECT status FROM ai_api_keys WHERE fingerprint = ${fingerprint}`)).rows[0].status, "disabled");
    await db.execute(sql`UPDATE ai_api_keys SET status = 'active' WHERE fingerprint = ${fingerprint}`);
    pass("renewal cannot reactivate an administratively disabled API key");

    await enable(); await due(); const stop = new AbortController(); hook = async () => { stop.abort(new Error("synthetic-secret-must-not-be-logged")); };
    assert.equal((await worker.runGeminiProjectRefreshOnce(tokenFile, stop.signal)).state, "failed"); assert.equal((await row()).fresh, false);
    assert.equal(JSON.stringify(await schedule()).includes("synthetic-secret"), false);
    await assert.rejects(worker.runGeminiProjectRefreshOnce(tokenFile, AbortSignal.abort()));
    pass("shutdown cancellation prevents publication and never persists raw abort reasons");

    const summary = await state.geminiRefreshSummary();
    assert.deepEqual(Object.keys(summary).sort(), ["projects", "verified", "expired", "expiring", "scheduled", "checking", "failed", "overdue"].sort());
    assert.ok(Object.values(summary).every(value => Number.isSafeInteger(value) && value >= 0));
    assert.equal(JSON.stringify(summary).includes(number), false); assert.equal(JSON.stringify(summary).includes(fingerprint), false);
    pass("operational reporting exposes aggregate states rather than keys, tokens or project configuration");

    await enable();
    async function actualWorker(expired: boolean) {
      await rotate(expired ? "synthetic-expired-worker" : "synthetic-idle-worker", expired ? -1000 : 600000);
      const noNetwork = "data:text/javascript," + encodeURIComponent('globalThis.fetch = async () => { throw new Error("Synthetic worker forbids external transport"); };');
      const child = spawn(process.execPath, ["--import", noNetwork, "--import", "./scripts/ai-worker-runtime.mjs", "--require", "./scripts/tsx-runtime-bootstrap.cjs", "--import", "tsx", "scripts/gemini-project-refresh-worker.ts", "--once"], {
        env: { ...process.env, GEMINI_PROJECT_REFRESH_ENABLED: "true", GEMINI_CONTROL_PLANE_TOKEN_FILE: tokenFile }, stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      const capture = (chunk: Buffer) => { output += chunk.toString(); if (output.length > 8192) child.kill("SIGKILL"); };
      child.stdout.on("data", capture); child.stderr.on("data", capture);
      const timer = setTimeout(() => child.kill("SIGKILL"), 15000);
      try {
        const code = await new Promise((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); });
        assert.equal(code, expired ? 78 : 0);
        assert.equal(output.includes(token), false); assert.equal(output.includes(tokenFile), false);
        if (expired) assert.match(output, /configuration-rejected/);
        else assert.doesNotMatch(output, /"event":"gemini\.refresh/);
      } finally { clearTimeout(timer); }
    }
    await actualWorker(false); await actualWorker(true);
    pass("actual worker executable finishes one idle cycle and rejects expired credentials at startup with no secret logging");

    const report = { passed: checks.length, checks, database: "real isolated loopback PostgreSQL", transport: "synthetic read-only Google stub", liveCalls: 0, productionChanged: false };
    writeFileSync(".data/qa-gemini-refresh-report.json", JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  } finally {
    globalThis.fetch = originalFetch;
    await db.execute(sql`DELETE FROM gemini_project_refresh WHERE project_number = ${number}`);
    await db.execute(sql`DELETE FROM gemini_project_reservations WHERE project_number = ${number}`);
    await db.execute(sql`DELETE FROM gemini_project_keys WHERE project_number = ${number}`);
    await db.execute(sql`DELETE FROM gemini_project_limits WHERE project_number = ${number}`);
    await db.execute(sql`DELETE FROM gemini_projects WHERE project_number = ${number}`);
    await db.execute(sql`DELETE FROM ai_api_keys WHERE fingerprint = ${fingerprint}`);
    await rm(directory, { recursive: true, force: true }); await closeDb();
  }
}
