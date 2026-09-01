import "server-only";
import { asc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb } from "@/db";
import { aiApiKeys } from "@/db/schema";
import { decryptAiApiKey, validGeminiApiKey } from "@/lib/ai-keys";
import { AiPlatformError, type AiServiceConfig } from "@/lib/ai-platform";

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };
type KeyCandidate = { id: number | null; apiKey: string; fingerprint: string; priority: number; lastUsedAt: string | null; source: "database" | "environment" };

export type GeminiResult = {
  text: string;
  model: string;
  keyId: number | null;
  inputTokens: number;
  outputTokens: number;
  finishReason: string | null;
};

const environmentCooldowns = new Map<string, { until: number; failures: number; lastUsedAt: string }>();
const DEFAULT_MAX_KEY_ATTEMPTS = 3;

function envApiKeys() {
  const raw = [process.env.GEMINI_API_KEYS, process.env.GEMINI_API_KEY].filter(Boolean).join(",");
  const values: string[] = [];
  try {
    const parsed = JSON.parse(process.env.GEMINI_API_KEYS || "null") as unknown;
    if (Array.isArray(parsed)) values.push(...parsed.filter((value): value is string => typeof value === "string"));
  } catch { /* Comma/newline parsing below handles ordinary environment values. */ }
  values.push(...raw.split(/[\r\n,;]+/));
  return [...new Set(values.map(validGeminiApiKey).filter(Boolean))];
}

function rawFingerprint(apiKey: string) {
  return createHash("sha256").update(`meras-ai-key:v1:${apiKey}`).digest("hex");
}

async function keyCandidates() {
  const now = Date.now();
  let databaseRows: Array<typeof aiApiKeys.$inferSelect> = [];
  try { databaseRows = await getDb().select().from(aiApiKeys).where(eq(aiApiKeys.status, "active")).orderBy(asc(aiApiKeys.priority), asc(aiApiKeys.lastUsedAt)); } catch { /* Environment keys can operate during a staged database rollout. */ }
  const database: KeyCandidate[] = databaseRows.flatMap((row) => {
    if (row.cooldownUntil && Date.parse(row.cooldownUntil) > now) return [];
    try { return [{ id: row.id, apiKey: decryptAiApiKey(row.encryptedKey), fingerprint: row.fingerprint, priority: row.priority, lastUsedAt: row.lastUsedAt, source: "database" as const }]; }
    catch { return []; }
  });
  const environment: KeyCandidate[] = envApiKeys().flatMap((apiKey, index) => {
    const fingerprint = rawFingerprint(apiKey);
    const state = environmentCooldowns.get(fingerprint);
    if (state && state.until > now) return [];
    return [{ id: null, apiKey, fingerprint, priority: 1_000 + index, lastUsedAt: state?.lastUsedAt || null, source: "environment" as const }];
  });
  const unique = new Map<string, KeyCandidate>();
  for (const candidate of [...database, ...environment]) if (!unique.has(candidate.fingerprint)) unique.set(candidate.fingerprint, candidate);
  return [...unique.values()].sort((left, right) => left.priority - right.priority || Date.parse(left.lastUsedAt || "1970-01-01") - Date.parse(right.lastUsedAt || "1970-01-01"));
}

function retryDelayMs(status: number, failures: number) {
  const base = status === 429 ? 60_000 : status === 408 ? 5_000 : 15_000;
  return Math.min(10 * 60_000, base * (2 ** Math.min(5, Math.max(0, failures - 1)))) + Math.floor(Math.random() * 1_500);
}

function boundedRuntimeMs(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.floor(parsed))) : fallback;
}

async function markFailure(candidate: KeyCandidate, status: number) {
  const now = new Date();
  const memory = environmentCooldowns.get(candidate.fingerprint);
  const failures = (memory?.failures || 0) + 1;
  const cooldownUntil = new Date(now.getTime() + retryDelayMs(status, failures)).toISOString();
  environmentCooldowns.set(candidate.fingerprint, { until: Date.parse(cooldownUntil), failures, lastUsedAt: now.toISOString() });
  if (candidate.id) {
    const databaseStatus = status === 401 || status === 403 ? "error" : "active";
    await getDb().update(aiApiKeys).set({ status: databaseStatus, cooldownUntil, consecutiveFailures: failures, lastUsedAt: now.toISOString(), lastErrorCode: `HTTP_${status}`, updatedAt: now.toISOString() }).where(eq(aiApiKeys.id, candidate.id)).catch(() => undefined);
  }
}

