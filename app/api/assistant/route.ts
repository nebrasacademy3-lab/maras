import { detectAssistantLanguage, resolveAssistantQuestion } from "@/lib/assistant-search";
import { answerWithOpenAI } from "@/lib/assistant-ai";
import { answerAssistant, detectAssistantIntent } from "@/lib/assistant-knowledge";
import { buildAssistantContext, getAssistantLiveCatalog } from "@/lib/assistant-context";
import { cleanText, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { getPublicSettings, PUBLIC_SETTING_DEFAULTS } from "@/lib/platform-settings";
import { readBoundedJsonObject, RequestBodyTooLargeError } from "@/lib/request-body";

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  if (!await checkRateLimit("assistant", clientIp(request), 50, 10 * 60)) return jsonError("أرسلت أسئلة كثيرة بسرعة. انتظر قليلًا ثم حاول مجددًا.", 429);
  let payload: Record<string, unknown>;
  try { payload = await readBoundedJsonObject(request, 32 * 1024); }
  catch (error) { return jsonError("صيغة السؤال غير صالحة أو حجم المحادثة أكبر من المسموح", error instanceof RequestBodyTooLargeError ? 413 : 400); }
  const question = cleanText(payload.question, 500).replace(/\s+/g, " ");
  if (question.length < 2) return jsonError("اكتب سؤالك بكلمتين على الأقل");
  const history = Array.isArray(payload.history) ? payload.history.slice(-8).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const role = row.role === "assistant" ? "assistant" as const : row.role === "user" ? "user" as const : null;
    const text = cleanText(row.text, 500).replace(/\s+/g, " ");
    return role && text ? [{ role, text }] : [];
  }).slice(-8) : [];
  const [user, settings, catalog] = await Promise.all([
    getSessionUser(request).catch(() => null),
    getPublicSettings().catch(() => ({ ...PUBLIC_SETTING_DEFAULTS })),
    getAssistantLiveCatalog().catch(() => ({ institutions: [], courses: [], programs: [] })),
  ]);
  const intent = detectAssistantIntent(question);
  const resolvedQuestion = resolveAssistantQuestion(question, history);
  let reply = null;
  try {
    const context = await buildAssistantContext(user, settings, resolvedQuestion, catalog);
    reply = await answerWithOpenAI({ question, history, user, settings, context, intent });
  } catch { /* The deterministic guide below keeps the assistant available. */ }
  return Response.json(reply || answerAssistant(resolvedQuestion, user, settings, catalog, detectAssistantLanguage(question)), { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
