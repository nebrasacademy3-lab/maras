import { getSessionUser, checkRateLimit } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { aiDeepLinks, aiJson } from "@/lib/ai-api";
import { AI_DOCUMENT_GUIDANCE, AI_SUPPORTED_FILES } from "@/lib/ai-files";
import { aiPeriod, getAiUsageStatuses } from "@/lib/ai-platform";
import { observeRequest } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return observeRequest(request, "ai.status", async () => {
    const user = await getSessionUser(request);
    if (!user) return jsonError("سجّل الدخول لاستخدام مراس AI", 401);
    if (!await checkRateLimit("ai-status", `user:${user.id}`, 120, 60)) return jsonError("طلبات كثيرة. حاول بعد قليل.", 429);
    const { entitlement, statuses } = await getAiUsageStatuses(user);
    const fileStatuses = [statuses.summary, statuses.translation, statuses.quiz].filter((status) => status.enabled);
    const maxFileBytes = fileStatuses.length ? Math.max(...fileStatuses.map((status) => status.maxFileBytes)) : 0;
    return aiJson({
      ok: true,
      period: aiPeriod(),
      entitlement,
      services: statuses,
      supportedFiles: AI_SUPPORTED_FILES.map((file) => ({ ...file, maxBytes: maxFileBytes })),
      documentGuidance: AI_DOCUMENT_GUIDANCE,
      deepLinks: aiDeepLinks(),
    });
  });
}
