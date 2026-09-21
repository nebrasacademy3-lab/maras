import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiKeyFingerprint, geminiEnvironmentKeys, validGeminiApiKey } from "@/lib/ai-keys";
import { assertGeminiRefreshFence } from "@/lib/gemini-refresh-state";
import type { GeminiRefreshFence } from "@/lib/gemini-refresh-state";
import { GEMINI_PROOF_TTL_SECONDS, parseGeminiProjectPlan } from "@/lib/gemini-project-policy";

async function controlJson(url: string, token: string, signal: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch(url, { method: "GET", headers: { authorization: `Bearer ${token}` }, redirect: "error", cache: "no-store", signal });
  if (!response.ok) { await response.body?.cancel(); throw new Error("AI_PROJECT_VERIFICATION_FAILED"); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("AI_PROJECT_VERIFICATION_FAILED");
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; if (size > 64 * 1024) { await reader.cancel(); throw new Error("AI_PROJECT_VERIFICATION_FAILED"); } chunks.push(item.value); }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AI_PROJECT_VERIFICATION_FAILED");
    return value as Record<string, unknown>;
  } finally { reader.releaseLock(); }
}

/** Read-only Google calls. The returned object contains no API key or bearer token. */
export async function verifyGoogleProject(value: unknown, accessToken: string, externalSignal?: AbortSignal) {
  const plan = parseGeminiProjectPlan(value);
  if (!accessToken || accessToken.length > 8192 || /\s/.test(accessToken)) throw new Error("AI_PROJECT_VERIFICATION_FAILED");
  const observedAt = new Date();
  const timeout = AbortSignal.timeout(12_000);
  const signal = externalSignal ? AbortSignal.any([timeout, externalSignal]) : timeout;
  try {
    signal.throwIfAborted();
    const project = await controlJson(`https://cloudresourcemanager.googleapis.com/v3/projects/${plan.projectNumber}`, accessToken, signal);
    if (project.name !== `projects/${plan.projectNumber}` || project.projectId !== plan.projectId || project.state !== "ACTIVE") throw new Error("identity");
    for (const key of plan.keys) {
      const result = await controlJson(`https://apikeys.googleapis.com/v2/${key.resource}/keyString`, accessToken, signal);
      const raw = validGeminiApiKey(result.keyString);
      if (!raw || aiKeyFingerprint(raw) !== key.fingerprint) throw new Error("key");
    }
    // Read billing LAST. A closed/disabled linked billing account is never free.
    const billing = await controlJson(`https://cloudbilling.googleapis.com/v1/projects/${plan.projectId}/billingInfo`, accessToken, signal);
    if (billing.name !== `projects/${plan.projectId}/billingInfo` || billing.projectId !== plan.projectId || typeof billing.billingEnabled !== "boolean" || (billing.billingAccountName !== undefined && typeof billing.billingAccountName !== "string")) throw new Error("billing");
    const account = billing.billingAccountName || "";
    if (account && !/^billingAccounts\/[A-Z0-9-]+$/i.test(String(account))) throw new Error("billing");
    if (billing.billingEnabled && !account) throw new Error("billing");
    const billingState = account ? (billing.billingEnabled ? "linked" : "disabled") : "unlinked";
    const evidenceDigest = createHash("sha256").update(JSON.stringify({ plan, observedAt: observedAt.toISOString(), project: { name: project.name, projectId: project.projectId, state: project.state }, billing })).digest("hex");
    return { plan, billingState, evidenceDigest, observedAt };
  } catch { throw new Error("AI_PROJECT_VERIFICATION_FAILED"); }
}

