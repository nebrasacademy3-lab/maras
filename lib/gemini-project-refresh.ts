import "server-only";
import { readGeminiControlToken } from "@/lib/gemini-control-files";
import { parseGeminiProjectPlan } from "@/lib/gemini-project-policy";
import { refreshGeminiProject } from "@/lib/gemini-project-verification";
import { claimGeminiProjectRefresh, finishGeminiProjectRefresh, geminiPlanDigest } from "@/lib/gemini-refresh-state";
import type { GeminiRefreshFailure } from "@/lib/gemini-refresh-state";

/** One bounded, centrally leased attempt. Never generates content or mutates Google billing. */
export async function runGeminiProjectRefreshOnce(tokenFile: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const claim = await claimGeminiProjectRefresh();
  if (!claim) return { worked: false, state: "idle" as const };
  let failure: GeminiRefreshFailure = "PLAN_INVALID";
  try {
    const plan = parseGeminiProjectPlan(JSON.parse(claim.planJson));
    if (plan.projectNumber !== claim.projectNumber || geminiPlanDigest(JSON.stringify(plan)) !== claim.planDigest) throw new Error("plan");
    signal?.throwIfAborted();
    failure = "TOKEN_UNAVAILABLE";
    const token = await readGeminiControlToken(tokenFile);
    signal?.throwIfAborted();
    failure = "VERIFICATION_FAILED";
    const proof = await refreshGeminiProject(plan, token, { signal, fence: claim });
    signal?.throwIfAborted();
    const saved = await finishGeminiProjectRefresh(claim);
    return { worked: true, projectNumber: claim.projectNumber, state: saved ? "verified" as const : "superseded" as const, ...(saved ? { validUntil: proof.validUntil } : {}) };
  } catch {
    const saved = await finishGeminiProjectRefresh(claim, failure);
    return { worked: true, projectNumber: claim.projectNumber, state: saved ? "failed" as const : "superseded" as const, ...(saved ? { reason: failure } : {}) };
  }
}
