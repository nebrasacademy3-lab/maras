import assert from "node:assert/strict";
import test from "node:test";
import * as crypto from "node:crypto";
import { pureSource } from "./helpers/pure-source.mjs";
class AiPlatformError extends Error {
  constructor(code, message, status = 400) { super(message); Object.assign(this, { code, status }); }
}
const cryptoDependencies = Object.fromEntries(Object.entries(crypto).filter(([key]) => key !== "default"));
const config = await pureSource("lib/gemini-config.ts");
const errors = await pureSource("lib/gemini-errors.ts", { AiPlatformError });
const answer = () => Response.json({ candidates: [{ content: { parts: [{ text: "fixture" }] }, finishReason: "STOP" }] });
const quota = () => Response.json({ error: { message: "daily quota exhausted" } }, { status: 429, headers: { "retry-after": "90" } });
const input = { config: { model: "gemini-test-flash", temperature: 0.2, maxOutputTokens: 256 }, systemInstruction: "Synthetic only", contents: [{ role: "user", parts: [{ text: "fixture" }] }] };
async function fixture(overrides = [{}, {}], options = {}) {
  const env = { AI_KEYS_ENCRYPTION_KEY: "34".repeat(32), ...options.env };
  const keys = await pureSource("lib/ai-keys.ts", { ...cryptoDependencies, AiPlatformError, process: { env } });
  const raw = overrides.map((_, index) => "AIza_SYNTHETIC_NOT_REAL_KEY_" + index + "_1234567890");
  const rows = overrides.map((value, index) => ({
    id: index + 1, projectLabel: null, status: "active", encryptedKey: keys.encryptAiApiKey(raw[index]),
    fingerprint: keys.aiKeyFingerprint(raw[index]), priority: index + 1, lastUsedAt: null,
    updatedAt: "2026-01-01T00:00:00.000Z", cooldownUntil: null, ...value,
  }));
  if (options.prepare) options.prepare(rows, raw, env);
  const columns = Object.fromEntries(Object.keys(rows[0] || {}).map(key => [key, key]));
  const eq = (key, value) => row => row[key] === value;
  const and = (...predicates) => row => predicates.filter(Boolean).every(predicate => predicate(row));
  const calls = [], updates = [], reservations = [];
  const db = {
    select: () => ({ from: () => ({ where: () => ({ orderBy: async () => {
      if (options.storeUnavailable) throw new Error("synthetic store offline");
      return rows.map(row => ({ ...row }));
    } }) }) }),
    update: () => ({ set: values => ({ where: async predicate => {
      for (const row of rows) if (predicate(row)) { updates.push(values); Object.assign(row, values); }
    } }) }),
  };
  const provider = await pureSource("lib/gemini-provider.ts", { ...keys, ...config, ...errors, AiPlatformError, fetch: async (_url, init) => {
    calls.push(init.headers["x-goog-api-key"]);
    return options.response ? options.response(calls.length, rows) : answer();
  } });
  const runtime = await pureSource("lib/gemini.ts", {
    ...keys, ...config, ...errors, ...provider, ...cryptoDependencies, AiPlatformError,
    aiApiKeys: columns, eq, and, sql: () => true, asc: () => true, getDb: () => db,
    process: { env }, acquireAiProviderSlot: async () => async () => {}, deferAiProvider: async () => {},
    reserveAiPaidBudget: async id => { reservations.push(id); options.onReserve?.(rows); return { reservedSar: 1 }; },
  });
  return { ...runtime, rows, raw, calls, updates, reservations };
}
test("healthy free credentials rotate by last use before static priority", async () => {
  const f = await fixture();
  for (let i = 0; i < 40; i++) await f.generateGeminiContent(input);
  assert.deepEqual(f.calls, Array.from({ length: 40 }, (_, index) => f.raw[index % 2]));
  assert.equal(f.reservations.length, 0);
});
test("a cooling free member cannot disappear from the paid eligibility proof", async () => {
  const f = await fixture([{ cooldownUntil: new Date(Date.now() + 3600000).toISOString() }, {}, { projectLabel: "paid:backup" }], { response: quota });
  await assert.rejects(f.generateGeminiContent(input), error => error.code === "AI_QUOTA_EXHAUSTED");
  assert.equal(f.calls.length, 1); assert.equal(f.reservations.length, 0);
});
test("corrupt and error-state free registrations block a smaller false all-exhausted set", async () => {
  for (const broken of [{ encryptedKey: "corrupt" }, { status: "error" }]) {
    const f = await fixture([broken, {}, { projectLabel: "paid:backup" }], { response: quota });
    await assert.rejects(f.generateGeminiContent(input), error => error.code === "AI_QUOTA_EXHAUSTED");
    assert.equal(f.calls.length, 1); assert.equal(f.reservations.length, 0);
  }
});
test("an environment paid duplicate can never execute under a free database label", async () => {
  const f = await fixture([{}], { prepare: (_rows, raw, env) => { env.GEMINI_PAID_API_KEY = raw[0]; } });
  await assert.rejects(f.generateGeminiContent(input));
  assert.equal(f.calls.length, 0); assert.equal(f.reservations.length, 0);
});
test("a disabled database registration is not revived by an environment duplicate", async () => {
  const f = await fixture([{ status: "disabled" }], { prepare: (_rows, raw, env) => { env.GEMINI_API_KEY = raw[0]; } });
  await assert.rejects(f.generateGeminiContent(input), error => error.code === "AI_PROVIDER_UNAVAILABLE");
  assert.equal(f.calls.length, 0);
});
test("a late success or failure never reactivates an administrator-disabled key", async () => {
  for (const success of [true, false]) {
    const f = await fixture([{}], { response: (_number, rows) => {
      rows[0].status = "disabled";
      return success ? answer() : Response.json({ error: {} }, { status: 503 });
    } });
    if (success) await f.generateGeminiContent(input); else await assert.rejects(f.generateGeminiContent(input));
    assert.equal(f.rows[0].status, "disabled"); assert.equal(f.updates.length, 0);
  }
});
test("a late invalid-key result cannot overwrite a newly replaced credential", async () => {
  const f = await fixture([{}], { response: (_number, rows) => {
    rows[0].fingerprint = "replacement";
    return Response.json({ error: { details: [{ reason: "API_KEY_INVALID" }] } }, { status: 400 });
  } });
  await assert.rejects(f.generateGeminiContent(input));
  assert.equal(f.rows[0].fingerprint, "replacement"); assert.equal(f.rows[0].status, "active");
  assert.equal(f.updates.length, 0);
});
test("all nonempty free members need a fresh quota failure before one budgeted paid attempt", async () => {
  const f = await fixture([{}, {}, { projectLabel: "paid:backup" }], { response: number => number <= 2 ? quota() : answer() });
  const result = await f.generateGeminiContent(input);
  assert.equal(result.providerTier, "paid"); assert.equal(f.calls.length, 3); assert.equal(f.reservations.length, 1);
});
test("paid eligibility is rechecked after the budget reservation and before transmission", async () => {
  const f = await fixture([{}, { projectLabel: "paid:backup" }], { response: quota, onReserve: rows => { rows[1].status = "disabled"; } });
  await assert.rejects(f.generateGeminiContent(input), error => error.code === "AI_FREE_POOL_CHANGED");
  assert.equal(f.calls.length, 1); assert.equal(f.reservations.length, 1);
});
test("an unavailable credential registry fails closed even with environment credentials", async () => {
  const f = await fixture([{}], { storeUnavailable: true, prepare: (_rows, raw, env) => { env.GEMINI_API_KEY = raw[0]; } });
  await assert.rejects(f.generateGeminiContent(input), error => error.code === "AI_KEY_STORE_UNAVAILABLE");
  assert.equal(f.calls.length, 0);
});
