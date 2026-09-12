import "server-only";
import { asc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb } from "@/db";
import { aiApiKeys } from "@/db/schema";
import { decryptAiApiKey, geminiEnvironmentKeys } from "@/lib/ai-keys";
import { AiPlatformError, type AiServiceConfig } from "@/lib/ai-platform";
import { normalizeGeminiModel } from "@/lib/gemini-config";
import { GeminiProviderError } from "@/lib/gemini-errors";
import { geminiTextResponse, requestGemini } from "@/lib/gemini-provider";

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

function rawFingerprint(apiKey: string) {
  return createHash("sha256").update(`meras-ai-key:v1:${apiKey}`).digest("hex");
}

async function keyCandidates() {
  const now = Date.now();
  let databaseRows: Array<typeof aiApiKeys.$inferSelect> = [];
  let storeUnavailable = false;
  let decryptionFailures = 0;
  try { databaseRows = await getDb().select().from(aiApiKeys).where(eq(aiApiKeys.status, "active")).orderBy(asc(aiApiKeys.priority), asc(aiApiKeys.lastUsedAt)); } catch { storeUnavailable = true; }
  const database: KeyCandidate[] = databaseRows.flatMap((row) => {
    if (row.cooldownUntil && Date.parse(row.cooldownUntil) > now) return [];
    try { return [{ id: row.id, apiKey: decryptAiApiKey(row.encryptedKey), fingerprint: row.fingerprint, priority: row.priority, lastUsedAt: row.lastUsedAt, source: "database" as const }]; }
    catch { decryptionFailures += 1; return []; }
  });
  const environment: KeyCandidate[] = geminiEnvironmentKeys().flatMap((apiKey, index) => {
    const fingerprint = rawFingerprint(apiKey);
    const state = environmentCooldowns.get(fingerprint);
    if (state && state.until > now) return [];
    return [{ id: null, apiKey, fingerprint, priority: 1_000 + index, lastUsedAt: state?.lastUsedAt || null, source: "environment" as const }];
  });
  const unique = new Map<string, KeyCandidate>();
  for (const candidate of [...database, ...environment]) if (!unique.has(candidate.fingerprint)) unique.set(candidate.fingerprint, candidate);
  if (!unique.size && decryptionFailures) throw new AiPlatformError("AI_KEY_DECRYPTION_FAILED", "تعذر فك مفاتيح الخدمة المحفوظة. راجع إعداد تشفير المفاتيح في الخادم من إدارة أدوات مراس.", 503);
  if (!unique.size && storeUnavailable) throw new AiPlatformError("AI_KEY_STORE_UNAVAILABLE", "تعذر تحميل مفاتيح الخدمة من قاعدة البيانات. حاول بعد قليل.", 503);
  return [...unique.values()].sort((left, right) => left.priority - right.priority || Date.parse(left.lastUsedAt || "1970-01-01") - Date.parse(right.lastUsedAt || "1970-01-01"));
}

function retryDelayMs(status: number, failures: number) {
  const base = status === 429 ? 60_000 : status === 408 ? 5_000 : 15_000;
  return Math.min(10 * 60_000, base * (2 ** Math.min(5, Math.max(0, failures - 1)))) + Math.floor(Math.random() * 1_500);
}

function boundedRuntimeMs(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.floor(parsed))) : fallback;
}

async function markFailure(candidate: KeyCandidate, error: GeminiProviderError) {
  const now = new Date();
  const memory = environmentCooldowns.get(candidate.fingerprint);
  const failures = (memory?.failures || 0) + 1;
  const delay = Math.max(retryDelayMs(error.providerStatus, failures), (error.retryAfterSeconds || 0) * 1000);
  const cooldownUntil = error.retryable ? new Date(now.getTime() + delay).toISOString() : null;
  environmentCooldowns.set(candidate.fingerprint, { until: cooldownUntil ? Date.parse(cooldownUntil) : 0, failures, lastUsedAt: now.toISOString() });
  if (candidate.id) {
    // Permission/quota/model errors do not prove the credential is invalid.
    const databaseStatus = error.invalidCredential ? "error" : "active";
    await getDb().update(aiApiKeys).set({ status: databaseStatus, cooldownUntil, consecutiveFailures: failures, lastUsedAt: now.toISOString(), lastErrorCode: error.code, updatedAt: now.toISOString() }).where(eq(aiApiKeys.id, candidate.id)).catch(() => undefined);
  }
}

async function markSuccess(candidate: KeyCandidate) {
  const now = new Date().toISOString();
  environmentCooldowns.set(candidate.fingerprint, { until: 0, failures: 0, lastUsedAt: now });
  if (candidate.id) await getDb().update(aiApiKeys).set({ status: "active", cooldownUntil: null, consecutiveFailures: 0, lastUsedAt: now, lastSuccessAt: now, lastErrorCode: null, updatedAt: now }).where(eq(aiApiKeys.id, candidate.id)).catch(() => undefined);
}

export async function generateGeminiContent(input: {
  config: AiServiceConfig;
  contents: GeminiContent[];
  systemInstruction: string;
  responseSchema?: Record<string, unknown>;
}): Promise<GeminiResult> {
  const model = normalizeGeminiModel(input.config.model);
  if (!model) throw new AiPlatformError("AI_MODEL_INVALID", "معرّف نموذج الخدمة غير صالح. راجع إعدادات الخدمة في الإدارة.");
  const candidatePool = await keyCandidates();
  const maxAttempts = boundedRuntimeMs(process.env.AI_GEMINI_MAX_KEY_ATTEMPTS, DEFAULT_MAX_KEY_ATTEMPTS, 1, 5);
  const candidates = candidatePool.slice(0, maxAttempts);
  if (!candidates.length) throw new AiPlatformError("AI_PROVIDER_UNAVAILABLE", "لا يوجد مزود الخدمة متاح الآن. حاول بعد قليل.", 503);
  const overallTimeoutMs = boundedRuntimeMs(process.env.AI_GEMINI_OVERALL_TIMEOUT_MS, 85_000, 15_000, 120_000);
  const attemptTimeoutMs = boundedRuntimeMs(process.env.AI_GEMINI_ATTEMPT_TIMEOUT_MS, 35_000, 5_000, 60_000);
  const deadline = Date.now() + overallTimeoutMs;
  let lastError = new GeminiProviderError(503, "AI_PROVIDER_UNAVAILABLE");
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
    let payload: Record<string, unknown>;
    let output: ReturnType<typeof geminiTextResponse>;
    try {
      payload = await requestGemini({ apiKey: candidate.apiKey, model, generation: {
        systemInstruction: { parts: [{ text: input.systemInstruction }] }, contents: input.contents, generationConfig,
      }, timeoutMs: Math.min(attemptTimeoutMs, remainingMs) });
      output = geminiTextResponse(payload);
    } catch (error) {
      if (!(error instanceof GeminiProviderError)) throw error;
      lastError = error;
      await markFailure(candidate, error);
      if (error.retryable) continue;
      throw error;
    }
    await markSuccess(candidate);
    const usage = payload.usageMetadata && typeof payload.usageMetadata === "object" ? payload.usageMetadata as Record<string, unknown> : {};
    return {
      text: output.text,
      model,
      keyId: candidate.id,
      inputTokens: Math.max(0, Number(usage.promptTokenCount) || 0),
      outputTokens: Math.max(0, Number(usage.candidatesTokenCount) || 0),
      finishReason: output.finishReason,
    };
  }
  throw lastError;
}
