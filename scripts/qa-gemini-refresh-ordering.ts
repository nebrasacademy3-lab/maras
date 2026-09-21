/** Deterministic real-PostgreSQL regression for equal timestamps and stale verifiers. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
const local = JSON.parse(readFileSync(".data/qa-database.json", "utf8")) as { url: string };
if (process.env.DATABASE_URL !== local.url || new URL(local.url).hostname !== "127.0.0.1" || new URL(local.url).pathname !== "/maras_qa") throw new Error("Dedicated loopback QA database required");
for (const name of ["GEMINI_CONTROL_PLANE_ACCESS_TOKEN", "GEMINI_CONTROL_PLANE_TOKEN_FILE", "GEMINI_API_KEY", "GEMINI_API_KEYS", "GEMINI_FREE_API_KEYS", "GEMINI_PAID_API_KEYS", "GOOGLE_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "RAILWAY_PROJECT_ID", "RAILWAY_ENVIRONMENT_ID", "S3_BUCKET", "BUCKET", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "TAP_SECRET_KEY", "RESEND_API_KEY", "OPENAI_API_KEY"]) if (process.env[name]) throw new Error("Live configuration prohibited");
process.env.AI_KEYS_ENCRYPTION_KEY ||= randomBytes(32).toString("hex");
const [{ getDb, closeDb }, keys, verification, state] = await Promise.all([import("../db"), import("../lib/ai-keys"), import("../lib/gemini-project-verification"), import("../lib/gemini-refresh-state")]);
const db = getDb(), originalFetch = globalThis.fetch;
const number = "9" + String(Date.now()) + randomBytes(2).readUInt16BE().toString().padStart(5, "0");
const projectId = "maras-order-qa-" + randomBytes(4).toString("hex");
const raw = "AIza_SYNTHETIC_ORDER_" + randomUUID().replaceAll("-", ""), token = "synthetic-ordering-token";
const fingerprint = keys.aiKeyFingerprint(raw);
const plan = { projectNumber: number, projectId, keys: [{ resource: `projects/${number}/locations/global/keys/qa-order`, fingerprint }], models: [{ model: "gemini-order-qa-model", rpm: 20, tpm: 20000, rpd: 100, concurrent: 2, inputTokens: 1000, outputTokens: 256 }] };
const checks: string[] = [];
let beforeFailure: (() => Promise<void>) | null = null;
globalThis.fetch = async (url, init) => {
  assert.equal(init?.method, "GET"); assert.equal(init?.redirect, "error");
  assert.equal(new Headers(init?.headers).get("authorization"), "Bearer " + token);
  if (beforeFailure) { const hook = beforeFailure; beforeFailure = null; await hook(); return new Response("synthetic failure", { status: 503 }); }
  const target = String(url);
  if (target === `https://cloudresourcemanager.googleapis.com/v3/projects/${number}`) return Response.json({ name: `projects/${number}`, projectId, state: "ACTIVE" });
  if (target === `https://apikeys.googleapis.com/v2/${plan.keys[0].resource}/keyString`) return Response.json({ keyString: raw });
  if (target === `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`) return Response.json({ name: `projects/${projectId}/billingInfo`, projectId, billingEnabled: false, billingAccountName: "" });
  throw new Error("External transport prohibited");
};
const pass = (name: string) => { checks.push(name); console.log("PASS GEMINI ORDERING", name); };
const row = async () => (await db.execute(sql`SELECT revision, valid_until > clock_timestamp() AS fresh FROM gemini_projects WHERE project_number = ${number}`)).rows[0];
const refresh = () => verification.refreshGeminiProject(plan, token);
async function claim() {
  const proof = await refresh(); await state.registerGeminiProjectRefresh(plan, proof.revision);
  await db.execute(sql`UPDATE gemini_project_refresh SET next_attempt_at = clock_timestamp() - interval '1 second' WHERE project_number = ${number}`);
  const value = await state.claimGeminiProjectRefresh(); assert.ok(value); assert.equal(value.projectNumber, number); assert.equal(value.proofRevision, proof.revision); return value;
}
async function moveProofClock(seconds: number) {
  await db.execute(sql`UPDATE gemini_projects SET verified_at = clock_timestamp() - ${seconds} * interval '1 second', valid_until = clock_timestamp() + interval '5 minutes' WHERE project_number = ${number}`);
}
try {
  await db.execute(sql`INSERT INTO ai_api_keys(label, project_label, encrypted_key, fingerprint) VALUES ('synthetic-ordering-qa', 'untrusted', ${keys.encryptAiApiKey(raw)}, ${fingerprint})`);
  for (const offset of [0, 5]) {
    const older = await claim(); const manual = await refresh();
    if (offset === 0) await db.execute(sql`UPDATE gemini_projects p SET verified_at = r.last_attempt_at, valid_until = r.last_attempt_at + interval '5 minutes' FROM gemini_project_refresh r WHERE p.project_number = ${number} AND r.project_number = p.project_number`);
    else await moveProofClock(offset);
    assert.equal(await state.finishGeminiProjectRefresh(older, "TOKEN_UNAVAILABLE"), true);
    assert.equal((await row()).revision, manual.revision); assert.equal((await row()).fresh, true);
  }
  pass("an old failed lease preserves a newer revision even with equal timestamps or a backwards proof clock");
  const current = await claim();
  assert.equal(await state.finishGeminiProjectRefresh(current, "TOKEN_UNAVAILABLE"), true);
  assert.equal((await row()).fresh, false);
  pass("failure still expires the exact claimed proof rather than leaving failed evidence valid");
  for (const fenced of [false, true]) {
    const older = await claim(); let newerRevision = "";
    beforeFailure = async () => { newerRevision = (await refresh()).revision; await moveProofClock(5); };
    await assert.rejects(verification.refreshGeminiProject(plan, token, fenced ? { fence: older } : {}), /AI_PROJECT_VERIFICATION_FAILED/);
    assert.equal((await row()).revision, newerRevision); assert.equal((await row()).fresh, true);
    assert.equal(await state.finishGeminiProjectRefresh(older, "VERIFICATION_FAILED"), true);
    assert.equal((await row()).revision, newerRevision); assert.equal((await row()).fresh, true);
  }
  pass("late provider failure from both manual and leased verification cannot revoke a newer independent success");
  const stale = await claim(), newer = await refresh();
  await assert.rejects(verification.refreshGeminiProject(plan, token, { fence: stale }), /AI_PROJECT_VERIFICATION_FAILED/);
  assert.equal((await row()).revision, newer.revision); assert.equal((await row()).fresh, true);
  assert.equal(await state.finishGeminiProjectRefresh(stale, "VERIFICATION_FAILED"), true);
  pass("a verifier with an outdated proof snapshot cannot overwrite or expire its successor");
  const disabled = await claim(); await state.disableGeminiProjectRefresh(number);
  assert.equal(await state.finishGeminiProjectRefresh(disabled, "TOKEN_UNAVAILABLE"), false);
  assert.equal((await row()).fresh, false);
  pass("administrative disable still wins over every in-flight lease");
  writeFileSync(".data/qa-gemini-refresh-ordering-report.json", JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  await db.execute(sql`DELETE FROM gemini_project_refresh WHERE project_number = ${number}`);
  await db.execute(sql`DELETE FROM gemini_project_keys WHERE project_number = ${number}`);
  await db.execute(sql`DELETE FROM gemini_project_limits WHERE project_number = ${number}`);
  await db.execute(sql`DELETE FROM gemini_projects WHERE project_number = ${number}`);
  await db.execute(sql`DELETE FROM ai_api_keys WHERE fingerprint = ${fingerprint}`);
  await closeDb();
}
