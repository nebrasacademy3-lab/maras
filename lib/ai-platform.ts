import { and, count, eq, gt, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiEntitlements, aiServiceSettings, aiUsageEvents, courseAccess, platformSettings, userRewards } from "@/db/schema";
import { activeUserAccessWhere } from "@/lib/course-access";
import { AI_SERVICES, type AiEntitlementStatus, type AiService, type AiUsageStatus } from "@/lib/ai-contracts";

export type AiServiceConfig = {
  service: AiService;
  enabled: boolean;
  model: string;
  freeMonthlyLimit: number;
  subscriberMonthlyLimit: number;
  maxOutputTokens: number;
  maxFileBytes: number;
  temperature: number;
  instructions: string;
};

export const DEFAULT_AI_SETTINGS: Record<AiService, AiServiceConfig> = {
  chat: { service: "chat", enabled: true, model: "gemini-2.5-flash", freeMonthlyLimit: 20, subscriberMonthlyLimit: 500, maxOutputTokens: 4096, maxFileBytes: 20 * 1024 * 1024, temperature: 0.25, instructions: "" },
  summary: { service: "summary", enabled: true, model: "gemini-2.5-flash", freeMonthlyLimit: 5, subscriberMonthlyLimit: 120, maxOutputTokens: 8192, maxFileBytes: 20 * 1024 * 1024, temperature: 0.15, instructions: "" },
  translation: { service: "translation", enabled: true, model: "gemini-2.5-flash", freeMonthlyLimit: 3, subscriberMonthlyLimit: 100, maxOutputTokens: 8192, maxFileBytes: 20 * 1024 * 1024, temperature: 0.1, instructions: "" },
  quiz: { service: "quiz", enabled: true, model: "gemini-2.5-flash", freeMonthlyLimit: 3, subscriberMonthlyLimit: 100, maxOutputTokens: 8192, maxFileBytes: 20 * 1024 * 1024, temperature: 0.15, instructions: "" },
};

export class AiPlatformError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "AiPlatformError";
    this.code = code;
    this.status = status;
  }
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function rowConfig(service: AiService, row?: typeof aiServiceSettings.$inferSelect): AiServiceConfig {
  const fallback = DEFAULT_AI_SETTINGS[service];
  if (!row) return { ...fallback };
  const model = row.model.trim();
  return {
    service,
    enabled: row.enabled,
    model: /^[a-zA-Z0-9._-]{2,100}$/.test(model) ? model : fallback.model,
    freeMonthlyLimit: boundedInteger(row.freeMonthlyLimit, fallback.freeMonthlyLimit, 0, 100_000),
    subscriberMonthlyLimit: boundedInteger(row.subscriberMonthlyLimit, fallback.subscriberMonthlyLimit, 0, 100_000),
    maxOutputTokens: boundedInteger(row.maxOutputTokens, fallback.maxOutputTokens, 256, 65_536),
    maxFileBytes: boundedInteger(row.maxFileBytes, fallback.maxFileBytes, 256 * 1024, 50 * 1024 * 1024),
    temperature: boundedNumber(row.temperature, fallback.temperature, 0, 1),
    instructions: row.instructions.slice(0, 4_000),
  };
}

export async function getAiServiceSettings() {
  let rows: Array<typeof aiServiceSettings.$inferSelect> = [];
  try { rows = await getDb().select().from(aiServiceSettings); } catch { /* Defaults keep status pages readable before the migration runs. */ }
  const byService = new Map(rows.map((row) => [row.service, row]));
  return Object.fromEntries(AI_SERVICES.map((service) => [service, rowConfig(service, byService.get(service))])) as Record<AiService, AiServiceConfig>;
}

export async function getAiMonthlyPrice() {
  const envPrice = boundedNumber(process.env.AI_MONTHLY_PRICE_SAR, 30, 1, 10_000);
  try {
    const [row] = await getDb().select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.key, "ai_monthly_price_sar")).limit(1);
    return boundedNumber(row?.value, envPrice, 1, 10_000);
  } catch { return envPrice; }
}

function normalizedEntitlementSource(source: string): AiEntitlementStatus["source"] {
  return source === "paid" || source === "admin" || source === "gift" || source === "referral" ? source : "admin";
}

