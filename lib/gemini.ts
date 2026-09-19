import "server-only";
import { geminiProjectIdentities, requireGeminiPaidPricing } from "@/lib/gemini-project-admission";
import { acquireAiProviderSlot, deferAiProvider, AiBusyError } from "@/lib/ai-work-control";
import { reserveAiPaidBudget } from "@/lib/ai-paid-budget";
import { and, asc, eq, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { getDb } from "@/db";
import { aiApiKeys } from "@/db/schema";
import { decryptAiApiKey, geminiEnvironmentKeys } from "@/lib/ai-keys";
import { AiPlatformError, type AiServiceConfig } from "@/lib/ai-platform";
import { normalizeGeminiModel } from "@/lib/gemini-config";
import { GeminiProviderError } from "@/lib/gemini-errors";
import { geminiTextResponse, requestGemini } from "@/lib/gemini-provider";

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };
type KeyCandidate = {
  id: number | null;
  apiKey: string;
  fingerprint: string;
  priority: number;
  lastUsedAt: string | null;
  source: "database" | "environment";
  tier: "free" | "paid";
  projectNumber: string;
  updatedAt: string | null;
};

export type GeminiResult = {
  text: string;
  model: string;
  keyId: number | null;
  inputTokens: number;
  outputTokens: number;
  finishReason: string | null;
  providerTier: "free" | "paid";
  paidBudgetSar?: number;
};

const environmentCooldowns = new Map<string, { until: number; failures: number; lastUsedAt: string }>();
const DEFAULT_MAX_KEY_ATTEMPTS = 10;
const dispatchOrder = new Map<string, number>();
let dispatchSequence = 0;

function rawFingerprint(apiKey: string) {
  return createHash("sha256").update("meras-ai-key:v1:" + apiKey).digest("hex");
}

function environmentKeyGroups() {
  const all = geminiEnvironmentKeys();
  const paid = geminiEnvironmentKeys({
    GEMINI_PAID_API_KEYS: process.env.GEMINI_PAID_API_KEYS,
    GEMINI_PAID_API_KEY: process.env.GEMINI_PAID_API_KEY,
  });
  const paidSet = new Set(paid);
  return { free: all.filter((key) => !paidSet.has(key)), paid };
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
  dispatchOrder.set(candidate.fingerprint, ++dispatchSequence);
  const memory = environmentCooldowns.get(candidate.fingerprint);
  const failures = (memory?.failures || 0) + 1;
  const delay = Math.max(retryDelayMs(error.providerStatus, failures), (error.retryAfterSeconds || 0) * 1000);
  const cooldownUntil = error.retryable ? new Date(now.getTime() + delay).toISOString() : null;
  environmentCooldowns.set(candidate.fingerprint, { until: error.invalidCredential ? Infinity : cooldownUntil ? Date.parse(cooldownUntil) : 0, failures, lastUsedAt: now.toISOString() });
  if (candidate.id) {
    const databaseStatus = error.invalidCredential ? "error" : "active";
    await getDb().update(aiApiKeys).set({
      status: databaseStatus,
      cooldownUntil,
      consecutiveFailures: failures,
      lastUsedAt: now.toISOString(),
      lastErrorCode: error.code,
      updatedAt: now.toISOString(),
    }).where(and(
      eq(aiApiKeys.id, candidate.id), eq(aiApiKeys.status, "active"),
      eq(aiApiKeys.fingerprint, candidate.fingerprint),
      candidate.updatedAt ? eq(aiApiKeys.updatedAt, candidate.updatedAt) : undefined,
    )).catch(() => undefined);
  }
}

async function markSuccess(candidate: KeyCandidate) {
  const now = new Date().toISOString();
  dispatchOrder.set(candidate.fingerprint, ++dispatchSequence);
  environmentCooldowns.set(candidate.fingerprint, { until: 0, failures: 0, lastUsedAt: now });
  if (candidate.id) {
    await getDb().update(aiApiKeys).set({
      status: "active",
      cooldownUntil: null,
      consecutiveFailures: 0,
      lastUsedAt: now,
      lastSuccessAt: now,
      lastErrorCode: null,
      updatedAt: now,
    }).where(and(
      eq(aiApiKeys.id, candidate.id), eq(aiApiKeys.status, "active"),
      eq(aiApiKeys.fingerprint, candidate.fingerprint),
      candidate.updatedAt ? eq(aiApiKeys.updatedAt, candidate.updatedAt) : undefined,
    )).catch(() => undefined);
  }
}

