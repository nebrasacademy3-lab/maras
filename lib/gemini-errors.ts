import { AiPlatformError } from "@/lib/ai-platform";

const messages: Record<string, string> = {
  AI_KEY_INVALID: "رفض Google بيانات المصادقة. انسخ المفتاح كاملًا من Google AI Studio وتأكد أنه مفتاح Gemini API، وليس رمز OAuth أو مفتاح Vertex AI.",
  AI_KEY_REVOKED: "رفض Google هذا المفتاح لأنه ملغى أو منتهي أو محظور. أنشئ مفتاحًا جديدًا من Google AI Studio وحدّث المفتاح المحفوظ.",
  AI_KEY_RESTRICTED: "قيود المفتاح تمنع طلب الخادم. راجع ربطه بـ Generative Language API وقيود عنوان IP؛ قيود مواقع الويب لا تلائم اتصال الخادم.",
  AI_API_DISABLED: "Generative Language API غير مفعّلة أو غير متاحة للمشروع المرتبط بالمفتاح. راجع تفعيل الخدمة وصلاحيات حساب الخدمة في Google Cloud.",
  AI_PERMISSION_DENIED: "رفض Google صلاحية الوصول لهذا الطلب. قد يكون المفتاح صحيحًا؛ راجع صلاحيات المشروع وحساب الخدمة وقيود المفتاح وإتاحة النموذج.",
  AI_BILLING_REQUIRED: "يتطلب هذا الطلب تفعيل الفوترة أو رصيدًا متاحًا في مشروع Google المرتبط بالمفتاح. راجع الفوترة والحصة؛ تغيير المفتاح وحده لا يحل ذلك.",
  AI_QUOTA_EXHAUSTED: "حصة المشروع أو رصيده غير متاحين لهذا النموذج. راجع حدود المشروع والفوترة في Google AI Studio؛ المفاتيح التابعة للمشروع نفسه تشترك في الحصة.",
  AI_RATE_LIMITED: "وصل Google إلى حد الطلبات أو الرموز مؤقتًا. انتظر المدة الموضحة ثم حاول مرة أخرى، أو راجع حدود النموذج في مشروعك.",
  AI_MODEL_UNAVAILABLE: "النموذج المحدد غير موجود أو غير متاح عبر generateContent لهذا المفتاح. حدّث قائمة النماذج واختر معرّفًا متاحًا، ثم اختبر التوليد.",
  AI_MODEL_UNSUPPORTED: "هذا النموذج لا يعلن دعم generateContent. اختر نموذجًا من قائمة النماذج المتوافقة مع أدوات مراس.",
  AI_PROVIDER_REQUEST_REJECTED: "رفض Google إعدادات الطلب أو محتواه. تحقق من حدود النموذج ودعمه للملف ومخطط الإجابة؛ لا يعني هذا أن المفتاح غير صحيح.",
  AI_PROVIDER_TIMEOUT: "انتهت مهلة الاتصال بـ Google. جرّب بعد قليل؛ استمرار المهلة قد يدل على اتصال الخادم أو ضغط الخدمة.",
  AI_PROVIDER_UNAVAILABLE: "خدمة Google غير متاحة مؤقتًا أو تعذر الوصول إليها من الخادم. حاول بعد قليل.",
  AI_PROVIDER_INVALID_RESPONSE: "وصل رد غير مكتمل أو غير قابل للقراءة من Google. حاول مرة أخرى؛ لم تُكشف تفاصيل الرد أو بيانات المفتاح.",
  AI_CONTENT_BLOCKED: "أوقف النموذج إخراج الإجابة بسبب سياسات المحتوى. عدّل صياغة الطلب أو محتواه؛ هذا لا يدل على خلل في المفتاح.",
  AI_OUTPUT_TOKEN_LIMIT: "انتهى حد رموز الإجابة قبل اكتمال النص. ارفع حد الإجابة ضمن حدود النموذج أو اختصر الطلب، خصوصًا للنماذج التي تستخدم التفكير.",
  AI_EMPTY_RESPONSE: "وصل رد من Google دون إجابة نصية. جرّب طلبًا أبسط أو نموذجًا يدعم النصوص، وراجع حد رموز الإجابة.",
};

