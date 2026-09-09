import "server-only";
import { AiPlatformError } from "@/lib/ai-platform";
import { validGeminiApiKey } from "@/lib/ai-keys";
import { geminiModelOption, normalizeGeminiModel, type GeminiModelOption } from "@/lib/gemini-config";
import { classifyGeminiError, GeminiProviderError } from "@/lib/gemini-errors";

async function readProviderJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new GeminiProviderError(502, "AI_PROVIDER_INVALID_RESPONSE");
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 4 * 1024 * 1024) { await reader.cancel(); throw new GeminiProviderError(502, "AI_PROVIDER_INVALID_RESPONSE"); }
      parts.push(part.value);
    }
  } finally { reader.releaseLock(); }
  try {
    const value: unknown = JSON.parse(Buffer.concat(parts).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("shape");
    return value as Record<string, unknown>;
  } catch { throw new GeminiProviderError(502, "AI_PROVIDER_INVALID_RESPONSE"); }
}

/** Credential goes only to the fixed Google host, never a query string or followed redirect. */
export async function requestGemini(input: { apiKey: string; model?: string; pageToken?: string; generation?: Record<string, unknown>; timeoutMs?: number }) {
  const apiKey = validGeminiApiKey(input.apiKey);
  if (!apiKey) throw new AiPlatformError("AI_KEY_INVALID", "صيغة المفتاح غير مكتملة. انسخه كاملًا من Google AI Studio دون مسافات داخلية أو علامات اقتباس.");
  const model = input.model === undefined ? "" : normalizeGeminiModel(input.model);
  if (input.model !== undefined && !model || input.generation && !model) throw new AiPlatformError("AI_MODEL_INVALID", "اكتب معرّف النموذج، مثل gemini-2.5-flash، أو models/ متبوعة بالمعرّف.");
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models${model ? `/${encodeURIComponent(model)}${input.generation ? ":generateContent" : ""}` : ""}`);
  if (!model) { url.searchParams.set("pageSize", "1000"); if (input.pageToken) url.searchParams.set("pageToken", input.pageToken); }
  const timeoutMs = Math.max(1_000, Math.min(120_000, input.timeoutMs || 20_000));
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      method: input.generation ? "POST" : "GET", redirect: "error", cache: "no-store",
      headers: { "content-type": "application/json", "x-goog-api-client": "meras-ai/1.1", "x-goog-api-key": apiKey },
      ...(input.generation ? { body: JSON.stringify(input.generation) } : {}), signal,
    });
  } catch { throw new GeminiProviderError(signal.aborted ? 408 : 503, signal.aborted ? "AI_PROVIDER_TIMEOUT" : "AI_PROVIDER_UNAVAILABLE", true); }
  let payload: Record<string, unknown>;
  try { payload = await readProviderJson(response); }
  catch (error) {
    if (!response.ok) throw classifyGeminiError(response.status, {}, response.headers.get("retry-after"));
    if (signal.aborted) throw new GeminiProviderError(408, "AI_PROVIDER_TIMEOUT");
    if (error instanceof GeminiProviderError) throw error;
    throw new GeminiProviderError(502, "AI_PROVIDER_INVALID_RESPONSE");
  }
  if (!response.ok) throw classifyGeminiError(response.status, payload, response.headers.get("retry-after"));
  return payload;
}

export function geminiTextResponse(payload: Record<string, unknown>) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const first = candidates[0] && typeof candidates[0] === "object" ? candidates[0] as Record<string, unknown> : {};
  const content = first.content && typeof first.content === "object" ? first.content as Record<string, unknown> : {};
  const parts = Array.isArray(content.parts) ? content.parts : [];
  // Internal thought parts are not the model's final answer.
  const text = parts.flatMap(part => part && typeof part === "object" && part.thought !== true && typeof part.text === "string" ? [part.text] : []).join("\n").trim();
  const finishReason = typeof first.finishReason === "string" ? first.finishReason : null;
  const feedback = payload.promptFeedback && typeof payload.promptFeedback === "object" ? payload.promptFeedback as Record<string, unknown> : {};
  if (feedback.blockReason || ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"].includes(finishReason || "")) throw new GeminiProviderError(422, "AI_CONTENT_BLOCKED");
  if (!text) throw new GeminiProviderError(422, finishReason === "MAX_TOKENS" ? "AI_OUTPUT_TOKEN_LIMIT" : "AI_EMPTY_RESPONSE");
  return { text, finishReason };
}

export async function listGeminiModels(apiKey: string) {
  const models = new Map<string, GeminiModelOption>();
  const deadline = Date.now() + 25_000;
  let pageToken: string | undefined;
  for (let page = 0; page < 3; page++) {
    const payload = await requestGemini({ apiKey, pageToken, timeoutMs: Math.max(1_000, deadline - Date.now()) });
    if (!Array.isArray(payload.models)) throw new GeminiProviderError(502, "AI_PROVIDER_INVALID_RESPONSE");
    for (const value of payload.models) { const model = geminiModelOption(value); if (model) models.set(model.id, model); }
    pageToken = typeof payload.nextPageToken === "string" && payload.nextPageToken.length <= 2048 ? payload.nextPageToken : undefined;
    if (!pageToken || Date.now() >= deadline) break;
  }
  return { models: [...models.values()].sort((a, b) => a.id.localeCompare(b.id)), hasMore: Boolean(pageToken) };
}

export async function testGeminiConnection(apiKey: string, model: string, generate = false) {
  const metadata = geminiModelOption(await requestGemini({ apiKey, model }));
  if (!metadata) throw new GeminiProviderError(422, "AI_MODEL_UNSUPPORTED");
  if (!generate) return { model: metadata, generationVerified: false, message: "نجح الاتصال بالمفتاح والوصول إلى بيانات النموذج. هذا الفحص لا يثبت توفر حصة التوليد؛ استخدم اختبار الإجابة للتحقق منها." };
  const payload = await requestGemini({ apiKey, model: metadata.id, generation: { contents: [{ role: "user", parts: [{ text: "Reply with OK only." }] }], generationConfig: { maxOutputTokens: Math.min(1024, metadata.outputTokenLimit || 1024) } }, timeoutMs: 30_000 });
  geminiTextResponse(payload);
  return { model: metadata, generationVerified: true, message: "نجح الاتصال وتوليد إجابة تجريبية قصيرة بهذا المفتاح والنموذج." };
}