async function keyCandidates() {
  const now = Date.now();
  let databaseRows: Array<typeof aiApiKeys.$inferSelect>;
  try {
    // Include inactive registrations so environment duplicates cannot resurrect them.
    databaseRows = await getDb().select().from(aiApiKeys).where(sql`true`).orderBy(asc(aiApiKeys.lastUsedAt), asc(aiApiKeys.priority));
  } catch {
    throw new AiPlatformError("AI_KEY_STORE_UNAVAILABLE", "تعذر تحميل مفاتيح الخدمة من قاعدة البيانات. حاول بعد قليل.", 503);
  }
  const groups = environmentKeyGroups();
  const identities = await geminiProjectIdentities();
  // Environment paid labels can only RESTRICT an otherwise verified free key.
  // Neither labels nor variable names can establish a free classification.
  const paidFingerprints = new Set(groups.paid.map(rawFingerprint));
  const registered = new Set(databaseRows.map(row => row.fingerprint));
  const freeMembership = new Set<string>();
  const unique = new Map<string, KeyCandidate>();
  let decryptionFailures = 0;
  for (const row of databaseRows) {
    if (row.status === "disabled") continue;
    const identity = identities.get(row.fingerprint);
    if (!identity) { freeMembership.add("unverified:" + row.fingerprint); continue; }
    const tier = paidFingerprints.has(row.fingerprint) ? "paid" as const : identity.tier;
    // Unknown/error/cooling resources remain in the proof set, not the ready queue.
    if (tier === "free") freeMembership.add(identity.projectNumber);
    if (row.status !== "active" || (row.cooldownUntil && Date.parse(row.cooldownUntil) > now)) continue;
    const memory = environmentCooldowns.get(row.fingerprint);
    if (memory && memory.until > now) continue;
    try {
      unique.set(row.fingerprint, {
        id: row.id, apiKey: decryptAiApiKey(row.encryptedKey), fingerprint: row.fingerprint,
        priority: row.priority, lastUsedAt: row.lastUsedAt, source: "database", tier, projectNumber: identity.projectNumber, updatedAt: row.updatedAt,
      });
    } catch { decryptionFailures += 1; }
  }
  for (const [index, apiKey] of [...groups.free, ...groups.paid].entries()) {
    const fingerprint = rawFingerprint(apiKey);
    if (registered.has(fingerprint)) continue;
    const identity = identities.get(fingerprint);
    if (!identity) { freeMembership.add("unverified:" + fingerprint); continue; }
    const tier = paidFingerprints.has(fingerprint) ? "paid" as const : identity.tier;
    if (tier === "free") freeMembership.add(identity.projectNumber);
    const memory = environmentCooldowns.get(fingerprint);
    if (memory && memory.until > now) continue;
    unique.set(fingerprint, {
      id: null, apiKey, fingerprint, priority: 1_000 + index,
      lastUsedAt: memory?.lastUsedAt || null, source: "environment", tier, projectNumber: identity.projectNumber, updatedAt: null,
    });
  }
  if (!unique.size && decryptionFailures) throw new AiPlatformError("AI_KEY_DECRYPTION_FAILED", "تعذر فك مفاتيح الخدمة المحفوظة. راجع إعداد تشفير المفاتيح في الخادم من إدارة أدوات مراس.", 503);
  const candidates = [...unique.values()].sort((left, right) =>
    left.tier.localeCompare(right.tier)
    || Date.parse(left.lastUsedAt || "1970-01-01") - Date.parse(right.lastUsedAt || "1970-01-01")
    || (dispatchOrder.get(left.fingerprint) || 0) - (dispatchOrder.get(right.fingerprint) || 0)
    || left.priority - right.priority);
  const projects = new Set<string>();
  return { candidates: candidates.filter(c => { if (projects.has(c.projectNumber)) return false; projects.add(c.projectNumber); return true; }), freeMembership };
}