function rewardEntitlementSource(reward: Pick<typeof userRewards.$inferSelect, "sourceType" | "benefitPayloadJson">): AiEntitlementStatus["source"] {
  let declaredSource = "";
  try {
    const payload = JSON.parse(reward.benefitPayloadJson) as { source?: unknown };
    declaredSource = typeof payload.source === "string" ? payload.source.toLowerCase() : "";
  } catch { /* An invalid optional label must not invalidate an otherwise active reward. */ }
  return `${reward.sourceType}:${declaredSource}`.includes("referral") ? "referral" : "gift";
}

export async function getAiEntitlement(user: { id: number; email: string }): Promise<AiEntitlementStatus> {
  const now = new Date().toISOString();
  const [price, entitlementRows, rewardRows, courseRows] = await Promise.all([
    getAiMonthlyPrice(),
    getDb().select().from(aiEntitlements).where(and(
      eq(aiEntitlements.userId, user.id),
      eq(aiEntitlements.status, "active"),
      lte(aiEntitlements.startsAt, now),
      or(isNull(aiEntitlements.expiresAt), gt(aiEntitlements.expiresAt, now)),
    )).limit(20).catch(() => []),
    getDb().select({ sourceType: userRewards.sourceType, benefitPayloadJson: userRewards.benefitPayloadJson, expiresAt: userRewards.expiresAt }).from(userRewards).where(and(
      eq(userRewards.userId, user.id),
      eq(userRewards.rewardType, "ai_subscription"),
      eq(userRewards.status, "active"),
      lte(userRewards.issuedAt, now),
      or(isNull(userRewards.expiresAt), gt(userRewards.expiresAt, now)),
    )).limit(20).catch(() => []),
    getDb().select({ id: courseAccess.id }).from(courseAccess).where(activeUserAccessWhere(user.email, now)).limit(1).catch(() => []),
  ]);
  if (entitlementRows.length) {
    const chosen = entitlementRows.sort((left, right) => {
      if (!left.expiresAt) return -1;
      if (!right.expiresAt) return 1;
      return Date.parse(right.expiresAt) - Date.parse(left.expiresAt);
    })[0];
    return { tier: "subscriber", active: true, source: normalizedEntitlementSource(chosen.source), expiresAt: chosen.expiresAt, monthlyPrice: price, currency: "SAR" };
  }
  if (rewardRows.length) {
    const chosen = rewardRows.sort((left, right) => {
      if (!left.expiresAt) return -1;
      if (!right.expiresAt) return 1;
      return Date.parse(right.expiresAt) - Date.parse(left.expiresAt);
    })[0];
    return { tier: "subscriber", active: true, source: rewardEntitlementSource(chosen), expiresAt: chosen.expiresAt, monthlyPrice: price, currency: "SAR" };
  }
  if (courseRows.length) return { tier: "subscriber", active: true, source: "course", expiresAt: null, monthlyPrice: price, currency: "SAR" };
  return { tier: "free", active: true, source: "free", expiresAt: null, monthlyPrice: price, currency: "SAR" };
}

