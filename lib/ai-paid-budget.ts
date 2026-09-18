import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, platformSettings } from "@/db/schema";
import { AiPlatformError } from "@/lib/ai-platform";

const POLICY_KEY = "ai_paid_fallback_policy";
const LEDGER_KEY = "ai_paid_fallback_ledger";

export type AiPaidBudgetPolicy = {
  enabled: boolean;
  dailyCapSar: number;
  monthlyCapSar: number;
  perRequestCapSar: number;
  estimatedRequestSar: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

export const DEFAULT_AI_PAID_BUDGET_POLICY: AiPaidBudgetPolicy = {
  enabled: false,
  dailyCapSar: 0,
  monthlyCapSar: 0,
  perRequestCapSar: 0,
  estimatedRequestSar: 0,
  updatedAt: null,
  updatedBy: null,
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function boundedMoney(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(Math.max(0, Math.min(maximum, parsed)) * 100) / 100;
}

export function normalizeAiPaidBudgetPolicy(value: unknown, metadata: Pick<AiPaidBudgetPolicy, "updatedAt" | "updatedBy"> = { updatedAt: null, updatedBy: null }): AiPaidBudgetPolicy {
  const raw = record(value);
  return {
    enabled: raw.enabled === true,
    dailyCapSar: boundedMoney(raw.dailyCapSar, 0, 1_000_000),
    monthlyCapSar: boundedMoney(raw.monthlyCapSar, 0, 10_000_000),
    perRequestCapSar: boundedMoney(raw.perRequestCapSar, 0, 10_000),
    estimatedRequestSar: boundedMoney(raw.estimatedRequestSar, 0, 10_000),
    updatedAt: metadata.updatedAt || null,
    updatedBy: metadata.updatedBy || null,
  };
}

function parseJson(value: string | null | undefined) {
  if (!value) return {};
  try { return JSON.parse(value) as unknown; } catch { return {}; }
}

export async function getAiPaidBudgetPolicy() {
  try {
    const [row] = await getDb().select().from(platformSettings).where(eq(platformSettings.key, POLICY_KEY)).limit(1);
    if (!row) return { ...DEFAULT_AI_PAID_BUDGET_POLICY };
    return normalizeAiPaidBudgetPolicy(parseJson(row.value), { updatedAt: row.updatedAt, updatedBy: row.updatedBy });
  } catch {
    // A missing or unavailable policy must fail closed; it must never turn on paid traffic.
    return { ...DEFAULT_AI_PAID_BUDGET_POLICY };
  }
}

export async function saveAiPaidBudgetPolicy(value: unknown, actor: string) {
  const policy = normalizeAiPaidBudgetPolicy(value);
  if (policy.enabled && (policy.dailyCapSar <= 0 || policy.monthlyCapSar <= 0 || policy.perRequestCapSar <= 0 || policy.estimatedRequestSar <= 0)) {
    throw new AiPlatformError("AI_PAID_BUDGET_INVALID", "لا يمكن تفعيل الاحتياط المدفوع دون سقوف يومية وشهرية ولكل طلب وتكلفة تقديرية موجبة.");
  }
  if (policy.enabled && (policy.dailyCapSar < policy.perRequestCapSar || policy.monthlyCapSar < policy.perRequestCapSar || policy.estimatedRequestSar > policy.perRequestCapSar)) {
    throw new AiPlatformError("AI_PAID_BUDGET_INVALID", "يجب أن يكون سقف الطلب داخل السقفين اليومي والشهري، وألا تتجاوز التكلفة التقديرية سقف الطلب.");
  }
  const now = new Date().toISOString();
  const stored = { enabled: policy.enabled, dailyCapSar: policy.dailyCapSar, monthlyCapSar: policy.monthlyCapSar, perRequestCapSar: policy.perRequestCapSar, estimatedRequestSar: policy.estimatedRequestSar };
  await getDb().insert(platformSettings).values({ key: POLICY_KEY, value: JSON.stringify(stored), category: "ai", isPublic: false, updatedBy: actor, updatedAt: now }).onConflictDoUpdate({ target: platformSettings.key, set: { value: JSON.stringify(stored), category: "ai", isPublic: false, updatedBy: actor, updatedAt: now } });
  return { ...policy, updatedAt: now, updatedBy: actor };
}

type BudgetLedger = { day: string; month: string; dailyReservedSar: number; monthlyReservedSar: number; updatedAt: string };

function parseLedger(value: string | null | undefined, day: string, month: string): BudgetLedger {
  const raw = record(parseJson(value));
  return {
    day,
    month,
    dailyReservedSar: raw.day === day ? boundedMoney(raw.dailyReservedSar, 0, 1_000_000) : 0,
    monthlyReservedSar: raw.month === month ? boundedMoney(raw.monthlyReservedSar, 0, 10_000_000) : 0,
    updatedAt: new Date().toISOString(),
  };
}

/** Reserve one bounded paid request only after the caller proves free capacity is exhausted. */
export async function reserveAiPaidBudget(requestId: string) {
  try {
    return await getDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('meras-ai-paid-budget-v1'))`);
      const [policyRow] = await tx.select().from(platformSettings).where(eq(platformSettings.key, POLICY_KEY)).limit(1);
      const policy = policyRow ? normalizeAiPaidBudgetPolicy(parseJson(policyRow.value), { updatedAt: policyRow.updatedAt, updatedBy: policyRow.updatedBy }) : { ...DEFAULT_AI_PAID_BUDGET_POLICY };
      if (!policy.enabled) throw new AiPlatformError("AI_PAID_FALLBACK_DISABLED", "انتهت سعة Gemini المجانية المؤهلة، والاحتياط المدفوع مغلق حاليًا.", 429);
      const cost = policy.estimatedRequestSar;
      if (cost <= 0 || cost > policy.perRequestCapSar) throw new AiPlatformError("AI_PAID_BUDGET_INVALID", "إعداد تكلفة الاحتياط المدفوع غير صالح؛ أوقفه وراجعه من الإدارة.", 503);
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      const month = day.slice(0, 7);
      const [ledgerRow] = await tx.select().from(platformSettings).where(eq(platformSettings.key, LEDGER_KEY)).limit(1);
      const ledger = parseLedger(ledgerRow?.value, day, month);
      const dailyNext = Math.round((ledger.dailyReservedSar + cost) * 100) / 100;
      const monthlyNext = Math.round((ledger.monthlyReservedSar + cost) * 100) / 100;
      if (dailyNext > policy.dailyCapSar || monthlyNext > policy.monthlyCapSar) throw new AiPlatformError("AI_PAID_BUDGET_EXHAUSTED", "توقف الاحتياط المدفوع بعد بلوغ سقفه الآمن. يمكن استئنافه بعد مراجعة الميزانية.", 429);
      const reservationId = randomUUID();
      const nextLedger = { day, month, dailyReservedSar: dailyNext, monthlyReservedSar: monthlyNext, updatedAt: now.toISOString() };
      await tx.insert(platformSettings).values({ key: LEDGER_KEY, value: JSON.stringify(nextLedger), category: "ai", isPublic: false, updatedBy: "ai-runtime", updatedAt: now.toISOString() }).onConflictDoUpdate({ target: platformSettings.key, set: { value: JSON.stringify(nextLedger), category: "ai", isPublic: false, updatedBy: "ai-runtime", updatedAt: now.toISOString() } });
      const requestHash = createHash("sha256").update(requestId).digest("hex").slice(0, 24);
      await tx.insert(auditLogs).values({ actorEmail: "ai-runtime", action: "reserve", entityType: "ai_paid_budget", entityId: reservationId, beforeJson: null, afterJson: JSON.stringify({ requestHash, reservedSar: cost, day, month }), ipAddress: null, createdAt: now.toISOString() });
      return { reservationId, reservedSar: cost, dailyReservedSar: dailyNext, monthlyReservedSar: monthlyNext, policy };
    });
  } catch (error) {
    if (error instanceof AiPlatformError) throw error;
    throw new AiPlatformError("AI_PAID_BUDGET_UNAVAILABLE", "تعذر حجز سقف الاحتياط المدفوع بأمان؛ لم يُرسل طلب مدفوع.", 503);
  }
}
