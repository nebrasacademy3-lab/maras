import { answerWithOpenAI } from "@/lib/assistant-ai";
import { answerAssistant, detectAssistantIntent } from "@/lib/assistant-knowledge";
import { buildAssistantContext } from "@/lib/assistant-context";
import { cleanText, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { getPublicSettings, PUBLIC_SETTING_DEFAULTS, settingEnabled } from "@/lib/platform-settings";
import { getCoursesCatalog, getInstitutionsCatalog } from "@/lib/catalog-store";

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  if (!await checkRateLimit("assistant", clientIp(request), 50, 10 * 60)) return jsonError("أرسلت أسئلة كثيرة بسرعة. انتظر قليلًا ثم حاول مجددًا.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("صيغة السؤال غير صالحة"); }
  const question = cleanText(payload.question, 500).replace(/\s+/g, " ");
  if (question.length < 2) return jsonError("اكتب سؤالك بكلمتين على الأقل");
  const history = Array.isArray(payload.history) ? payload.history.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const role = row.role === "assistant" ? "assistant" as const : row.role === "user" ? "user" as const : null;
    const text = cleanText(row.text, 500).replace(/\s+/g, " ");
    return role && text ? [{ role, text }] : [];
  }).slice(-8) : [];
  const [user, settings, institutions, courses] = await Promise.all([
    getSessionUser(request).catch(() => null),
    getPublicSettings().catch(() => ({ ...PUBLIC_SETTING_DEFAULTS })),
    getInstitutionsCatalog().catch(() => []),
    getCoursesCatalog().catch(() => []),
  ]);
  if (!settingEnabled(settings.assistant_enabled)) return jsonError("مساعد مراس متوقف مؤقتًا من إدارة المنصة", 503);
  const intent = detectAssistantIntent(question);
  let reply = null;
  try {
    const context = await buildAssistantContext(user, settings);
    reply = await answerWithOpenAI({ question, history, user, settings, context, intent });
  } catch { /* The deterministic guide below keeps the assistant available. */ }
  return Response.json(reply || answerAssistant(question, user, settings, { institutions, courses }), { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