export function geminiErrorMessage(code: string | null) {
  if (!code) return "";
  const legacy: Record<string, string> = { HTTP_400: "AI_PROVIDER_REQUEST_REJECTED", HTTP_401: "AI_KEY_INVALID", HTTP_403: "AI_PERMISSION_DENIED", HTTP_404: "AI_MODEL_UNAVAILABLE", HTTP_429: "AI_RATE_LIMITED", HTTP_503: "AI_PROVIDER_UNAVAILABLE" };
  return messages[legacy[code] || code] || "تعذر إكمال آخر طلب. اختبر الاتصال والنموذج لمعرفة الإجراء المناسب.";
}

export class GeminiProviderError extends AiPlatformError {
  constructor(readonly providerStatus: number, code: string, readonly retryable = false, readonly invalidCredential = false, readonly retryAfterSeconds: number | null = null) {
    super(code, geminiErrorMessage(code), code === "AI_RATE_LIMITED" || code === "AI_QUOTA_EXHAUSTED" ? 429 : providerStatus === 400 || providerStatus === 422 ? 422 : providerStatus === 408 || providerStatus >= 500 ? 503 : 502);
  }
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

/** Map allowlisted classifications only; Google's raw messages may contain credentials/project IDs. */
export function classifyGeminiError(status: number, payload: unknown, retryAfter: string | null = null) {
  const error = record(record(payload).error);
  const details = Array.isArray(error.details) ? error.details.map(record) : [];
  const reasons = details.map(item => typeof item.reason === "string" ? item.reason : "");
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  const has = (...values: string[]) => values.some(value => reasons.includes(value));
  const retryInfo = details.find(item => String(item["@type"] || "").endsWith("google.rpc.RetryInfo"));
  const delay = typeof retryInfo?.retryDelay === "string" && /^\d+(?:\.\d+)?s$/.test(retryInfo.retryDelay) ? Number.parseFloat(retryInfo.retryDelay) : Number.NaN;
  const headerDelay = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : retryAfter ? Math.ceil((Date.parse(retryAfter) - Date.now()) / 1000) : Number.NaN;
  const retrySeconds = [headerDelay, delay].find(value => Number.isFinite(value) && value >= 0);
  const retryAfterSeconds = retrySeconds === undefined ? null : Math.min(3600, Math.ceil(retrySeconds));
  if (has("API_KEY_EXPIRED", "API_KEY_REVOKED") || /reported as leaked|api key.*(?:expired|revoked)/.test(message)) return new GeminiProviderError(status, "AI_KEY_REVOKED", true, true);
  if (has("API_KEY_INVALID", "CREDENTIALS_MISSING", "ACCESS_TOKEN_TYPE_UNSUPPORTED")) return new GeminiProviderError(status, "AI_KEY_INVALID", true, true);
  if (has("API_KEY_SERVICE_BLOCKED", "API_KEY_HTTP_REFERRER_BLOCKED", "API_KEY_IP_ADDRESS_BLOCKED", "API_KEY_ANDROID_APP_BLOCKED", "API_KEY_IOS_APP_BLOCKED")) return new GeminiProviderError(status, "AI_KEY_RESTRICTED", true);
  if (has("SERVICE_DISABLED", "CONSUMER_INVALID")) return new GeminiProviderError(status, "AI_API_DISABLED", true);
  if (has("BILLING_DISABLED", "PROJECT_BILLING_DISABLED") || /billing.*(?:enabled|required)|prepay|credits.*(?:depleted|exhausted)/.test(message)) return new GeminiProviderError(status, "AI_BILLING_REQUIRED", true, false, retryAfterSeconds);
  if (status === 401) return new GeminiProviderError(status, "AI_KEY_INVALID", true);
  if (status === 403) return new GeminiProviderError(status, "AI_PERMISSION_DENIED", true);
  if (status === 404) return new GeminiProviderError(status, "AI_MODEL_UNAVAILABLE");
  if (status === 429) {
    const quota = /perday|per_day|daily|limit:\s*0|quota.*(?:exhausted|zero)/.test(message) || details.some(item => Array.isArray(item.violations) && item.violations.some(value => /perday|per_day|daily/i.test(String(record(value).quotaId || ""))));
    return new GeminiProviderError(status, quota ? "AI_QUOTA_EXHAUSTED" : "AI_RATE_LIMITED", true, false, retryAfterSeconds);
  }
  if (status === 408 || status === 504) return new GeminiProviderError(status, "AI_PROVIDER_TIMEOUT", true);
  if (status >= 500) return new GeminiProviderError(status, "AI_PROVIDER_UNAVAILABLE", true);
  return new GeminiProviderError(status, "AI_PROVIDER_REQUEST_REJECTED");
}
