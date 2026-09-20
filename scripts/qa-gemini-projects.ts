/** Real PostgreSQL, synthetic keys and an in-process Google transport. Never live providers. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
const local = JSON.parse(readFileSync(".data/qa-database.json", "utf8")) as { url: string };
if (process.env.DATABASE_URL !== local.url || new URL(local.url).hostname !== "127.0.0.1" || new URL(local.url).pathname !== "/maras_qa") throw Error("Dedicated loopback QA database required");
for (const name of ["GEMINI_CONTROL_PLANE_ACCESS_TOKEN", "GEMINI_API_KEY", "GEMINI_API_KEYS", "GEMINI_PAID_API_KEY", "GEMINI_PAID_API_KEYS", "GOOGLE_API_KEY", "RAILWAY_PROJECT_ID", "S3_BUCKET", "TAP_SECRET_KEY", "RESEND_API_KEY"]) if (process.env[name]) throw Error("Live configuration prohibited");
process.env.AI_KEYS_ENCRYPTION_KEY ||= randomBytes(32).toString("hex");
const [{ getDb, closeDb }, keys, admission, verification, provider, { AiBusyError }] = await Promise.all([import("../db"), import("../lib/ai-keys"), import("../lib/gemini-project-admission"), import("../lib/gemini-project-verification"), import("../lib/gemini-provider"), import("../lib/ai-work-control")]);
const db = getDb();
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error("Live transport prohibited"); };
const crashKey = process.env.QA_GEMINI_CRASH_KEY;
if (crashKey) {
  if (!crashKey.startsWith("AIza_SYNTHETIC_QA_")) throw Error("Synthetic key required");
  const reservation = await admission.reserveGeminiProject(crashKey, "gemini-qa-model", 128);
  process.send?.(reservation, () => process.exit(83));
} else {
  const number = "9" + String(Date.now()) + String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  const model = "gemini-qa-model", projectId = "maras-qa-" + randomBytes(5).toString("hex");
  const raw = [0, 1].map(i => "AIza_SYNTHETIC_QA_" + randomUUID().replaceAll("-", "") + i);
  const fingerprints = raw.map(keys.aiKeyFingerprint);
  const plan = { projectNumber: number, projectId, keys: raw.map((_, i) => ({ resource: `projects/${number}/locations/global/keys/qa-${i}`, fingerprint: fingerprints[i] })), models: [{ model, rpm: 20, tpm: 20000, rpd: 100, concurrent: 2, inputTokens: 1000, outputTokens: 256 }] };
  const generation = { contents: [{ role: "user", parts: [{ text: "SYNTHETIC ONLY" }] }], generationConfig: { maxOutputTokens: 128 } };
  const checks: string[] = [], calls: string[] = [];
  const pass = (name: string) => { checks.push(name); console.info("PASS GEMINI PROJECT", name); };
  let billing: "unlinked" | "linked" | "disabled" = "unlinked", failVerification = false, afterCount: (() => Promise<void>) | null = null, providerStatus = 200;
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url)); calls.push(u.pathname);
    if (u.hostname === "generativelanguage.googleapis.com") {
      assert.equal(init?.redirect, "error");
      if (u.pathname.endsWith(":countTokens")) { if (afterCount) await afterCount(); return Response.json({ totalTokens: 32 }); }
      if (u.pathname.endsWith(":generateContent")) return providerStatus === 200 ? Response.json({ candidates: [{ content: { parts: [{ text: "Synthetic OK" }] }, finishReason: "STOP" }] }) : Response.json({ error: { message: "daily quota exhausted" } }, { status: providerStatus, headers: { "retry-after": "90" } });
      throw Error("Unexpected Google generation endpoint");
    }
    assert.equal(init?.method, "GET"); assert.equal(init?.redirect, "error"); assert.equal(u.search, "");
    if (failVerification) return Response.json({ error: "synthetic denied" }, { status: 403 });
    if (u.hostname === "cloudresourcemanager.googleapis.com") return Response.json({ name: `projects/${number}`, projectId, state: "ACTIVE" });
    if (u.hostname === "apikeys.googleapis.com") { const index = Number(u.pathname.match(/qa-([01])\/keyString$/)?.[1]); assert.ok(index === 0 || index === 1); return Response.json({ keyString: raw[index] }); }
    if (u.hostname === "cloudbilling.googleapis.com") return Response.json({ name: `projects/${projectId}/billingInfo`, projectId, billingEnabled: billing === "linked", billingAccountName: billing === "unlinked" ? "" : "billingAccounts/ABCDEF-123456-ABCDEF" });
    throw Error("Unexpected transport host");
  };
  const refresh = () => verification.refreshGeminiProject(plan, "synthetic-read-only-token");
  const resetUsage = async () => { await db.execute(sql`DELETE FROM gemini_project_reservations WHERE project_number = ${number}`); await db.execute(sql`UPDATE gemini_project_limits SET backoff_until = NULL WHERE project_number = ${number}`); };
  const rejected = (promise: Promise<unknown>, code: string) => assert.rejects(promise, (e: unknown) => !!e && typeof e === "object" && "code" in e && e.code === code);
  async function crash() {
    const child = spawn(process.execPath, ["--import", "./scripts/ai-worker-runtime.mjs", "--require", "./scripts/tsx-runtime-bootstrap.cjs", "--import", "tsx", fileURLToPath(import.meta.url)], { env: { ...process.env, QA_GEMINI_CRASH_KEY: raw[0] }, stdio: ["ignore", "ignore", "pipe", "ipc"] });
    let value: Awaited<ReturnType<typeof admission.reserveGeminiProject>> | null = null, stderr = "";
    child.on("message", r => { value = r as typeof value; }); child.stderr!.on("data", bytes => { stderr += bytes; });
    const timer = setTimeout(() => child.kill("SIGKILL"), 15000);
    try { const exit = await new Promise(resolve => child.once("exit", resolve)); assert.equal(exit, 83, stderr.slice(-1000)); assert.ok(value); return value as Awaited<ReturnType<typeof admission.reserveGeminiProject>>; } finally { clearTimeout(timer); }
  }
  try {
    for (let i = 0; i < raw.length; i++) await db.execute(sql`INSERT INTO ai_api_keys(label, project_label, encrypted_key, fingerprint) VALUES ('synthetic-project-qa', 'free:untrusted-label', ${keys.encryptAiApiKey(raw[i])}, ${fingerprints[i]})`);
    await rejected(provider.requestGemini({ apiKey: raw[0], model, generation }), "AI_PROJECT_UNVERIFIED");
    assert.equal(calls.length, 0); pass("unverified free label sends no external request");

    await refresh();
    const identity = (await admission.geminiProjectIdentities()).get(fingerprints[0]); assert.equal(identity?.projectNumber, number); assert.equal(identity?.tier, "free");
    const proofRows = await db.execute(sql`SELECT * FROM gemini_projects WHERE project_number = ${number}`); const safe = JSON.stringify(proofRows.rows);
    for (const secret of [...raw, "synthetic-read-only-token"]) assert.equal(safe.includes(secret), false);
    pass("verified project/key/billing evidence persists without plaintext credentials");

    calls.length = 0; await provider.requestGemini({ apiKey: raw[0], model, generation });
    assert.equal(calls.filter(c => c.endsWith(":generateContent")).length, 1);
    const completed = await db.execute(sql`SELECT state, input_tokens, window_until > clock_timestamp() AS retained FROM gemini_project_reservations WHERE project_number = ${number}`);
    assert.equal(completed.rows[0].state, "settled"); assert.equal(completed.rows[0].input_tokens, 1000); assert.equal(completed.rows[0].retained, true);
    pass("counting plus generation settles once while retaining conservative token ceiling");

    await resetUsage();
    const parallel = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => admission.reserveGeminiProject(raw[i % 2], model, 128)));
    const accepted = parallel.filter(p => p.status === "fulfilled"); assert.equal(accepted.length, 2);
    for (const item of parallel) if (item.status === "rejected") assert.ok(item.reason instanceof AiBusyError);
    pass("twenty concurrent requests across two keys share exactly two database slots and defer safely");

    await resetUsage(); plan.models[0].concurrent = 1; await refresh();
    const dead = await crash(); await rejected(admission.reserveGeminiProject(raw[1], model, 128), "AI_PROJECT_RATE_LIMITED");
    await db.execute(sql`UPDATE gemini_project_reservations SET active_until = clock_timestamp() - interval '1 second' WHERE id = ${dead.id}`);
    const replacement = await admission.reserveGeminiProject(raw[1], model, 128);
    await rejected(admission.dispatchGeminiProject(dead, 32), "AI_PROJECT_LEASE_EXPIRED");
    await admission.settleGeminiProject(dead, true);
    assert.equal((await db.execute(sql`SELECT state FROM gemini_project_reservations WHERE id = ${replacement.id}`)).rows[0].state, "counting");
    pass("abrupt child-process exit retains slot; expiry recovers and late completion cannot affect a new lease");

    await resetUsage(); plan.models[0].concurrent = 2; plan.models[0].rpm = 2; await refresh();
    for (const key of raw) { const r = await admission.reserveGeminiProject(key, model, 128); await admission.dispatchGeminiProject(r, 32); await admission.settleGeminiProject(r, true); }
    await rejected(admission.reserveGeminiProject(raw[0], model, 128), "AI_PROJECT_RATE_LIMITED");
    pass("shared RPM remains consumed after successful responses across different keys");

    await resetUsage(); plan.models[0].rpm = 20; plan.models[0].tpm = 1500; await refresh();
    await admission.reserveGeminiProject(raw[0], model, 128);
    await rejected(admission.reserveGeminiProject(raw[1], model, 128), "AI_PROJECT_RATE_LIMITED");
    pass("shared TPM reserves the input ceiling before countTokens instead of racing with the other key");

    await resetUsage(); plan.models[0].tpm = 20000; plan.models[0].rpd = 1; await refresh();
    const daily = await admission.reserveGeminiProject(raw[0], model, 128); await admission.settleGeminiProject(daily, true);
    await db.execute(sql`UPDATE gemini_project_reservations SET window_until = clock_timestamp() - interval '1 second' WHERE id = ${daily.id}`);
    await rejected(admission.reserveGeminiProject(raw[1], model, 128), "AI_PROJECT_RATE_LIMITED");
    const day = await db.execute(sql`SELECT quota_day = to_char(clock_timestamp() AT TIME ZONE 'America/Los_Angeles','YYYY-MM-DD') AS correct FROM gemini_project_reservations WHERE id = ${daily.id}`); assert.equal(day.rows[0].correct, true);
    pass("daily budget uses Pacific date and survives expiry of the minute window");

    await resetUsage(); plan.models[0].rpd = 100; await refresh();
    const revision = await admission.reserveGeminiProject(raw[0], model, 128); await refresh();
    await rejected(admission.dispatchGeminiProject(revision, 32), "AI_PROJECT_PROOF_CHANGED");
    assert.equal((await db.execute(sql`SELECT count(*)::int AS n FROM gemini_project_reservations WHERE project_number = ${number}`)).rows[0].n, 1);
    pass("refresh does not reset usage and fences a pre-refresh counting request");

    await resetUsage(); const tokenBound = await admission.reserveGeminiProject(raw[0], model, 128);
    for (const count of [undefined, -1, NaN, 1001, 1.5, "32"]) await rejected(admission.dispatchGeminiProject(tokenBound, count), "AI_PROJECT_INPUT_LIMIT");
    await rejected(admission.reserveGeminiProject(raw[0], model, 257), "AI_PROJECT_OUTPUT_LIMIT");
    await admission.dispatchGeminiProject(tokenBound, 32); await rejected(admission.dispatchGeminiProject(tokenBound, 32), "AI_PROJECT_LEASE_EXPIRED");
    pass("token bounds and one-shot dispatch reject malformed or replayed preflight responses");

    await resetUsage(); afterCount = async () => { await db.execute(sql`UPDATE ai_api_keys SET status = 'disabled' WHERE fingerprint = ${fingerprints[0]}`); };
    calls.length = 0; await rejected(provider.requestGemini({ apiKey: raw[0], model, generation }), "AI_PROJECT_KEY_NOT_ACTIVE"); assert.equal(calls.length, 1); afterCount = null;
    await db.execute(sql`UPDATE ai_api_keys SET status = 'active' WHERE fingerprint = ${fingerprints[0]}`);
    pass("disabling a key during counting blocks the actual generation request");

    await resetUsage(); providerStatus = 429; calls.length = 0;
    await rejected(provider.requestGemini({ apiKey: raw[0], model, generation }), "AI_QUOTA_EXHAUSTED"); providerStatus = 200;
    const called = calls.length; await rejected(provider.requestGemini({ apiKey: raw[1], model, generation }), "AI_PROJECT_RATE_LIMITED"); assert.equal(calls.length, called);
    await refresh(); await rejected(admission.reserveGeminiProject(raw[1], model, 128), "AI_PROJECT_RATE_LIMITED");
    pass("429 backoff is shared across keys and cannot be erased by refreshing project proof");

    for (const state of ["linked", "disabled"] as const) {
      await resetUsage(); billing = state; await refresh(); calls.length = 0;
      await rejected(provider.requestGemini({ apiKey: raw[0], model, generation }), state === "linked" ? "AI_PAID_PRICING_UNVERIFIED" : "AI_PROJECT_UNVERIFIED"); assert.equal(calls.length, 0);
    }
    assert.throws(admission.requireGeminiPaidPricing, e => !!e && typeof e === "object" && "code" in e && e.code === "AI_PAID_PRICING_UNVERIFIED");
    pass("paid and closed-account projects cannot generate or consume a flat estimated paid budget");

    billing = "unlinked"; await refresh();
    await db.execute(sql`UPDATE gemini_projects SET valid_until = clock_timestamp() - interval '1 second' WHERE project_number = ${number}`);
    calls.length = 0; await rejected(provider.requestGemini({ apiKey: raw[0], model, generation }), "AI_PROJECT_UNVERIFIED"); assert.equal(calls.length, 0);
    await refresh(); failVerification = true; await assert.rejects(refresh(), /AI_PROJECT_VERIFICATION_FAILED/); failVerification = false;
    assert.equal((await admission.geminiProjectIdentities()).has(fingerprints[0]), false);
    pass("expired or failed verification closes generation instead of reusing stale billing proof");

    await refresh(); const before = (await db.execute(sql`SELECT revision FROM gemini_projects WHERE project_number = ${number}`)).rows[0].revision;
    plan.keys[0].fingerprint = "a".repeat(64); await assert.rejects(refresh(), /AI_PROJECT_VERIFICATION_FAILED/); plan.keys[0].fingerprint = fingerprints[0];
    assert.equal((await db.execute(sql`SELECT revision FROM gemini_projects WHERE project_number = ${number}`)).rows[0].revision, before);
    assert.equal((await db.execute(sql`SELECT fingerprint FROM gemini_project_keys WHERE resource_name = ${plan.keys[0].resource}`)).rows[0].fingerprint, fingerprints[0]);
    pass("mismatched key evidence cannot overwrite an existing project binding");
    writeFileSync(".data/qa-gemini-projects-report.json", JSON.stringify({ ok: true, checks, liveProviders: false, database: "isolated PostgreSQL", controlPlane: "synthetic fixed-host transport", generation: "synthetic", paidGenerationEnabled: false }, null, 2));
  } finally {
    globalThis.fetch = originalFetch;
    await db.execute(sql`DELETE FROM gemini_project_reservations WHERE project_number = ${number}`);
    await db.execute(sql`DELETE FROM gemini_project_keys WHERE project_number = ${number}`);
    await db.execute(sql`DELETE FROM gemini_project_limits WHERE project_number = ${number}`);
    await db.execute(sql`DELETE FROM gemini_projects WHERE project_number = ${number}`);
    for (const fingerprint of fingerprints) await db.execute(sql`DELETE FROM ai_api_keys WHERE fingerprint = ${fingerprint}`);
    await closeDb();
  }
}