async function markSuccess(candidate: KeyCandidate) {
  const now = new Date().toISOString();
  environmentCooldowns.set(candidate.fingerprint, { until: 0, failures: 0, lastUsedAt: now });
  if (candidate.id) await getDb().update(aiApiKeys).set({ status: "active", cooldownUntil: null, consecutiveFailures: 0, lastUsedAt: now, lastSuccessAt: now, lastErrorCode: null, updatedAt: now }).where(eq(aiApiKeys.id, candidate.id)).catch(() => undefined);
}

function textFromResponse(payload: Record<string, unknown>) {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const first = candidates[0] as Record<string, unknown> | undefined;
  const content = first?.content && typeof first.content === "object" ? first.content as Record<string, unknown> : null;
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const text = parts.flatMap((part) => part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string" ? [(part as Record<string, unknown>).text as string] : []).join("\n").trim();
  return { text, finishReason: typeof first?.finishReason === "string" ? first.finishReason : null };
}

export async function generateGeminiContent(input: {
  config: AiServiceConfig;
  contents: GeminiContent[];
  systemInstruction: string;
  responseSchema?: Record<string, unknown>;
}): Promise<GeminiResult> {
  const candidatePool = await keyCandidates();
  const maxAttempts = boundedRuntimeMs(process.env.AI_GEMINI_MAX_KEY_ATTEMPTS, DEFAULT_MAX_KEY_ATTEMPTS, 1, 5);
  const candidates = candidatePool.slice(0, maxAttempts);
  if (!candidates.length) throw new AiPlatformError("AI_PROVIDER_UNAVAILABLE", "لا يوجد مزود AI متاح الآن. حاول بعد قليل.", 503);
  const overallTimeoutMs = boundedRuntimeMs(process.env.AI_GEMINI_OVERALL_TIMEOUT_MS, 85_000, 15_000, 120_000);
  const attemptTimeoutMs = boundedRuntimeMs(process.env.AI_GEMINI_ATTEMPT_TIMEOUT_MS, 35_000, 5_000, 60_000);
  const deadline = Date.now() + overallTimeoutMs;
  let lastStatus = 503;
  for (const candidate of candidates) {
    const remainingMs = deadline - Date.now();
    if (remainingMs < 1_000) break;
    const generationConfig: Record<string, unknown> = {
      temperature: input.config.temperature,
      maxOutputTokens: input.config.maxOutputTokens,
    };
    if (input.responseSchema) {
      generationConfig.responseMimeType = "application/json";
      generationConfig.responseSchema = input.responseSchema;
    }
    let response: Response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.config.model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-client": "meras-ai/1.0", "x-goog-api-key": candidate.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.systemInstruction }] },
          contents: input.contents,
          generationConfig,
        }),
        signal: AbortSignal.timeout(Math.min(attemptTimeoutMs, remainingMs)),
      });
    } catch {
      lastStatus = 503;
      await markFailure(candidate, 503);
      continue;
    }
    lastStatus = response.status;
    if (!response.ok) {
      await response.text().catch(() => "");
      const canTryAnotherKey = response.status === 408 || response.status === 429 || response.status === 401 || response.status === 403 || response.status >= 500;
      if (canTryAnotherKey) { await markFailure(candidate, response.status); continue; }
      throw new AiPlatformError("AI_PROVIDER_REQUEST_REJECTED", "تعذر معالجة الطلب بصيغته الحالية. جرّب ملفًا أصغر أو صدّر الشرائح بصيغة PDF.", response.status === 400 ? 422 : 502);
    }
    const payload = await response.json() as Record<string, unknown>;
    const output = textFromResponse(payload);
    if (!output.text) throw new AiPlatformError("AI_EMPTY_RESPONSE", "لم يتمكن المساعد من إنشاء إجابة آمنة لهذا الطلب.", 422);
    await markSuccess(candidate);
    const usage = payload.usageMetadata && typeof payload.usageMetadata === "object" ? payload.usageMetadata as Record<string, unknown> : {};
    return {
      text: output.text,
      model: input.config.model,
      keyId: candidate.id,
      inputTokens: Math.max(0, Number(usage.promptTokenCount) || 0),
      outputTokens: Math.max(0, Number(usage.candidatesTokenCount) || 0),
      finishReason: output.finishReason,
    };
  }
  throw new AiPlatformError(lastStatus === 429 ? "AI_RATE_LIMITED" : "AI_PROVIDER_UNAVAILABLE", lastStatus === 429 ? "وصل مزود AI إلى حد الاستخدام مؤقتًا. انتظر قليلًا ثم أعد المحاولة." : "خدمة AI غير متاحة مؤقتًا. حاول بعد قليل.", lastStatus === 429 ? 429 : 503);
}
