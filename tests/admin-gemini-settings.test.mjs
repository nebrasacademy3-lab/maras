import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import test from "node:test";
import ts from "typescript";
async function isolated(path, dependencies = {}) {
  const key = "__adminGemini" + crypto.randomUUID().replaceAll("-", "");
  globalThis[key] = dependencies;
  try {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    const input = "const {" + Object.keys(dependencies).join(",") + "}=globalThis[" + JSON.stringify(key) + "];\n" + source.replace(/^import .+;\r?\n/gm, "");
    return await import("data:text/javascript;base64," + Buffer.from(ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString("base64"));
  } finally { delete globalThis[key]; }
}
class AiPlatformError extends Error { constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; } }
class AdminMfaError extends Error { constructor() { super("Step up required"); this.code = "ADMIN_MFA_REQUIRED"; this.status = 403; } }
const config = await isolated("../lib/gemini-config.ts");
const errorTypes = await isolated("../lib/gemini-errors.ts", { AiPlatformError });
const bodyHelpers = await isolated("../lib/request-body.ts");
const modern = "AQ." + "not_a_real_key_".repeat(30);
const keys = await isolated("../lib/ai-keys.ts", { AiPlatformError, createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, process: { env: { AI_KEYS_ENCRYPTION_KEY: "34".repeat(32) } } });
const services = ["chat", "summary", "translation", "quiz"];
const settings = Object.fromEntries(services.map(service => [service, { service, enabled: true, model: "gemini-2.5-flash", maxOutputTokens: 4096, maxFileBytes: 2000000 }]));