export async function generateGeminiContent(input: {
  config: AiServiceConfig;
  contents: GeminiContent[];
  systemInstruction: string;
  responseSchema?: Record<string, unknown>;
  allowPaidFallback?: boolean;
  timeoutMs?: number;
}): Promise<GeminiResult> {
  const model = normalizeGeminiModel(input.config.model);
  if (!model) throw new AiPlatformError("AI_MODEL_INVALID", "معرّف نموذج الخدمة غير صالح. راجع إعدادات الخدمة في الإدارة.");
  const overallTimeoutMs = boundedRuntimeMs(process.env.AI_GEMINI_OVERALL_TIMEOUT_MS, 85_000, 15_000, 120_000);
  const timeoutMs = input.timeoutMs ?? overallTimeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000) throw new AiPlatformError("AI_TIMEOUT_INVALID", "مهلة طلب الخدمة غير صالحة.");
  const deadline = Date.now() + Math.min(timeoutMs, overallTimeoutMs);
  const pool = await keyCandidates();
  const candidatePool = pool.candidates;
  const maxAttempts = boundedRuntimeMs(process.env.AI_GEMINI_MAX_KEY_ATTEMPTS, DEFAULT_MAX_KEY_ATTEMPTS, 1, 64);
  if (!candidatePool.length) throw new AiPlatformError("AI_PROVIDER_UNAVAILABLE", "لا يوجد مزود الخدمة متاح الآن. حاول بعد قليل.", 503);
  const freeCandidates = candidatePool.filter((candidate) => candidate.tier === "free");
  const paidCandidates = candidatePool.filter((candidate) => candidate.tier === "paid");
  const attemptTimeoutMs = boundedRuntimeMs(process.env.AI_GEMINI_ATTEMPT_TIMEOUT_MS, 35_000, 5_000, 60_000);
  let lastError: AiPlatformError = new GeminiProviderError(503, "AI_PROVIDER_UNAVAILABLE");
  const releaseProvider = await acquireAiProviderSlot();
  try {
    const attempt = async (candidate: KeyCandidate, tier: "free" | "paid", budgetSar?: number) => {
      const remainingMs = deadline - Date.now();
      if (remainingMs < 1_000) return { result: null as GeminiResult | null, quotaExhausted: false };
      const generationConfig: Record<string, unknown> = { temperature: input.config.temperature, maxOutputTokens: input.config.maxOutputTokens };
      if (input.responseSchema) {
        generationConfig.responseMimeType = "application/json";
        // Callers provide JSON Schema (including nullable unions and
        // additionalProperties), not Google's separate OpenAPI Schema message.
        generationConfig.responseJsonSchema = input.responseSchema;
      }
      let payload: Record<string, unknown>;
      let output: ReturnType<typeof geminiTextResponse>;
      try {
        payload = await requestGemini({
          apiKey: candidate.apiKey,
          model,
          generation: {
            systemInstruction: { parts: [{ text: input.systemInstruction }] },
            contents: input.contents,
            generationConfig,
          },
          timeoutMs: Math.min(attemptTimeoutMs, remainingMs),
        });
        output = geminiTextResponse(payload);
      } catch (error) {
        if (error instanceof AiBusyError) { lastError = error; return { result: null, quotaExhausted: false }; }
        if (!(error instanceof GeminiProviderError)) throw error;
        lastError = error;
        await markFailure(candidate, error);
        if (error.providerStatus === 429) {
          if (tier === "free" && error.code === "AI_QUOTA_EXHAUSTED") return { result: null, quotaExhausted: true };
          await deferAiProvider(error.retryAfterSeconds || (error.code === "AI_QUOTA_EXHAUSTED" ? 3600 : 60));
          throw error;
        }
        if (error.retryable) return { result: null, quotaExhausted: false };
        throw error;
      }
      await markSuccess(candidate);
      const usage = payload.usageMetadata && typeof payload.usageMetadata === "object" ? payload.usageMetadata as Record<string, unknown> : {};
      return {
        result: {
          text: output.text,
          model,
          keyId: candidate.id,
          inputTokens: Math.max(0, Number(usage.promptTokenCount) || 0),
          outputTokens: Math.max(0, Number(usage.candidatesTokenCount) || 0),
          finishReason: output.finishReason,
          providerTier: tier,
          ...(budgetSar === undefined ? {} : { paidBudgetSar: budgetSar }),
        },
        quotaExhausted: false,
      };
    };

    let freeAttempts = 0;
    let freeQuotaFailures = 0;
    for (const candidate of freeCandidates.slice(0, maxAttempts)) {
      freeAttempts += 1;
      const outcome = await attempt(candidate, "free");
      if (outcome.result) return outcome.result;
      if (outcome.quotaExhausted) freeQuotaFailures += 1;
    }
    const allEligibleFreeExhausted = pool.freeMembership.size > 0
      && freeCandidates.length === pool.freeMembership.size
      && freeCandidates.length <= maxAttempts
      && freeAttempts === freeCandidates.length
      && freeQuotaFailures === freeCandidates.length;
    if (input.allowPaidFallback === false || !allEligibleFreeExhausted || !paidCandidates.length) throw lastError;

    const assertFreshPaidEligibility = async (candidate: KeyCandidate) => {
      const fresh = await keyCandidates();
      const unchanged = fresh.freeMembership.size === pool.freeMembership.size
        && [...pool.freeMembership].every(project => fresh.freeMembership.has(project)
          && freeCandidates.some(key => key.projectNumber === project && (environmentCooldowns.get(key.fingerprint)?.until || 0) > Date.now()));
      if (!unchanged || fresh.candidates.some(key => key.tier === "free")
        || !fresh.candidates.some(key => key.tier === "paid" && key.fingerprint === candidate.fingerprint && key.id === candidate.id)) {
        throw new AiPlatformError("AI_FREE_POOL_CHANGED", "تغيّرت حالة موارد الخدمة. أعد المحاولة بعد قليل.", 429);
      }
    };
    for (const candidate of paidCandidates.slice(0, maxAttempts)) {
      if (deadline - Date.now() < 1_000) throw lastError;
      await assertFreshPaidEligibility(candidate);
      requireGeminiPaidPricing();
      const reservation = await reserveAiPaidBudget("gemini:" + randomUUID());
      await assertFreshPaidEligibility(candidate);
      const outcome = await attempt(candidate, "paid", reservation.reservedSar);
      if (outcome.result) return outcome.result;
    }
    throw lastError;
  } finally {
    await releaseProvider().catch(() => undefined);
  }
}
