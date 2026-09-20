import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiKeyFingerprint, geminiEnvironmentKeys } from "@/lib/ai-keys";
import { AiBusyError } from "@/lib/ai-work-control";
import { AiPlatformError } from "@/lib/ai-platform";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
export type GeminiProjectIdentity = { projectNumber: string; tier: "free" | "paid"; validUntil: string };
type Reservation = { id: string; projectNumber: string; fingerprint: string; model: string; revision: string; inputTokens: number };
const fail = (code: string, status = 503): never => { if (status === 429) throw new AiBusyError(60, code); throw new AiPlatformError(code, "تعذر اعتماد مشروع Gemini أو تجاوز الطلب حدوده المشتركة. راجع إثبات المشروع وحدود النموذج في الخادم.", status); };
async function lock(tx: Tx, project: string) { await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`gemini-project:${project}`}, 0))`); }

export function requireGeminiPaidPricing(): void { fail("AI_PAID_PRICING_UNVERIFIED"); }

export async function geminiProjectIdentities(): Promise<Map<string, GeminiProjectIdentity>> {
  try {
    const result = await getDb().execute(sql`SELECT k.fingerprint, p.project_number, p.billing_state, p.valid_until FROM gemini_project_keys k JOIN gemini_projects p USING(project_number)
      WHERE p.valid_until > clock_timestamp() AND p.verified_at <= clock_timestamp() AND p.billing_state IN ('unlinked', 'linked')`);
    return new Map(result.rows.map(r => [String(r.fingerprint), { projectNumber: String(r.project_number), tier: r.billing_state === "unlinked" ? "free" as const : "paid" as const, validUntil: new Date(r.valid_until as string).toISOString() }]));
  } catch { return fail("AI_PROJECT_STORE_UNAVAILABLE"); }
}

async function authorized(tx: Tx, fingerprint: string, project: string, model: string) {
  const result = await tx.execute(sql`SELECT p.revision, p.billing_state, l.* FROM gemini_project_keys k JOIN gemini_projects p USING(project_number)
    JOIN gemini_project_limits l USING(project_number) WHERE k.fingerprint = ${fingerprint} AND p.project_number = ${project} AND l.model = ${model}
      AND l.enabled = true AND p.valid_until > clock_timestamp() + interval '2 seconds' AND p.verified_at <= clock_timestamp()`);
  const row = result.rows[0];
  if (!row) return fail("AI_PROJECT_UNVERIFIED");
  // A flat SAR/request estimate is not a proven worst-case token price. Paid
  // generation (including diagnostics) stays blocked until that gate exists.
  if (row.billing_state !== "unlinked") return fail("AI_PAID_PRICING_UNVERIFIED");
  const saved = await tx.execute(sql`SELECT status, cooldown_until FROM ai_api_keys WHERE fingerprint = ${fingerprint}`);
  if (saved.rows.length) {
    if (saved.rows[0].status !== "active" || (saved.rows[0].cooldown_until && Date.parse(String(saved.rows[0].cooldown_until)) > Date.now())) return fail("AI_PROJECT_KEY_NOT_ACTIVE");
  } else if (!geminiEnvironmentKeys().some(k => aiKeyFingerprint(k) === fingerprint)) return fail("AI_PROJECT_KEY_NOT_ACTIVE");
  const backedOff = await tx.execute(sql`SELECT 1 FROM gemini_project_limits WHERE project_number = ${project} AND model = ${model} AND backoff_until > clock_timestamp()`);
  if (backedOff.rows.length) return fail("AI_PROJECT_RATE_LIMITED", 429);
  return row;
}

/** Reserve a conservative input ceiling BEFORE token counting, across all keys/replicas. */
export async function reserveGeminiProject(apiKey: string, model: string, outputTokens: unknown): Promise<Reservation> {
  if (!Number.isSafeInteger(outputTokens) || Number(outputTokens) < 1) return fail("AI_PROJECT_OUTPUT_LIMIT", 422);
  const fingerprint = aiKeyFingerprint(apiKey);
  try {
    const identity = (await geminiProjectIdentities()).get(fingerprint);
    if (!identity) return fail("AI_PROJECT_UNVERIFIED");
    return await getDb().transaction(async tx => {
      await lock(tx, identity.projectNumber);
      const row = await authorized(tx, fingerprint, identity.projectNumber, model);
      if (Number(outputTokens) > Number(row.output_tokens)) return fail("AI_PROJECT_OUTPUT_LIMIT", 422);
      // Bounded housekeeping. Old rows never need to be deleted to admit a call.
      await tx.execute(sql`DELETE FROM gemini_project_reservations WHERE id IN (SELECT id FROM gemini_project_reservations WHERE project_number = ${identity.projectNumber} AND created_at < clock_timestamp() - interval '3 days' AND active_until < clock_timestamp() AND window_until < clock_timestamp() ORDER BY created_at LIMIT 256)`);
      const counts = await tx.execute(sql`SELECT count(*) FILTER(WHERE window_until > clock_timestamp())::int AS minute,
        COALESCE(sum(input_tokens) FILTER(WHERE window_until > clock_timestamp()),0)::bigint AS tokens,
        count(*) FILTER(WHERE active_until > clock_timestamp() AND state IN ('counting','running','uncertain'))::int AS active,
        count(*) FILTER(WHERE quota_day = to_char(clock_timestamp() AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD') OR dispatch_day = to_char(clock_timestamp() AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM-DD'))::int AS daily
        FROM gemini_project_reservations WHERE project_number = ${identity.projectNumber} AND model = ${model}`);
      const c = counts.rows[0];
      if (Number(c.minute) >= Number(row.rpm) || Number(c.tokens) + Number(row.input_tokens) > Number(row.tpm) || Number(c.daily) >= Number(row.rpd) || Number(c.active) >= Number(row.concurrent)) return fail("AI_PROJECT_RATE_LIMITED", 429);
      const result = { id: randomUUID(), projectNumber: identity.projectNumber, fingerprint, model, revision: String(row.revision), inputTokens: Number(row.input_tokens) };
      await tx.execute(sql`INSERT INTO gemini_project_reservations(id,project_number,fingerprint,model,revision,input_tokens,state,quota_day,active_until,window_until)
        VALUES (${result.id}, ${result.projectNumber}, ${fingerprint}, ${model}, ${result.revision}, ${result.inputTokens}, 'counting', to_char(clock_timestamp() AT TIME ZONE 'America/Los_Angeles','YYYY-MM-DD'), clock_timestamp() + interval '150 seconds', clock_timestamp() + interval '210 seconds')`);
      return result;
    });
  } catch (error) { if (error instanceof AiPlatformError) throw error; return fail("AI_PROJECT_STORE_UNAVAILABLE"); }
}

/** Revalidate after counting. Expired/replaced proof or a disabled key cannot dispatch. */
export async function dispatchGeminiProject(r: Reservation, totalTokens: unknown) {
  if (!Number.isSafeInteger(totalTokens) || Number(totalTokens) < 0 || Number(totalTokens) > r.inputTokens) return fail("AI_PROJECT_INPUT_LIMIT", 422);
  try {
    await getDb().transaction(async tx => {
      await lock(tx, r.projectNumber);
      const row = await authorized(tx, r.fingerprint, r.projectNumber, r.model);
      if (row.revision !== r.revision) return fail("AI_PROJECT_PROOF_CHANGED");
      const daily = await tx.execute(sql`SELECT count(*)::int AS count FROM gemini_project_reservations WHERE project_number = ${r.projectNumber} AND model = ${r.model} AND id <> ${r.id}
        AND (quota_day = to_char(clock_timestamp() AT TIME ZONE 'America/Los_Angeles','YYYY-MM-DD') OR dispatch_day = to_char(clock_timestamp() AT TIME ZONE 'America/Los_Angeles','YYYY-MM-DD'))`);
      if (Number(daily.rows[0].count) >= Number(row.rpd)) return fail("AI_PROJECT_RATE_LIMITED", 429);
      const updated = await tx.execute(sql`UPDATE gemini_project_reservations SET state = 'running', dispatch_day = to_char(clock_timestamp() AT TIME ZONE 'America/Los_Angeles','YYYY-MM-DD')
        WHERE id = ${r.id} AND fingerprint = ${r.fingerprint} AND revision = ${r.revision} AND state = 'counting' AND active_until > clock_timestamp() + interval '2 seconds' RETURNING id`);
      if (updated.rows.length !== 1) return fail("AI_PROJECT_LEASE_EXPIRED");
    });
  } catch (error) { if (error instanceof AiPlatformError) throw error; return fail("AI_PROJECT_STORE_UNAVAILABLE"); }
}

/** Unknown outcomes retain their concurrency reservation; no optimistic refund. */
export async function settleGeminiProject(r: Reservation, certain: boolean, backoffSeconds = 0) {
  await getDb().transaction(async tx => {
    await lock(tx, r.projectNumber);
    await tx.execute(sql`UPDATE gemini_project_reservations SET state = ${certain ? "settled" : "uncertain"},
      active_until = CASE WHEN ${certain} THEN LEAST(active_until,clock_timestamp()) ELSE active_until END,
      window_until = CASE WHEN ${certain} THEN GREATEST(clock_timestamp() + interval '60 seconds', created_at + interval '60 seconds') ELSE window_until END
      WHERE id = ${r.id} AND fingerprint = ${r.fingerprint} AND revision = ${r.revision} AND state IN ('counting','running')`);
    if (Number.isFinite(backoffSeconds) && backoffSeconds > 0) await tx.execute(sql`UPDATE gemini_project_limits SET backoff_until = GREATEST(COALESCE(backoff_until,clock_timestamp()), clock_timestamp() + ${Math.min(3600, Math.max(1, Math.ceil(backoffSeconds)))} * interval '1 second') WHERE project_number = ${r.projectNumber} AND model = ${r.model}`);
  });
}
