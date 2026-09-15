import "server-only";
import { randomUUID } from "node:crypto";
import { and, count, eq, gt, like, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiWorkLeases } from "@/db/schema";
import { AiPlatformError } from "@/lib/ai-platform";

export class AiBusyError extends AiPlatformError {
  readonly billable = false;
  constructor(readonly retryAfterSeconds = 5, code = "AI_PROVIDER_BUSY") {
    super(code, "توجد طلبات معالجة قيد التنفيذ. سيُعاد طلبك المؤجل تلقائيًا؛ للطلبات المباشرة حاول بعد قليل.", 429);
  }
}
export function boundedAiSetting(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = value?.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
}

export async function acquireAiWorkLease(key: string, seconds = 180) {
  const owner = randomUUID();
  const now = new Date().toISOString();
  const [lease] = await getDb().insert(aiWorkLeases).values({ key, owner, expiresAt: new Date(Date.now() + seconds * 1000).toISOString() }).onConflictDoUpdate({ target: aiWorkLeases.key, set: { owner, expiresAt: new Date(Date.now() + seconds * 1000).toISOString() }, setWhere: lte(aiWorkLeases.expiresAt, now) }).returning();
  if (!lease) return null;
  return async () => { await getDb().delete(aiWorkLeases).where(and(eq(aiWorkLeases.key, key), eq(aiWorkLeases.owner, owner))); };
}

/** Conservative shared provider budget across replicas AND all keys, not one budget per key. */
export async function acquireAiProviderSlot() {
  const max = boundedAiSetting(process.env.AI_PROVIDER_MAX_CONCURRENT, 2, 1, 16);
  const interval = boundedAiSetting(process.env.AI_PROVIDER_MIN_INTERVAL_MS, 5000, 250, 60_000);
  const owner = randomUUID();
  const key = `provider:slot:${owner}`;
  await getDb().transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('meras-ai-provider-admission'))`);
    const now = new Date().toISOString();
    const [pace] = await tx.select().from(aiWorkLeases).where(eq(aiWorkLeases.key, "provider:pace")).limit(1);
    if (pace && pace.expiresAt > now) throw new AiBusyError(Math.max(1, Math.ceil((Date.parse(pace.expiresAt) - Date.now()) / 1000)));
    await tx.delete(aiWorkLeases).where(and(like(aiWorkLeases.key, "provider:slot:%"), lte(aiWorkLeases.expiresAt, now)));
    const [active] = await tx.select({ count: count() }).from(aiWorkLeases).where(and(like(aiWorkLeases.key, "provider:slot:%"), gt(aiWorkLeases.expiresAt, now)));
    if (Number(active.count) >= max) throw new AiBusyError(5);
    await tx.insert(aiWorkLeases).values({ key, owner, expiresAt: new Date(Date.now() + 150_000).toISOString() });
    await tx.insert(aiWorkLeases).values({ key: "provider:pace", owner, expiresAt: new Date(Date.now() + interval).toISOString() }).onConflictDoUpdate({ target: aiWorkLeases.key, set: { owner, expiresAt: new Date(Date.now() + interval).toISOString() } });
  });
  return async () => { await getDb().delete(aiWorkLeases).where(and(eq(aiWorkLeases.key, key), eq(aiWorkLeases.owner, owner))); };
}

export async function deferAiProvider(seconds: number) {
  const until = new Date(Date.now() + Math.max(5, Math.min(3600, seconds)) * 1000).toISOString();
  await getDb().insert(aiWorkLeases).values({ key: "provider:pace", owner: "provider-backoff", expiresAt: until }).onConflictDoUpdate({ target: aiWorkLeases.key, set: { owner: "provider-backoff", expiresAt: until }, setWhere: lte(aiWorkLeases.expiresAt, until) });
}
