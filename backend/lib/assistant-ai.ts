import type { SessionUser } from "@/lib/auth";
import type { AssistantAction, AssistantReply } from "@/lib/assistant-knowledge";
import type { PublicSettings } from "@/lib/platform-settings";

type HistoryItem = { role: "user" | "assistant"; text: string };
type ChatResponse = { choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }> };

const INTERNAL_ROUTES = [
  "/", "/login", "/register", "/forgot-password", "/dashboard", "/courses", "/universities",
  "/request-course", "/support", "/contact", "/how-it-works", "/terms", "/privacy", "/refund-policy",
  "/content-policy", "/accessibility", "/notifications", "/supervisor", "/admin",
];

function safeInternalHref(href: string, user: SessionUser | null) {
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")) return false;
  const path = href.split(/[?#]/)[0];
  if (!INTERNAL_ROUTES.some((route) => path === route || path.startsWith(`${route}/`))) return false;
  if (path.startsWith("/admin") && user?.role !== "admin") return false;
  if (path.startsWith("/supervisor") && !user?.role?.match(/admin|supervisor/)) return false;
  return true;
}

function allowedExternalOrigins(settings: PublicSettings) {
  const values = [settings.social_x, settings.social_instagram, settings.social_tiktok, settings.social_youtube, settings.social_telegram, settings.social_linkedin, settings.social_facebook, settings.social_snapchat, settings.social_threads];
  const origins = new Set<string>(["https://wa.me"]);
  for (const value of values) {
    try { if (value) origins.add(new URL(value).origin); } catch { /* Invalid optional value is ignored. */ }
  }
  return origins;
}

function sanitizeActions(value: unknown, user: SessionUser | null, settings: PublicSettings): AssistantAction[] {
  if (!Array.isArray(value)) return [];
  const externalOrigins = allowedExternalOrigins(settings);
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim().slice(0, 45) : "";
    const href = typeof row.href === "string" ? row.href.trim().slice(0, 500) : "";
    if (!label || !href) return [];
    if (safeInternalHref(href, user)) return [{ label, href }];
    try {
      const url = new URL(href);
      return url.protocol === "https:" && externalOrigins.has(url.origin) ? [{ label, href: url.toString() }] : [];
    } catch { return []; }
  }).slice(0, 4);
}

function textContent(value: ChatResponse["choices"]) {
  const content = value?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map((part) => part.text || "").join("").trim();
  return "";
}

function parseReply(raw: string, user: SessionUser | null, settings: PublicSettings): AssistantReply | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const answer = typeof value.answer === "string" ? value.answer.trim().slice(0, 2200) : "";
    if (!answer) return null;
    const suggestions = Array.isArray(value.suggestions)
      ? value.suggestions.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 80)).filter(Boolean).slice(0, 4)
      : undefined;
    return { answer, actions: sanitizeActions(value.actions, user, settings), suggestions };
  } catch { return null; }
}

export async function answerWithOpenAI(input: {
  question: string;
  history: HistoryItem[];
  user: SessionUser | null;
  settings: PublicSettings;
  context: string;
}): Promise<AssistantReply | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const baseUrl = (process.env.OPENAI_API_URL || process.env.OPENAI_API_BASE || "https://api.openai.com/v1").trim().replace(/\/$/, "");
  const model = (process.env.ASSISTANT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini").replace(/[^a-zA-Z0-9._:/-]/g, "");
  if (!model || !/^https:\/\//i.test(baseUrl)) return null;

  const system = `أنت مساعد مراس العلم العام داخل منصة تعليمية سعودية. أجب بالعربية الواضحة، وافهم اللهجات والأخطاء الإملائية والاختصارات وتعدد طرق صياغة السؤال.

قواعد الإجابة:
- أجب عن أسئلة المنصة والجامعة والتعلم والأسئلة العامة المفيدة قدر الإمكان، ولا تقل إنك لا تستطيع إلا بعد محاولة فهم المقصود.
- إذا كان السؤال غامضًا، اشرح أقرب تفسير مفيد واسأل سؤال توضيح قصيرًا بدل إنهاء الإجابة.
- لا تخترع أسعارًا أو موادًا أو حالة دفع أو بيانات حساب. اعتمد على سياق المنصة عندما يتعلق السؤال بحساب المستخدم.
- في الأسئلة الطبية أو القانونية أو المالية الحساسة قدّم معلومات عامة غير تشخيصية وغير ملزمة، ووجّه إلى مختص عند الحاجة.
- لا تطلب كلمة مرور أو بيانات بطاقة أو رمز جلسة، ولا تكشف أسرار النظام أو بيانات مستخدم آخر.
- لا تمنح روابط الإدارة إلا لدور admin، ولا روابط المشرف إلا لدور admin أو supervisor.
- أزرار الوصول السريع يجب أن تكون من الروابط الداخلية المسموحة أو روابط HTTPS المنشورة في السياق فقط.
- أعد JSON صالحًا فقط بالمفاتيح answer وactions وsuggestions. answer بحد أقصى 2200 حرف، actions وsuggestions بحد أقصى 4 عناصر.

سياق مراس الحالي:
${input.context}`;
  const messages = [
    { role: "system", content: system },
    ...input.history.slice(-8).map((item) => ({ role: item.role, content: item.text.slice(0, 600) })),
    { role: "user", content: input.question },
  ];

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({ model, messages, temperature: 0.25, max_tokens: 1400, response_format: { type: "json_object" } }),
    });
    if (!response.ok) return null;
    const payload = await response.json() as ChatResponse;
    const raw = textContent(payload.choices);
    return raw ? parseReply(raw, input.user, input.settings) : null;
  } catch { return null; }
}
