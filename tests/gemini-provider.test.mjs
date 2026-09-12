import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as crypto from "node:crypto";
import test from "node:test";
import ts from "typescript";

async function isolated(file, dependencies = {}) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const key = "__gemini" + crypto.randomUUID().replaceAll("-", "");
  globalThis[key] = dependencies;
  try {
    const input = "const {" + Object.keys(dependencies).filter(name => name !== "default").join(",") + "} = globalThis[" + JSON.stringify(key) + "];\n" + source.replace(/^import .+;\r?\n/gm, "");
    const output = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    return await import("data:text/javascript;base64," + Buffer.from(output).toString("base64"));
  } finally { delete globalThis[key]; }
}
class AiPlatformError extends Error { constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; } }
const platform = { AiPlatformError };
const config = await isolated("../lib/gemini-config.ts");
const errors = await isolated("../lib/gemini-errors.ts", platform);
const legacy = "AIza" + "synthetic_not_real_".repeat(2);
const modern = "AQ." + "synthetic_not_real_".repeat(30) + ".signature";
const keys = await isolated("../lib/ai-keys.ts", { ...crypto, ...platform, process: { env: { AI_KEYS_ENCRYPTION_KEY: "12".repeat(32) } } });
const model = { name: "models/gemini-test-flash", displayName: "Synthetic test model", supportedGenerationMethods: ["generateContent"], inputTokenLimit: 10000, outputTokenLimit: 2048 };
const answer = { candidates: [{ content: { parts: [{ text: "OK" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1 } };
const provider = fetch => isolated("../lib/gemini-provider.ts", { ...platform, ...config, ...errors, ...keys, fetch });

test("modern dotted auth keys survive validation, authenticated encryption and all environment formats", () => {
  for (const key of [legacy, modern]) {
    assert.equal(keys.validGeminiApiKey(` ${key} `), key);
    assert.equal(keys.decryptAiApiKey(keys.encryptAiApiKey(key)), key);
    assert.equal(keys.maskAiKey(key).includes(key), false);
  }
  assert.deepEqual(keys.geminiEnvironmentKeys({ GEMINI_API_KEYS: JSON.stringify([modern, legacy, modern]), GEMINI_API_KEY: legacy, GOOGLE_API_KEY: modern }), [modern, legacy]);
  assert.deepEqual(keys.geminiEnvironmentKeys({ GEMINI_API_KEYS: `${modern}\n${legacy};${modern}` }), [modern, legacy]);
  assert.deepEqual(keys.geminiEnvironmentKeys({ GEMINI_API_KEYS: '["broken', GOOGLE_API_KEY: modern }), [modern]);
  for (const invalid of ["short", "x".repeat(4097), `"${modern}"`, `${modern}\r\nx-secret: injected`, "Bearer " + modern, "<script>".repeat(8)]) assert.equal(keys.validGeminiApiKey(invalid), "");
});

test("model identifiers normalize resources without allowing a URL, query, escaped slash or path traversal", () => {
  for (const value of [" gemini-test-flash ", "models/gemini-test-flash"]) assert.equal(config.normalizeGeminiModel(value), "gemini-test-flash");
  for (const value of ["https://evil.test/model", "models/models/gemini-test", "../test", "gemini?key=secret", "models/gemini%2fmodel", null]) assert.equal(config.normalizeGeminiModel(value), "");
});

test("credentials use only Google's header on a fixed endpoint and redirects are forbidden", async () => {
  const calls = [];
  const p = await provider(async (url, init) => { calls.push({ url: String(url), init }); return Response.json(answer); });
  await p.requestGemini({ apiKey: modern, model: "models/gemini-test-flash", generation: { contents: [{ role: "user", parts: [{ text: "OK" }] }] } });
  assert.equal(calls[0].url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-test-flash:generateContent");
  assert.equal(calls[0].init.headers["x-goog-api-key"], modern);
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[0].url.includes(modern), false);
  await assert.rejects(p.requestGemini({ apiKey: modern, model: "https://evil.test" }), error => error.code === "AI_MODEL_INVALID");
  assert.equal(calls.length, 1);
});

test("error classifications separate valid-key permission, model, quota and billing failures without raw provider data", () => {
  const cases = [
    [403, { message: "private-project " + modern }, "AI_PERMISSION_DENIED", false],
    [403, { details: [{ reason: "API_KEY_SERVICE_BLOCKED" }] }, "AI_KEY_RESTRICTED", false],
    [403, { details: [{ reason: "SERVICE_DISABLED" }] }, "AI_API_DISABLED", false],
    [400, { details: [{ reason: "API_KEY_INVALID" }] }, "AI_KEY_INVALID", true],
    [400, { message: "Your API key was reported as leaked " + modern }, "AI_KEY_REVOKED", true],
    [404, { message: "models/no-longer-available " + modern }, "AI_MODEL_UNAVAILABLE", false],
    [429, { message: "quota exhausted per_day private-project " + modern }, "AI_QUOTA_EXHAUSTED", false],
    [429, { message: "Your prepayment credits are depleted " + modern }, "AI_BILLING_REQUIRED", false],
    [429, { message: "Too many requests" }, "AI_RATE_LIMITED", false],
    [400, { message: "unsupported generationConfig " + modern }, "AI_PROVIDER_REQUEST_REJECTED", false],
  ];
  for (const [status, payload, code, invalid] of cases) {
    const error = errors.classifyGeminiError(status, { error: payload });
    assert.equal(error.code, code); assert.equal(error.invalidCredential, invalid);
    assert.doesNotMatch(error.message + JSON.stringify(error), /private-project|synthetic_not_real/);
  }
  assert.equal(errors.classifyGeminiError(429, { error: { details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "12.3s" }] } }).retryAfterSeconds, 13);
  assert.equal(errors.classifyGeminiError(429, {}, "999999").retryAfterSeconds, 3600);
});

test("model discovery follows bounded pages and returns only generateContent-capable normalized models", async () => {
  const calls = [];
  const p = await provider(async url => { calls.push(String(url)); return Response.json(calls.length === 1 ? { models: [model, { ...model, name: "models/embedding", supportedGenerationMethods: ["embedContent"] }], nextPageToken: "next/page" } : { models: [{ ...model, name: "models/gemini-test-pro" }] }); });
  const result = await p.listGeminiModels(modern);
  assert.deepEqual(result.models.map(item => item.id), ["gemini-test-flash", "gemini-test-pro"]);
  assert.equal(result.hasMore, false); assert.ok(calls[1].includes("pageToken=next%2Fpage"));
});

test("metadata checks do not generate; explicit generation test sends only a bounded generic prompt", async () => {
  const calls = [];
  const p = await provider(async (_url, init) => { calls.push(init); return Response.json(init.method === "GET" ? model : answer); });
  const access = await p.testGeminiConnection(modern, model.name);
  assert.equal(access.generationVerified, false); assert.equal(calls.length, 1); assert.equal(calls[0].method, "GET");
  const generated = await p.testGeminiConnection(modern, model.name, true);
  assert.equal(generated.generationVerified, true); assert.equal(calls.length, 3);
  const body = JSON.parse(calls[2].body);
  assert.equal(body.contents[0].parts[0].text, "Reply with OK only.");
  assert.ok(body.generationConfig.maxOutputTokens <= 1024);
});

test("malformed provider responses and thought-only/safety/token-limit outputs produce useful safe failures", async () => {
  for (const body of ["not-json " + modern, "null", "[]"]) {
    const p = await provider(async () => new Response(body));
    await assert.rejects(p.requestGemini({ apiKey: modern, model: model.name }), error => error.code === "AI_PROVIDER_INVALID_RESPONSE" && !error.message.includes(modern));
  }
  const p = await provider(async () => Response.json({ error: { message: modern } }, { status: 403 }));
  assert.equal(p.geminiTextResponse({ candidates: [{ content: { parts: [{ text: "hidden", thought: true }, { text: "final" }] } }] }).text, "final");
  for (const [payload, code] of [[{ promptFeedback: { blockReason: "SAFETY" } }, "AI_CONTENT_BLOCKED"], [{ candidates: [{ finishReason: "MAX_TOKENS" }] }, "AI_OUTPUT_TOKEN_LIMIT"], [{ candidates: [{ content: { parts: [{ thought: true, text: "reasoning" }] } }] }, "AI_EMPTY_RESPONSE"]]) assert.throws(() => p.geminiTextResponse(payload), error => error.code === code);
});

async function runtime(sequence, environment = {}) {
  const updates = [], calls = [];
  const rows = [modern, legacy].map((key, index) => ({ id: index + 1, encryptedKey: keys.encryptAiApiKey(key), fingerprint: keys.aiKeyFingerprint(key), priority: index, lastUsedAt: null, cooldownUntil: null }));
  const db = { select: () => ({ from: () => ({ where: () => ({ orderBy: async () => rows }) }) }), update: () => ({ set: values => ({ where: async () => { updates.push(values); } }) }) };
  const p = await provider(async (url, init) => { calls.push({ url: String(url), init }); return sequence(calls.length); });
  const compiledModule = await isolated("../lib/gemini.ts", { ...platform, ...config, ...errors, ...keys, ...p, createHash: crypto.createHash, asc: () => true, eq: () => true, getDb: () => db, aiApiKeys: {}, process: { env: environment } });
  return { ...compiledModule, updates, calls };
}
const generation = { config: { model: model.name, temperature: 0.2, maxOutputTokens: 4096 }, systemInstruction: "Test only", contents: [{ role: "user", parts: [{ text: "OK" }] }] };
test("403 rotates to the next key without disabling credentials; request model is normalized", async () => {
  const r = await runtime(index => index === 1 ? Response.json({ error: { message: modern } }, { status: 403 }) : Response.json(answer));
  const result = await r.generateGeminiContent(generation);
  assert.equal(result.text, "OK"); assert.equal(result.model, "gemini-test-flash"); assert.equal(r.calls.length, 2);
  assert.equal(r.updates[0].status, "active"); assert.equal(r.updates[0].lastErrorCode, "AI_PERMISSION_DENIED");
  assert.equal(r.updates[1].lastErrorCode, null);
});
test("invalid-key signals disable only that key while model failures do not rotate or disable the pool", async () => {
  const invalid = await runtime(index => index === 1 ? Response.json({ error: { details: [{ reason: "API_KEY_INVALID" }] } }, { status: 400 }) : Response.json(answer));
  await invalid.generateGeminiContent(generation); assert.equal(invalid.updates[0].status, "error"); assert.equal(invalid.calls.length, 2);
  const missing = await runtime(() => Response.json({ error: {} }, { status: 404 }));
  await assert.rejects(missing.generateGeminiContent(generation), error => error.code === "AI_MODEL_UNAVAILABLE");
  assert.equal(missing.calls.length, 1); assert.equal(missing.updates[0].status, "active"); assert.equal(missing.updates[0].cooldownUntil, null);
});


test("corrupt encrypted key reports configuration failure instead of generic provider outage", async () => {
  const rows=[{id:1,encryptedKey:"bad",fingerprint:"bad",priority:1,cooldownUntil:null}];
  const db={select:()=>({from:()=>({where:()=>({orderBy:async()=>rows})})})};
  const r=await isolated("../lib/gemini.ts",{...platform,...config,...errors,createHash:crypto.createHash,asc:()=>true,eq:()=>true,aiApiKeys:{},getDb:()=>db,decryptAiApiKey:()=>{throw Error("private-key-secret");},geminiEnvironmentKeys:()=>[],process:{env:{}}});
  await assert.rejects(r.generateGeminiContent(generation),error=>error.code==="AI_KEY_DECRYPTION_FAILED"&&!error.message.includes("private-key-secret"));
  const ciphertext=keys.encryptAiApiKey(modern);
  assert.throws(()=>keys.decryptAiApiKey(ciphertext+".extra"),error=>error.code==="AI_KEY_DECRYPTION_FAILED");
});

test("runtime service diagnostic uses actual generation helpers with stored service config", async () => {
  const calls=[];
  let disabled=false;
  const settings=Object.fromEntries(["chat","summary","translation","quiz"].map(service=>[service,{service,enabled:true,model:"gemini-stored-test",temperature:0.31,maxOutputTokens:1234,instructions:"stored instructions"}]));
  const result={text:"fixture",model:"gemini-stored-test",keyId:3};
  const route=await isolated("../app/api/admin/ai/route.ts",{...platform,...errors,
    getSessionUser:async()=>({id:1,email:"admin@example.test",role:"admin"}),hasPermission:async()=>true,ADMIN_PERMISSIONS:{AI_MANAGE:"ai.manage"},sameOriginRequest:()=>true,checkRateLimit:async()=>true,requireAdminStepUp:async()=>{},AdminMfaError:class extends Error{},
    getDb:()=>({insert:()=>({values:async()=>{}})}),auditLogs:{},clientIp:()=>"local",observeRequest:(_request,_name,callback)=>callback(),readBoundedJsonObject:request=>request.json(),cleanText:value=>typeof value==="string"?value.trim():"",isAiService:value=>["chat","summary","translation","quiz"].includes(value),getAiServiceSettings:async()=>({...settings,chat:{...settings.chat,enabled:!disabled}}),
    generateAiChat:async input=>{calls.push({kind:"chat",input});return result;},generateFileArtifact:async input=>{calls.push({kind:input.action,input});return result;},generateFileQuiz:async input=>{calls.push({kind:"quiz",input});return {result,quiz:{}};},jsonError:(error,status=400,code)=>Response.json({error,code},{status}),RequestBodyTooLargeError:class extends Error{},isUniqueConstraintError:()=>false,
  });
  for(const service of ["chat","summary","translation","quiz"]){
    const response=await route.POST(new Request("https://meras.example/api/admin/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"testRuntime",service})}));
    assert.equal(response.status,200);assert.equal((await response.json()).runtimeVerified,true);
    assert.equal(calls.at(-1).kind,service);assert.deepEqual(calls.at(-1).input.config,settings[service]);
    if(service!=="chat")assert.equal(calls.at(-1).input.originalName,"meras-diagnostic.txt");
  }
  disabled=true;
  const response=await route.POST(new Request("https://meras.example/api/admin/ai",{method:"POST",body:JSON.stringify({action:"testRuntime",service:"chat"})}));
  assert.equal(response.status,409);assert.equal(calls.length,4);
});
