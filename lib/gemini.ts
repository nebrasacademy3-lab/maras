import "server-only";
import { acquireAiProviderSlot, deferAiProvider } from "@/lib/ai-work-control";
import { reserveAiPaidBudget } from "@/lib/ai-paid-budget";
import { asc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb } from "@/db";
import { aiApiKeys } from "@/db/schema";
import { decryptAiApiKey, geminiEnvironmentKeyGroups, geminiProjectTier } from "@/lib/ai-keys";
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
    try { return [{ id: row.id, apiKey: decryptAiApiKey(row.encryptedKey), fingerprint: row.fingerprint, priority: row.priority, lastUsedAt: row.lastUsedAt, source: "database" as const, tier: geminiProjectTier(row.projectLabel) }]; }
    catch { decryptionFailures += 1; return []; }
  });
  const groups = geminiEnvironmentKeyGroups();
  const environment: KeyCandidate[] = [
    ...groups.free.map((apiKey, index) => { const fingerprint = rawFingerprint(apiKey); const state = environmentCooldowns.get(fingerprint); return state && state.until > now ? null : { id: null, apiKey, fingerprint, priority: 1_000 + index, lastUsedAt: state?.lastUsedAt || null, source: "environment" as const, tier: "free" as const }; }).filter((candidate): candidate is KeyCandidate => Boolean(candidate)),
    ...groups.paid.map((apiKey, index) => { const fingerprint = rawFingerprint(apiKey); const state = environmentCooldowns.get(fingerprint); return state && state.until > now ? null : { id: null, apiKey, fingerprint, priority: 2_000 + index, lastUsedAt: state?.lastUsedAt || null, source: "environment" as const, tier: "paid" as const }; }).filter((candidate): candidate is KeyCandidate => Boolean(candidate)),
  ];
  const unique = new Map<string, KeyCandidate>();
  for (const candidate of [...database, ...environment]) if (!unique.has(candidate.fingerprint)) unique.set(candidate.fingerprint, candidate);
  if (!unique.size && decryptionFailures) throw new AiPlatformError("AI_KEY_DECRYPTION_FAILED", "تعذر فك مفاتيح الخدمة المحفوظة. راجع إعداد تشفير المفاتيح في الخادم من إدارة أدوات مراس.", 503);
  if (!unique.size && storeUnavailable) throw new AiPlatformError("AI_KEY_STORE_UNAVAILABLE", "تعذر تحميل مفاتيح الخدمة من قاعدة البيانات. حاول بعد قليل.", 503);
  return [...unique.values()].sort((left, right) => left.tier.localeCompare(right.tier) || left.priority - right.priority || Date.parse(left.lastUsedAt || "1970-01-01") - Date.parse(right.lastUsedAt || "1970-01-01"));
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
  const freeCandidates = candidatePool.filter((candidate) => candidate.tier === "free");
  const paidCandidates = candidatePool.filter((candidate) => candidate.tier === "paid");
  const overallTimeoutMs = boundedRuntimeMs(process.env.AI_GEMINI_OVERALL_TIMEOUT_MS, 85_000, 15_000, 120_000);
  const attemptTimeoutMs = boundedRuntimeMs(process.env.AI_GEMINI_ATTEMPT_TIMEOUT_MS, 35_000, 5_000, 60_000);
  const deadline = Date.now() + overallTimeoutMs;
  let lastError = new GeminiProviderError(503, "AI_PROVIDER_UNAVAILABLE");
  const releaseProvider = await acquireAiProviderSlot();
  try {
    const attempt = async (candidate: KeyCandidate, tier: "free" | "paid", budgetSar?: number) => {
      const remainingMs = deadline - Date.now();
      if (remainingMs < 1_000) return { result: null as GeminiResult | null, quotaExhausted: false };
      const generationConfig: Record<string, unknown> = { temperature: input.config.temperature, maxOutputTokens: input.config.maxOutputTokens };
      if (input.responseSchema) { generationConfig.responseMimeType = "application/json"; generationConfig.responseSchema = input.responseSchema; }
      let payload: Record<string, unknown>;
      let output: ReturnType<typeof geminiTextResponse>;
      try {
        payload = await requestGemini({ apiKey: candidate.apiKey, model, generation: { systemInstruction: { parts: [{ text: input.systemInstruction }] }, contents: input.contents, generationConfig }, timeoutMs: Math.min(attemptTimeoutMs, remainingMs) });
        output = geminiTextResponse(payload);
      } catch (error) {
        if (!(error instanceof GeminiProviderError)) throw error;
        lastError = error;
        await markFailure(candidate, error);
        if (error.providerStatus === 429) {
          await deferAiProvider(error.retryAfterSeconds || (error.code === "AI_QUOTA_EXHAUSTED" ? 3600 : 60));
          if (tier === "free" && error.code === "AI_QUOTA_EXHAUSTED") return { result: null, quotaExhausted: true };
          throw error;
        }
        if (error.retryable) return { result: null, quotaExhausted: false };
        throw error;
      }
      await markSuccess(candidate);
      const usage = payload.usageMetadata && typeof payload.usageMetadata === "object" ? payload.usageMetadata as Record<string, unknown> : {};
      return { result: { text: output.text, model, keyId: candidate.id, inputTokens: Math.max(0, Number(usage.promptTokenCount) || 0), outputTokens: Math.max(0, Number(usage.candidatesTokenCount) || 0), finishReason: output.finishReason, providerTier: tier, ...(budgetSar === undefined ? {} : { paidBudgetSar: budgetSar }) }, quotaExhausted: false };
    };

    let freeAttempts = 0;
    let freeQuotaFailures = 0;
    for (const candidate of freeCandidates.slice(0, maxAttempts)) {
      freeAttempts += 1;
      const outcome = await attempt(candidate, "free");
      if (outcome.result) return outcome.result;
      if (outcome.quotaExhausted) freeQuotaFailures += 1;
    }
    const allEligibleFreeExhausted = freeCandidates.length > 0 && freeCandidates.length <= maxAttempts && freeAttempts === freeCandidates.length && freeQuotaFailures === freeCandidates.length;
    if (!allEligibleFreeExhausted || !paidCandidates.length) throw lastError;

    for (const candidate of paidCandidates.slice(0, maxAttempts)) {
      const reservation = await reserveAiPaidBudget(`gemini:${crypto.randomUUID()}`);
      const outcome = await attempt(candidate, "paid", reservation.reservedSar);
      if (outcome.result) return outcome.result;
    }
    throw lastError;
  } finally { await releaseProvider().catch(() => undefined); }
}
