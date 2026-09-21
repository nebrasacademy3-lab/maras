import "server-only";
import type { GeminiVerificationSummary } from "@/lib/operations-contract";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { parseGeminiProjectPlan } from "@/lib/gemini-project-policy";

type Executor = Pick<ReturnType<typeof getDb>, "execute">;
// Snapshot the proof identity, not a comparison between application and database clocks.
export type GeminiRefreshFence = { projectNumber: string; leaseId: string; planRevision: string; proofRevision: string };
export type GeminiRefreshClaim = GeminiRefreshFence & { planJson: string; planDigest: string };
export type GeminiRefreshFailure = "TOKEN_UNAVAILABLE" | "VERIFICATION_FAILED" | "PLAN_INVALID";
export const GEMINI_REFRESH_LEASE_SECONDS = 45;
export const geminiPlanDigest = (json: string) => createHash("sha256").update(json).digest("hex");

/** Must run after acquiring the project advisory lock, in the same transaction as the proof write. */
export async function assertGeminiRefreshFence(tx: Executor, fence: GeminiRefreshFence) {
  if (typeof fence.proofRevision !== "string" || !/^[a-f0-9-]{36}$/i.test(fence.proofRevision)) throw new Error("GEMINI_REFRESH_PROOF_CHANGED");
  const rows = await tx.execute(sql`SELECT project_number FROM gemini_project_refresh
    WHERE project_number = ${fence.projectNumber} AND lease_id = ${fence.leaseId} AND plan_revision = ${fence.planRevision}
      AND enabled AND lease_until > clock_timestamp() FOR UPDATE`);
  if (rows.rows.length !== 1) throw new Error("GEMINI_REFRESH_LEASE_LOST");
}

/** Explicit CLI opt-in, immediately following a successful read-only proof of this exact plan. */
export async function registerGeminiProjectRefresh(value: unknown, proofRevision: string) {
  const plan = parseGeminiProjectPlan(value), json = JSON.stringify(plan), revision = randomUUID();
  if (Buffer.byteLength(json) > 65536) throw new Error("AI_PROJECT_PLAN_INVALID");
  await getDb().transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('gemini-refresh-registry'))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`gemini-project:${plan.projectNumber}`}, 0))`);
    const others = await tx.execute(sql`SELECT count(*)::int AS count FROM gemini_project_refresh WHERE enabled AND project_number <> ${plan.projectNumber}`);
    if (Number(others.rows[0].count) >= 32) throw new Error("GEMINI_REFRESH_REGISTRY_FULL");
    const rows = await tx.execute(sql`SELECT project_id FROM gemini_projects WHERE project_number = ${plan.projectNumber}
      AND project_id = ${plan.projectId} AND revision = ${proofRevision} AND plan_digest = ${geminiPlanDigest(json)} AND valid_until > clock_timestamp()`);
    if (rows.rows.length !== 1) throw new Error("GEMINI_REFRESH_PROOF_CHANGED");
    await tx.execute(sql`INSERT INTO gemini_project_refresh(project_number, plan_json, plan_digest, plan_revision, enabled, state, next_attempt_at, last_attempt_at, last_success_at)
      VALUES (${plan.projectNumber}, ${json}, ${geminiPlanDigest(json)}, ${revision}, true, 'verified', clock_timestamp() + interval '4 minutes', clock_timestamp(), clock_timestamp())
      ON CONFLICT(project_number) DO UPDATE SET plan_json = EXCLUDED.plan_json, plan_digest = EXCLUDED.plan_digest, plan_revision = EXCLUDED.plan_revision,
        enabled = true, state = 'verified', next_attempt_at = EXCLUDED.next_attempt_at, last_attempt_at = EXCLUDED.last_attempt_at, last_success_at = EXCLUDED.last_success_at,
        failures = 0, last_error = NULL, lease_id = NULL, lease_until = NULL, updated_at = clock_timestamp()`);
  });
  return { projectNumber: plan.projectNumber, enabled: true, planRevision: revision };
}

/** Disabling renewal also expires the current proof; old workers cannot revive it. */
export async function disableGeminiProjectRefresh(projectNumber: string) {
  if (!/^[1-9][0-9]{5,20}$/.test(projectNumber)) throw new Error("AI_PROJECT_PLAN_INVALID");
  await getDb().transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`gemini-project:${projectNumber}`}, 0))`);
    await tx.execute(sql`UPDATE gemini_project_refresh SET enabled = false, state = 'disabled', lease_id = NULL, lease_until = NULL,
      plan_revision = ${randomUUID()}, updated_at = clock_timestamp() WHERE project_number = ${projectNumber}`);
    await tx.execute(sql`UPDATE gemini_projects SET valid_until = LEAST(valid_until, clock_timestamp()) WHERE project_number = ${projectNumber}`);
  });
  return { projectNumber, enabled: false };
}