async function setup({ permission = true, stepUp = true, limit = true, diagnosticError = null, encryptionError = null } = {}) {
  const state = { keys: [], settings: [], audit: [], provider: [], dbAccess: 0 };
  const aiApiKeys = { type: "keys", id: "id", status:"status", fingerprint:"fingerprint" }, aiServiceSettings = { type: "settings", service: "service" }, auditLogs = { type: "audit" };
  const matches=(row,condition)=>!condition || (condition.conditions ? condition.conditions.every(item=>matches(row,item)) : row[condition.field]===condition.value);
  function query(table) {
    let condition;
    const rows = () => state[table.type].filter(row => matches(row,condition));
    const chain = { where: value => { condition = value; return chain; }, limit: async n => rows().slice(0, n), then: (resolve, reject) => Promise.resolve(rows()).then(resolve, reject) };
    return chain;
  }
  const db = {
    select: () => ({ from: table => query(table) }),
    insert: table => ({ values: values => {
      if (table.type === "audit") { state.audit.push(values); return Promise.resolve(); }
      const chain = { onConflictDoUpdate: () => chain, returning: async () => { const row = { id: state[table.type].length + 1, ...values }; if (table.type === "settings") state.settings = state.settings.filter(item => item.service !== row.service); state[table.type].push(row); return [row]; } };
      return chain;
    } }),
    update: table => ({ set: values => ({ where: async condition => { const row = state[table.type].find(item => matches(item,condition)); if (row) Object.assign(row, values); } }) }),
  };
  const deps = {
    ...keys, ...config, ...errorTypes, ...bodyHelpers, AiPlatformError, AdminMfaError,
    AI_SERVICES: services, isAiService: value => services.includes(value), DEFAULT_AI_SETTINGS: settings,
    aiApiKeys, aiServiceSettings, auditLogs, aiEntitlements: {}, aiSubscriptionOrders: {}, aiUsageEvents: {}, platformSettings: {}, users: {},
    getDb: () => { state.dbAccess++; return db; }, eq: (field, value) => ({ field, value }), and:(...conditions)=>({conditions}), asc: () => true, desc: () => true, count: () => true, gte: () => true, sql: () => true,
    getSessionUser: async () => ({ id: 7, email: "admin@example.test" }), hasPermission: async () => permission, ADMIN_PERMISSIONS: { AI_MANAGE: "ai" }, sameOriginRequest: () => true,
    checkRateLimit: async name => name === "admin-ai-provider-check" ? limit : true,
    requireAdminStepUp: async () => { if (!stepUp) throw new AdminMfaError(); },
    cleanText: (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "",
    jsonError: (error, status = 400, code) => Response.json({ ok: false, error, code }, { status }),
    isUniqueConstraintError: () => false, clientIp: () => "127.0.0.1", validEmail: () => true, observeRequest: (_r, _name, fn) => fn(),
    getAiMonthlyPrice: async () => 30, getAiServiceSettings: async () => settings, createAndSendNotification: async () => undefined,
    listGeminiModels: async apiKey => { state.provider.push({ apiKey, kind: "models" }); if (diagnosticError) throw diagnosticError; return { models: [{ id: "gemini-test-flash" }], hasMore: false }; },
    testGeminiConnection: async (apiKey, model, generation) => { state.provider.push({ apiKey, model, generation }); if (diagnosticError) throw diagnosticError; return { generationVerified: generation, message: "Test succeeded", model: { id: model } }; },
    ...(encryptionError ? { encryptAiApiKey: () => { throw encryptionError; } } : {}),
  };
  const route = await isolated("../app/api/admin/ai/route.ts", deps);
  const post = body => route.POST(new Request("https://platform.example.test/api/admin/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { state, db, post, deps };
}

test("admin save accepts modern dotted key, encrypts it, and returns/audits masked data only", async () => {
  const s = await setup(); const response = await s.post({ action: "addKey", label: "Synthetic provider", apiKey: modern });
  assert.equal(response.status, 201); const data = await response.json();
  assert.equal(keys.decryptAiApiKey(s.state.keys[0].encryptedKey), modern);
  assert.equal(JSON.stringify(data).includes(modern), false); assert.equal(JSON.stringify(s.state.audit).includes(modern), false);
  assert.equal(JSON.stringify(s.state.audit).includes(s.state.keys[0].encryptedKey), false);
});
test("models/ service settings round-trip through actual config reader without falling back", async () => {
  const s = await setup(); const response = await s.post({ action: "saveService", service: "chat", model: " models/gemini-test-flash ", enabled: true, freeMonthlyLimit: 7, subscriberMonthlyLimit: 70, temperature: 0.35, maxOutputTokens: 2048, maxFileBytes: 1048576 });
  assert.equal(response.status, 200); assert.equal((await response.json()).setting.model, "gemini-test-flash");
  const platform = await isolated("../lib/ai-platform.ts", { ...config, getDb: () => s.db, aiServiceSettings: s.deps.aiServiceSettings, AI_SERVICES: services });
  const read = await platform.getAiServiceSettings();
  assert.equal(read.chat.model, "gemini-test-flash"); assert.equal(read.chat.temperature, 0.35); assert.equal(read.chat.freeMonthlyLimit, 7);
});
test("key storage configuration errors retain precise sanitized code instead of blaming a valid key", async () => {
  const s = await setup({ encryptionError: new AiPlatformError("AI_KEY_ENCRYPTION_NOT_CONFIGURED", "Secure storage is not configured", 503) });
  const response = await s.post({ action: "addKey", label: "Synthetic", apiKey: modern });
  assert.equal(response.status, 503); assert.equal((await response.json()).code, "AI_KEY_ENCRYPTION_NOT_CONFIGURED"); assert.equal(s.state.keys.length, 0);
});
test("provider checks require permission, administrative step-up and their own rate limit before accessing Google", async () => {
  for (const options of [{ permission: false }, { stepUp: false }, { limit: false }]) { const s = await setup(options); const r = await s.post({ action: "testGeneration", source: "draft", apiKey: modern, model: "models/gemini-test-flash" }); assert.equal(r.status, options.limit === false ? 429 : 403); assert.equal(s.state.provider.length, 0); }
  const s = await setup(); assert.equal((await s.post(null)).status, 400); assert.equal((await s.post({ action: "testConnection", apiKey: "x".repeat(33000) })).status, 413); assert.equal(s.state.provider.length, 0);
});
test("saved-key generation checks use decrypted key internally and recover old error status without exposing it", async () => {
  const s = await setup(); await s.post({ action: "addKey", label: "Synthetic", apiKey: modern }); s.state.keys[0].status = "error";
  const r = await s.post({ action: "testGeneration", keyId: 1, model: "models/gemini-test-flash" });
  const data = await r.json(); assert.equal(r.status, 200); assert.equal(data.generationVerified, true); assert.equal(s.state.provider[0].apiKey, modern); assert.equal(s.state.provider[0].model, "gemini-test-flash"); assert.equal(s.state.keys[0].status, "active");
  assert.equal(JSON.stringify(data).includes(modern), false); assert.equal(JSON.stringify(s.state.audit).includes(modern), false);
});
test("diagnostic errors expose safe category/retry delay; metadata success never claims generation", async () => {
  const limited = await setup({ diagnosticError: new errorTypes.GeminiProviderError(429, "AI_RATE_LIMITED", true, false, 17) });
  const r = await limited.post({ action: "testConnection", source: "draft", apiKey: modern, model: "gemini-test-flash" }); const data = await r.json();
  assert.equal(r.status, 429); assert.equal(r.headers.get("retry-after"), "17"); assert.equal(data.providerStatus, 429); assert.equal(data.code, "AI_RATE_LIMITED"); assert.equal(JSON.stringify(data).includes(modern), false);
  const healthy = await setup(); const metadata = await healthy.post({ action: "testConnection", source: "draft", apiKey: modern, model: "gemini-test-flash" }); assert.equal((await metadata.json()).generationVerified, false);
});