export function aiPeriod(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function periodStartIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function billableUsageState() {
  const processingLease = new Date(Date.now() - 15 * 60_000).toISOString();
  return or(
    inArray(aiUsageEvents.status, ["succeeded", "billable_failed"]),
    and(eq(aiUsageEvents.status, "processing"), gte(aiUsageEvents.createdAt, processingLease)),
  );
}

export async function getAiUsageStatuses(user: { id: number; email: string }) {
  const [settings, entitlement] = await Promise.all([getAiServiceSettings(), getAiEntitlement(user)]);
  let usageRows: Array<{ service: string; used: number }> = [];
  try {
    usageRows = await getDb().select({ service: aiUsageEvents.service, used: count() }).from(aiUsageEvents).where(and(
      eq(aiUsageEvents.userId, user.id),
      gte(aiUsageEvents.createdAt, periodStartIso()),
      billableUsageState(),
    )).groupBy(aiUsageEvents.service);
  } catch { /* The status response still exposes configured limits during a staged rollout. */ }
  const usedByService = new Map(usageRows.map((row) => [row.service, Number(row.used)]));
  const statuses = Object.fromEntries(AI_SERVICES.map((service) => {
    const config = settings[service];
    const limit = entitlement.tier === "subscriber" ? config.subscriberMonthlyLimit : config.freeMonthlyLimit;
    const used = usedByService.get(service) || 0;
    const value: AiUsageStatus = { service, enabled: config.enabled, limit, used, remaining: Math.max(0, limit - used), model: config.model, maxFileBytes: config.maxFileBytes };
    return [service, value];
  })) as Record<AiService, AiUsageStatus>;
  return { entitlement, settings, statuses };
}

export async function beginAiUsage(input: {
  requestId: string;
  user: { id: number; email: string };
  service: AiService;
  conversationId?: number | null;
  fileId?: number | null;
}) {
  const { entitlement, settings } = await getAiUsageStatuses(input.user);
  const config = settings[input.service];
  if (!config.enabled) throw new AiPlatformError("AI_SERVICE_DISABLED", "هذه الخدمة متوقفة مؤقتًا من إدارة المنصة.", 423);
  const limit = entitlement.tier === "subscriber" ? config.subscriberMonthlyLimit : config.freeMonthlyLimit;
  if (limit <= 0) throw new AiPlatformError("AI_SERVICE_UNAVAILABLE", "هذه الخدمة غير متاحة ضمن باقتك الحالية.", 403);
  const now = new Date().toISOString();
  const created = await getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`meras-ai:${input.user.id}:${input.service}:${aiPeriod()}`}))`);
    const [duplicate] = await tx.select({ id: aiUsageEvents.id, status: aiUsageEvents.status }).from(aiUsageEvents).where(eq(aiUsageEvents.requestId, input.requestId)).limit(1);
    if (duplicate) throw new AiPlatformError("AI_DUPLICATE_REQUEST", "تم استلام هذا الطلب مسبقًا.", 409);
    const [usage] = await tx.select({ used: count() }).from(aiUsageEvents).where(and(
      eq(aiUsageEvents.userId, input.user.id),
      eq(aiUsageEvents.service, input.service),
      gte(aiUsageEvents.createdAt, periodStartIso()),
      billableUsageState(),
    ));
    const used = Number(usage?.used || 0);
    if (used >= limit) throw new AiPlatformError("AI_LIMIT_REACHED", "استهلكت الحد المتاح لهذه الخدمة هذا الشهر. يمكنك الاشتراك أو الانتظار حتى تجدد الحدود.", 429);
    const [event] = await tx.insert(aiUsageEvents).values({
      requestId: input.requestId,
      userId: input.user.id,
      service: input.service,
      conversationId: input.conversationId || null,
      fileId: input.fileId || null,
      model: config.model,
      status: "processing",
      createdAt: now,
    }).returning({ id: aiUsageEvents.id });
    return { eventId: event.id, used: used + 1 };
  });
  return { ...created, config, entitlement, limit, remaining: Math.max(0, limit - created.used) };
}

export async function finishAiUsage(input: { eventId: number; status: "succeeded" | "failed"; billable?: boolean; keyId?: number | null; model?: string; inputTokens?: number; outputTokens?: number; errorCode?: string | null }) {
  await getDb().update(aiUsageEvents).set({
    status: input.status === "failed" ? input.billable === false ? "failed" : "billable_failed" : "succeeded",
    keyId: input.keyId || null,
    model: input.model,
    inputTokens: boundedInteger(input.inputTokens, 0, 0, 100_000_000),
    outputTokens: boundedInteger(input.outputTokens, 0, 0, 100_000_000),
    errorCode: input.errorCode?.slice(0, 120) || null,
  }).where(eq(aiUsageEvents.id, input.eventId));
}

export function usagePayload(input: { service: AiService; config: AiServiceConfig; limit: number; used: number; remaining: number }): AiUsageStatus {
  return { service: input.service, enabled: input.config.enabled, limit: input.limit, used: input.used, remaining: input.remaining, model: input.config.model, maxFileBytes: input.config.maxFileBytes };
}
