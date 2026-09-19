import assert from "node:assert/strict";
import test from "node:test";
import * as crypto from "node:crypto";
import { nativeSource } from "./helpers/native-source.mjs";
class AiPlatformError extends Error { constructor(code, message, status = 400) { super(message); Object.assign(this, { code, status }); } }
const c = Object.fromEntries(Object.entries(crypto).filter(([k]) => k !== "default"));
const policy = await nativeSource("lib/gemini-project-policy.ts");
const keys = await nativeSource("lib/ai-keys.ts", { ...c, AiPlatformError, process: { env: {} } });
const config = await nativeSource("lib/gemini-config.ts");
const errors = await nativeSource("lib/gemini-errors.ts", { AiPlatformError });
const raw = "AIza_SYNTHETIC_PROJECT_TEST_KEY_123456789";
const plan = { projectNumber: "123456789", projectId: "maras-qa-project", keys: [{ resource: "projects/123456789/locations/global/keys/synthetic", fingerprint: keys.aiKeyFingerprint(raw) }], models: [{ model: "gemini-test-flash", rpm: 10, tpm: 10000, rpd: 50, concurrent: 2, inputTokens: 1000, outputTokens: 256 }] };
const generation = { contents: [{ role: "user", parts: [{ text: "synthetic" }] }], generationConfig: { maxOutputTokens: 256 } };
const answer = { candidates: [{ content: { parts: [{ text: "OK" }] }, finishReason: "STOP" }] };
async function verifier(respond) {
  return nativeSource("lib/gemini-project-verification.ts", { ...keys, ...policy, ...c, fetch: respond });
}
function controlResponse(url, billing = { billingEnabled: false, billingAccountName: "" }) {
  const u = String(url);
  if (u.includes("cloudresourcemanager")) return { name: "projects/123456789", projectId: plan.projectId, state: "ACTIVE" };
  if (u.includes("apikeys.googleapis")) return { keyString: raw };
  return { name: "projects/maras-qa-project/billingInfo", projectId: plan.projectId, ...billing };
}
test("project plans reject traversal, mismatched project resource, duplicate keys/models and unsafe ceilings", () => {
  assert.deepEqual(policy.parseGeminiProjectPlan(plan), plan);
  for (const changed of [null, { ...plan, free: true }, { ...plan, projectNumber: "../123" }, { ...plan, keys: [{ ...plan.keys[0], resource: "projects/999999/locations/global/keys/synthetic" }] }, { ...plan, keys: [...plan.keys, ...plan.keys] }, { ...plan, models: [...plan.models, ...plan.models] }, ...[NaN, Infinity, -1, 0, 2.1, "1", 1e9].map(rpm => ({ ...plan, models: [{ ...plan.models[0], rpm }] }))]) assert.throws(() => policy.parseGeminiProjectPlan(changed), /AI_PROJECT_PLAN_INVALID/);
});
test("read-only identity, key fingerprint and billing evidence use fixed hosts and no query credential", async () => {
  const calls = []; const token = "synthetic-operator-token";
  const v = await verifier(async (url, init) => { calls.push({ url, init }); return Response.json(controlResponse(url)); });
  const proof = await v.verifyGoogleProject(plan, token);
  assert.equal(proof.billingState, "unlinked"); assert.equal(calls.length, 3); assert.match(proof.evidenceDigest, /^[a-f0-9]{64}$/);
  for (const { url, init } of calls) { assert.equal(new URL(url).search, ""); assert.equal(init.method, "GET"); assert.equal(init.redirect, "error"); assert.equal(init.headers.authorization, "Bearer " + token); assert.equal(String(url).includes(raw), false); }
  assert.equal(JSON.stringify(proof).includes(raw), false); assert.equal(JSON.stringify(proof).includes(token), false);
});
test("closed billing accounts are disabled, not free; linked active accounts are paid", async () => {
  for (const [enabled, state] of [[false, "disabled"], [true, "linked"]]) {
    const v = await verifier(async url => Response.json(controlResponse(url, { billingEnabled: enabled, billingAccountName: "billingAccounts/ABCDEF-123456-ABCDEF" })));
    assert.equal((await v.verifyGoogleProject(plan, "synthetic-token")).billingState, state);
  }
});
test("mismatched identity/key/billing and malformed or excessive control responses fail without secret errors", async () => {
  for (const target of ["project", "key", "billing", "missing", "oversized", "denied", "redirect"]) {
    const v = await verifier(async url => {
      if (target === "denied") return Response.json({ error: raw }, { status: 403 });
      if (target === "oversized") return new Response("x".repeat(65537));
      if (target === "redirect") throw Error(raw);
      const r = controlResponse(url);
      if (target === "project" && r.state) r.projectId = "other-project";
      if (target === "key" && r.keyString) r.keyString += "mismatch";
      if (target === "billing" && "billingEnabled" in r) r.projectId = "other-project";
      if (target === "missing" && "billingEnabled" in r) delete r.billingEnabled;
      return Response.json(r);
    });
    await assert.rejects(v.verifyGoogleProject(plan, "synthetic-token"), error => error.message === "AI_PROJECT_VERIFICATION_FAILED" && !error.message.includes(raw));
  }
});
async function boundary({ reserve, dispatch, settle, fetch } = {}) {
  const calls = [], events = [];
  const provider = await nativeSource("lib/gemini-provider.ts", { ...keys, ...config, ...errors, AiPlatformError,
    reserveGeminiProject: reserve || (async () => { events.push("reserve"); return { id: "fixture" }; }),
    dispatchGeminiProject: dispatch || (async (_r, count) => { events.push(["dispatch", count]); }),
    settleGeminiProject: settle || (async (_r, certain, backoff) => { events.push(["settle", certain, backoff]); }),
    fetch: async (url, init) => { calls.push({ url: String(url), init }); return fetch ? fetch(url, init) : Response.json(String(url).endsWith(":countTokens") ? { totalTokens: 17 } : answer); },
  });
  return { provider, calls, events };
}
test("unverified, paid or unavailable admission sends no token-count or generation request", async () => {
  for (const code of ["AI_PROJECT_UNVERIFIED", "AI_PAID_PRICING_UNVERIFIED", "AI_PROJECT_STORE_UNAVAILABLE"]) {
    const f = await boundary({ reserve: async () => { throw new AiPlatformError(code, "blocked", 503); } });
    await assert.rejects(f.provider.requestGemini({ apiKey: raw, model: "gemini-test-flash", generation }), e => e.code === code); assert.equal(f.calls.length, 0);
  }
});
test("countTokens sees the identical frozen generation request including system instruction/schema", async () => {
  const body = { ...structuredClone(generation), systemInstruction: { parts: [{ text: "instruction" }] } };
  const f = await boundary({ reserve: async () => { body.contents[0].parts[0].text = "mutated"; return {}; } });
  await f.provider.requestGemini({ apiKey: raw, model: "gemini-test-flash", generation: body });
  assert.equal(f.calls.length, 2); assert.ok(f.calls[0].url.endsWith(":countTokens")); assert.ok(f.calls[1].url.endsWith(":generateContent"));
  const counted = JSON.parse(f.calls[0].init.body).generateContentRequest, sent = JSON.parse(f.calls[1].init.body);
  assert.equal(counted.model, "models/gemini-test-flash"); delete counted.model; assert.deepEqual(counted, sent); assert.equal(sent.contents[0].parts[0].text, "synthetic");
  assert.deepEqual(f.events.at(-1), ["settle", true, 0]);
});
test("revocation after counting blocks generation and leaves an uncertain fenced reservation", async () => {
  const f = await boundary({ dispatch: async () => { throw new AiPlatformError("AI_PROJECT_PROOF_CHANGED", "blocked"); } });
  await assert.rejects(f.provider.requestGemini({ apiKey: raw, model: "gemini-test-flash", generation }), e => e.code === "AI_PROJECT_PROOF_CHANGED");
  assert.equal(f.calls.length, 1); assert.deepEqual(f.events.at(-1), ["settle", false, 0]);
});
test("transport uncertainty retains lease while 429 records shared project backoff", async () => {
  for (const quota of [false, true]) {
    const f = await boundary({ fetch: async url => { if (String(url).endsWith(":countTokens")) return Response.json({ totalTokens: 17 }); if (!quota) throw Error("network"); return Response.json({ error: { message: "daily quota exhausted" } }, { status: 429, headers: { "retry-after": "90" } }); } });
    await assert.rejects(f.provider.requestGemini({ apiKey: raw, model: "gemini-test-flash", generation }));
    assert.deepEqual(f.events.at(-1), ["settle", quota, quota ? 90 : 0]);
  }
});
test("administrative generation diagnostic uses the admission gate but metadata alone does not", async () => {
  const f = await boundary({ reserve: async () => { throw new AiPlatformError("AI_PROJECT_UNVERIFIED", "blocked"); }, fetch: async () => Response.json({ name: "models/gemini-test-flash", supportedGenerationMethods: ["generateContent"] }) });
  assert.equal((await f.provider.testGeminiConnection(raw, "gemini-test-flash", false)).generationVerified, false);
  await assert.rejects(f.provider.testGeminiConnection(raw, "gemini-test-flash", true), e => e.code === "AI_PROJECT_UNVERIFIED");
  assert.equal(f.calls.length, 2); assert.ok(f.calls.every(c => c.init.method === "GET"));
});
test("model override and unsupported generation properties cannot bypass the counted model", async () => {
  const f = await boundary();
  await assert.rejects(f.provider.requestGemini({ apiKey: raw, model: "gemini-test-flash", generation: { ...generation, model: "models/another" } }), e => e.code === "AI_GENERATION_UNSUPPORTED");
  assert.equal(f.calls.length, 0);
});