/** Database-clock scheduling and SKIP LOCKED coordinate all replicas without a process-local leader. */
export async function claimGeminiProjectRefresh(): Promise<GeminiRefreshClaim | null> {
  const leaseId = randomUUID();
  return getDb().transaction(async tx => {
    const picked = await tx.execute(sql`SELECT project_number FROM gemini_project_refresh WHERE enabled AND next_attempt_at <= clock_timestamp()
      AND (lease_until IS NULL OR lease_until <= clock_timestamp()) ORDER BY next_attempt_at, project_number FOR UPDATE SKIP LOCKED LIMIT 1`);
    if (!picked.rows.length) return null;
    // RETURNING observes the proof in this statement's MVCC snapshot, not a later read.
    const updated = await tx.execute(sql`UPDATE gemini_project_refresh SET lease_id = ${leaseId}, lease_until = clock_timestamp() + ${GEMINI_REFRESH_LEASE_SECONDS} * interval '1 second',
      state = 'checking', last_attempt_at = clock_timestamp(), updated_at = clock_timestamp() WHERE project_number = ${picked.rows[0].project_number as string}
      RETURNING project_number, plan_revision, plan_json, plan_digest,
        (SELECT p.revision FROM gemini_projects p WHERE p.project_number = gemini_project_refresh.project_number) AS proof_revision`);
    const row = updated.rows[0];
    if (typeof row.proof_revision !== "string") throw new Error("GEMINI_REFRESH_PROOF_CHANGED");
    return { projectNumber: row.project_number as string, leaseId, planRevision: row.plan_revision as string, proofRevision: row.proof_revision, planJson: row.plan_json as string, planDigest: row.plan_digest as string };
  });
}

/** A stale worker is not allowed to alter a newer proof, retry time or successor's lease. */
export async function finishGeminiProjectRefresh(fence: GeminiRefreshFence, failure?: GeminiRefreshFailure) {
  if (failure && !["TOKEN_UNAVAILABLE", "VERIFICATION_FAILED", "PLAN_INVALID"].includes(failure)) throw new Error("GEMINI_REFRESH_FAILURE_INVALID");
  if (typeof fence.proofRevision !== "string" || !/^[a-f0-9-]{36}$/i.test(fence.proofRevision)) throw new Error("GEMINI_REFRESH_PROOF_CHANGED");
  return getDb().transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`gemini-project:${fence.projectNumber}`}, 0))`);
    const current = await tx.execute(sql`SELECT failures FROM gemini_project_refresh WHERE project_number = ${fence.projectNumber}
      AND lease_id = ${fence.leaseId} AND plan_revision = ${fence.planRevision} AND enabled AND lease_until > clock_timestamp() FOR UPDATE`);
    if (!current.rows.length) return false;
    const failures = failure ? Math.min(32, Number(current.rows[0].failures) + 1) : 0;
    const delay = failure ? Math.min(300, 30 * 2 ** Math.min(4, failures - 1)) + randomInt(0, 16) : 240 + randomInt(0, 31);
    if (failure) await tx.execute(sql`UPDATE gemini_projects SET valid_until = LEAST(valid_until, clock_timestamp()) WHERE project_number = ${fence.projectNumber} AND revision = ${fence.proofRevision}`);
    await tx.execute(sql`UPDATE gemini_project_refresh SET state = ${failure ? "failed" : "verified"}, failures = ${failures}, last_error = ${failure || null},
      last_success_at = CASE WHEN ${!failure} THEN clock_timestamp() ELSE last_success_at END, next_attempt_at = clock_timestamp() + ${delay} * interval '1 second',
      lease_id = NULL, lease_until = NULL, updated_at = clock_timestamp() WHERE project_number = ${fence.projectNumber}`);
    return true;
  });
}

/** Only aggregate operational states; no plan, fingerprint, resource name or credential escapes. */
export async function geminiRefreshSummary() {
  const result = await getDb().execute(sql`SELECT count(*)::int AS projects,
    count(*) FILTER (WHERE p.valid_until > clock_timestamp())::int AS verified,
    count(*) FILTER (WHERE p.valid_until <= clock_timestamp())::int AS expired,
    count(*) FILTER (WHERE p.valid_until > clock_timestamp() AND p.valid_until <= clock_timestamp() + interval '3 minutes')::int AS expiring,
    count(*) FILTER (WHERE r.enabled)::int AS scheduled,
    count(*) FILTER (WHERE r.enabled AND r.state = 'checking' AND r.lease_until > clock_timestamp())::int AS checking,
    count(*) FILTER (WHERE r.enabled AND r.state = 'failed')::int AS failed,
    count(*) FILTER (WHERE r.enabled AND r.next_attempt_at < clock_timestamp() - interval '2 minutes' AND (r.lease_until IS NULL OR r.lease_until <= clock_timestamp()))::int AS overdue
    FROM gemini_projects p LEFT JOIN gemini_project_refresh r USING(project_number)`);
  const row = result.rows[0];
  return Object.fromEntries(["projects", "verified", "expired", "expiring", "scheduled", "checking", "failed", "overdue"].map(key => [key, Number(row[key] || 0)])) as GeminiVerificationSummary;
}
