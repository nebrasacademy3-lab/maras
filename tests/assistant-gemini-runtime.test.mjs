import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { nativeSource } from "./helpers/native-source.mjs";
const input = { question: "كيف أسجل؟", history: [], user: null, settings: {}, context: "synthetic public catalog", intent: "registration" };
const chat = { service: "chat", enabled: true, model: "gemini-synthetic-test", maxOutputTokens: 8000, temperature: 0.6, instructions: "", maxFileBytes: 1000, freeMonthlyLimit: 10, subscriberMonthlyLimit: 20 };

async function fixture(options = {}) {
  const calls = [];
  const assistant = await nativeSource("lib/assistant-ai.ts", {
    whatsappHref: () => null,
    getAiServiceSettings: async () => ({ chat: { ...chat, ...options.chat } }),
    generateGeminiContent: async request => {
      calls.push(request);
      if (options.error) throw options.error;
      return { text: options.text ?? JSON.stringify({ answer: "تقدر تسجل من صفحة التسجيل.", actions: [{ label: "سجل الآن", href: "/register" }], suggestions: ["كيف أدفع؟"] }) };
    },
    fetch: () => { throw new Error("Direct provider calls are forbidden"); },
  });
  return { ...assistant, calls };
}

test("general assistant uses only the shared free Gemini dispatcher and approved chat configuration", async () => {
  const f = await fixture(); const reply = await f.answerWithGemini(input);
  assert.equal(reply.answer, "تقدر تسجل من صفحة التسجيل.");
  assert.deepEqual(reply.actions, [{ label: "سجل الآن", href: "/register" }]);
  assert.equal(f.calls.length, 1);
  const request = f.calls[0];
  assert.equal(request.allowPaidFallback, false); assert.equal(request.timeoutMs, 22000);
  assert.equal(request.config.model, chat.model); assert.equal(request.config.maxOutputTokens, 2200); assert.equal(request.config.temperature, 0.25);
  assert.equal(request.responseSchema.additionalProperties, false);
  assert.deepEqual(request.responseSchema.required, ["answer", "actions", "suggestions"]);
});

test("disabled chat capability and upstream failure keep the deterministic guide eligible without paid retries", async () => {
  const disabled = await fixture({ chat: { enabled: false } }); assert.equal(await disabled.answerWithGemini(input), null); assert.equal(disabled.calls.length, 0);
  const unavailable = await fixture({ error: new Error("private-api-key private-provider-body") }); assert.equal(await unavailable.answerWithGemini(input), null); assert.equal(unavailable.calls.length, 1);
});

test("retrieved content is bounded data, not model system instructions; history uses only Gemini roles", async () => {
  const f = await fixture();
  const context = "SYNTHETIC_UNTRUSTED_CONTEXT:" + "x".repeat(22000);
  const history = Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", text: "z".repeat(900) }));
  await f.answerWithGemini({ ...input, context, history, question: "q".repeat(900) });
  const request = f.calls[0];
  assert.equal(request.systemInstruction.includes("SYNTHETIC_UNTRUSTED_CONTEXT"), false);
  const retrieved = JSON.parse(request.contents[0].parts[0].text);
  assert.equal(retrieved.kind, "untrusted_retrieved_context"); assert.equal(retrieved.content.length, 20000);
  assert.equal(request.contents.length, 10);
  assert.ok(request.contents.every(item => ["user", "model"].includes(item.role)));
  assert.ok(request.contents.slice(1, -1).every(item => item.parts[0].text.length <= 600));
  assert.equal(request.contents.at(-1).parts[0].text.length, 500);
});

test("invalid Gemini JSON and empty answers do not bypass the deterministic fallback", async () => {
  for (const text of ["not JSON", "null", "[]", '{}', '{"answer":"  "}', '{"answer":123}']) {
    const f = await fixture({ text }); assert.equal(await f.answerWithGemini(input), null);
  }
});

test("generated privileged, encoded and foreign actions are removed for students", async () => {
  const f = await fixture({ text: JSON.stringify({ answer: "a".repeat(6000), actions: [
    { label: "Admin", href: "/admin" }, { label: "Encoded", href: "/courses/%2e%2e/admin" },
    { label: "External", href: "https://unpublished.example" }, { label: "Allowed", href: "/courses" },
  ], suggestions: Array(20).fill("s".repeat(100)) }) });
  const reply = await f.answerWithGemini({ ...input, user: { id: 7, role: "student" } });
  assert.equal(reply.answer.length, 4800); assert.deepEqual(reply.actions, [{ label: "Allowed", href: "/courses" }]);
  assert.equal(reply.suggestions.length, 4); assert.ok(reply.suggestions.every(item => item.length === 80));
});

test("public assistant endpoint still returns the non-generative guide when Gemini is unavailable", async () => {
  let generated = 0, fallback = 0;
  const route = await nativeSource("app/api/assistant/route.ts", {
    sameOriginRequest: () => true, clientIp: () => "synthetic", checkRateLimit: async () => true,
    readBoundedJsonObject: request => request.json(), RequestBodyTooLargeError: class extends Error {},
    cleanText: value => typeof value === "string" ? value : "", jsonError: (error, status = 400) => Response.json({ error }, { status }),
    getSessionUser: async () => null, getPublicSettings: async () => ({}), PUBLIC_SETTING_DEFAULTS: {},
    getAssistantLiveCatalog: async () => ({ institutions: [], courses: [], programs: [] }),
    detectAssistantIntent: () => "registration", resolveAssistantQuestion: question => question, detectAssistantLanguage: () => "ar",
    buildAssistantContext: async () => "synthetic context",
    answerWithGemini: async () => { generated++; return null; },
    answerAssistant: () => { fallback++; return { answer: "الدليل البرمجي", actions: [] }; },
  });
  const result = await route.POST(new Request("https://maras-qa.example/api/assistant", { method: "POST", body: JSON.stringify({ question: "كيف أسجل" }) }));
  assert.equal(result.status, 200); assert.equal((await result.json()).answer, "الدليل البرمجي");
  assert.equal(generated, 1); assert.equal(fallback, 1); assert.equal(result.headers.get("cache-control"), "no-store");
});

test("server assistant and configuration examples no longer expose an alternate provider path", async () => {
  for (const path of ["lib/assistant-ai.ts", "app/api/assistant/route.ts", "app/api/health/route.ts", ".env.example", "RAILWAY_VARIABLES.example"]) {
    const source = await readFile(new URL("../" + path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /OPENAI_API_KEY|OPENAI_API_URL|answerWithOpenAI|chat\/completions/);
  }
});