/** Operator CLI or fenced renewal worker only. No HTTP action accepts a user-supplied proof. */
export async function refreshGeminiProject(value: unknown, accessToken: string, options: { signal?: AbortSignal; fence?: GeminiRefreshFence } = {}) {
  const plan = parseGeminiProjectPlan(value);
  const planDigest = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
  const fence = options.fence ? { projectNumber: options.fence.projectNumber, leaseId: options.fence.leaseId, planRevision: options.fence.planRevision, proofRevision: options.fence.proofRevision } : undefined;
  if (fence && (fence.projectNumber !== plan.projectNumber || typeof fence.proofRevision !== "string" || !/^[a-f0-9-]{36}$/i.test(fence.proofRevision))) throw new Error("AI_PROJECT_VERIFICATION_FAILED");
  let expectedRevision: string | null = fence?.proofRevision ?? null;
  try {
    // Snapshot before transport. A later success/failure can only replace/expire this proof.
    if (!fence) {
      const before = await getDb().execute(sql`SELECT revision FROM gemini_projects WHERE project_number = ${plan.projectNumber}`);
      expectedRevision = before.rows[0] ? String(before.rows[0].revision) : null;
    }
    const proof = await verifyGoogleProject(plan, accessToken, options.signal);
    const environment = new Set(geminiEnvironmentKeys().map(aiKeyFingerprint));
    const revision = randomUUID();
    await getDb().transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`gemini-project:${plan.projectNumber}`}, 0))`);
      options.signal?.throwIfAborted();
      if (fence) await assertGeminiRefreshFence(tx, fence);
      const current = await tx.execute(sql`SELECT project_id, revision, verified_at FROM gemini_projects WHERE project_number = ${plan.projectNumber}`);
      if ((current.rows[0]?.revision ?? null) !== expectedRevision || current.rows[0] && (current.rows[0].project_id !== plan.projectId || new Date(current.rows[0].verified_at as string).getTime() > proof.observedAt.getTime())) throw new Error("AI_PROJECT_VERIFICATION_SUPERSEDED");
      const clock = await tx.execute(sql`SELECT clock_timestamp() AS now`);
      if (Math.abs(new Date(clock.rows[0].now as string).getTime() - proof.observedAt.getTime()) > 30_000) throw new Error("AI_PROJECT_CLOCK_UNSAFE");
      for (const key of plan.keys) {
        const saved = await tx.execute(sql`SELECT status FROM ai_api_keys WHERE fingerprint = ${key.fingerprint}`);
        if (saved.rows.length ? saved.rows[0].status !== "active" : !environment.has(key.fingerprint)) throw new Error("AI_PROJECT_KEY_NOT_ACTIVE");
        const binding = await tx.execute(sql`SELECT project_number FROM gemini_project_keys WHERE fingerprint = ${key.fingerprint}`);
        if (binding.rows[0] && binding.rows[0].project_number !== plan.projectNumber) throw new Error("AI_PROJECT_KEY_CONFLICT");
      }
      options.signal?.throwIfAborted();
      if (fence) await assertGeminiRefreshFence(tx, fence);
      const until = new Date(proof.observedAt.getTime() + GEMINI_PROOF_TTL_SECONDS * 1000);
      await tx.execute(sql`INSERT INTO gemini_projects(project_number, project_id, billing_state, evidence_digest, revision, verified_at, valid_until, plan_digest)
        VALUES (${plan.projectNumber}, ${plan.projectId}, ${proof.billingState}, ${proof.evidenceDigest}, ${revision}, ${proof.observedAt.toISOString()}, ${until.toISOString()}, ${planDigest})
        ON CONFLICT(project_number) DO UPDATE SET billing_state = EXCLUDED.billing_state, evidence_digest = EXCLUDED.evidence_digest, revision = EXCLUDED.revision, verified_at = EXCLUDED.verified_at, valid_until = EXCLUDED.valid_until, plan_digest = EXCLUDED.plan_digest`);
      await tx.execute(sql`DELETE FROM gemini_project_keys WHERE project_number = ${plan.projectNumber}`);
      for (const key of plan.keys) await tx.execute(sql`INSERT INTO gemini_project_keys(fingerprint, project_number, resource_name) VALUES (${key.fingerprint}, ${plan.projectNumber}, ${key.resource})`);
      // Never erase shared usage or a provider backoff during a proof refresh.
      await tx.execute(sql`UPDATE gemini_project_limits SET enabled = false WHERE project_number = ${plan.projectNumber}`);
      for (const m of plan.models) await tx.execute(sql`INSERT INTO gemini_project_limits(project_number, model, rpm, tpm, rpd, concurrent, input_tokens, output_tokens)
        VALUES (${plan.projectNumber}, ${m.model}, ${m.rpm}, ${m.tpm}, ${m.rpd}, ${m.concurrent}, ${m.inputTokens}, ${m.outputTokens})
        ON CONFLICT(project_number, model) DO UPDATE SET rpm = EXCLUDED.rpm, tpm = EXCLUDED.tpm, rpd = EXCLUDED.rpd, concurrent = EXCLUDED.concurrent, input_tokens = EXCLUDED.input_tokens, output_tokens = EXCLUDED.output_tokens, enabled = true`);
    });
    return { revision, projectNumber: plan.projectNumber, projectId: plan.projectId, billingState: proof.billingState, keyCount: plan.keys.length, modelCount: plan.models.length, validUntil: new Date(proof.observedAt.getTime() + GEMINI_PROOF_TTL_SECONDS * 1000).toISOString() };
  } catch {
    // Revision equality remains correct for equal millisecond timestamps and clock skew.
    await getDb().transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`gemini-project:${plan.projectNumber}`}, 0))`);
      if (fence) await assertGeminiRefreshFence(tx, fence);
      await tx.execute(sql`UPDATE gemini_projects SET valid_until = LEAST(valid_until, clock_timestamp()) WHERE project_number = ${plan.projectNumber} AND revision = ${expectedRevision}`);
    }).catch(() => undefined);
    throw new Error("AI_PROJECT_VERIFICATION_FAILED");
  }
}
