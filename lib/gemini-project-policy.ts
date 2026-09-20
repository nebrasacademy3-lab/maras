/** Operator limits are ceilings, not a claim about Google's available quota. */
export type GeminiModelCeiling = { model: string; rpm: number; tpm: number; rpd: number; concurrent: number; inputTokens: number; outputTokens: number };
export type GeminiProjectPlan = { projectNumber: string; projectId: string; keys: { resource: string; fingerprint: string }[]; models: GeminiModelCeiling[] };
export const GEMINI_PROOF_TTL_SECONDS = 900;
export function parseGeminiProjectPlan(value: unknown): GeminiProjectPlan {
  const fail = (): never => { throw new Error("AI_PROJECT_PLAN_INVALID"); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const p = value as Record<string, unknown>;
  if (Object.keys(p).some(k => !["projectNumber", "projectId", "keys", "models"].includes(k))) return fail();
  if (typeof p.projectNumber !== "string" || !/^[1-9][0-9]{5,20}$/.test(p.projectNumber) || typeof p.projectId !== "string" || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(p.projectId)) return fail();
  if (!Array.isArray(p.keys) || p.keys.length < 1 || p.keys.length > 32 || !Array.isArray(p.models) || p.models.length < 1 || p.models.length > 32) return fail();
  const keys = p.keys.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return fail();
    const k = item as Record<string, unknown>;
    if (Object.keys(k).length !== 2 || typeof k.resource !== "string" || !new RegExp(`^projects/${p.projectNumber}/locations/global/keys/[a-zA-Z0-9_-]{1,128}$`).test(k.resource) || typeof k.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(k.fingerprint)) return fail();
    return { resource: k.resource, fingerprint: k.fingerprint };
  });
  const maxima = { rpm: 6000, tpm: 100_000_000, rpd: 1_000_000, concurrent: 32, inputTokens: 2_000_000, outputTokens: 65_536 };
  const models = p.models.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return fail();
    const m = item as Record<string, unknown>;
    if (typeof m.model !== "string" || !/^gemini-[a-z0-9][a-z0-9.-]{0,126}$/.test(m.model) || Object.keys(m).length !== 7) return fail();
    for (const [name, max] of Object.entries(maxima)) if (!Number.isSafeInteger(m[name]) || Number(m[name]) < 1 || Number(m[name]) > max) return fail();
    if (Number(m.inputTokens) > Number(m.tpm) || Number(m.concurrent) > Number(m.rpm)) return fail();
    return { model: m.model, rpm: m.rpm as number, tpm: m.tpm as number, rpd: m.rpd as number, concurrent: m.concurrent as number, inputTokens: m.inputTokens as number, outputTokens: m.outputTokens as number };
  });
  if (new Set(keys.map(k => k.fingerprint)).size !== keys.length || new Set(keys.map(k => k.resource)).size !== keys.length || new Set(models.map(m => m.model)).size !== models.length) return fail();
  return { projectNumber: p.projectNumber, projectId: p.projectId, keys, models };
}
