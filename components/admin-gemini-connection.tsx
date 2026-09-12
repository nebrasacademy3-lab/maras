"use client";
import { useId, useRef, useState } from "react";
import { CircleAlert, KeyRound, LoaderCircle, PlugZap, RefreshCw, ShieldCheck } from "lucide-react";
import type { GeminiModelOption } from "@/lib/gemini-config";
import { ADMIN_STEP_UP_MESSAGE, AdminMfaNotice, isAdminStepUpResponse } from "./admin-mfa-notice";
import styles from "./admin-gemini-connection.module.css";

type Result = { ok?: boolean; models?: GeminiModelOption[]; hasMore?: boolean; model?: GeminiModelOption; generationVerified?: boolean; message?: string; error?: string; code?: string; providerStatus?: number; retryAfterSeconds?: number };
export function AdminGeminiConnection({ providers, environmentKeyCount, draftApiKey, defaultModel, onModels, onTested }: {
  providers: Array<{ id: number; label: string; maskedKey: string }>; environmentKeyCount: number; draftApiKey: string; defaultModel: string; onModels: (models: GeminiModelOption[]) => void; onTested: () => void;
}) {
  const id = useId();
  const [source, setSource] = useState("");
  const [service, setService] = useState("chat");
  const [model, setModel] = useState(defaultModel);
  const [models, setModels] = useState<GeminiModelOption[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState("");
  const pending = useRef(false);
  const effectiveSource = source || (providers[0] ? String(providers[0].id) : environmentKeyCount ? "environment" : "draft");
  const validSource = effectiveSource === "draft" ? Boolean(draftApiKey.trim()) : effectiveSource === "environment" ? environmentKeyCount > 0 : providers.some(item => String(item.id) === effectiveSource);
  async function check(action: "listModels" | "testConnection" | "testGeneration" | "testRuntime") {
    if (pending.current || (action !== "testRuntime" && !validSource)) return;
    pending.current = true; setBusy(action); setResult(null);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), action === "testRuntime" ? 130_000 : 65_000);
    try {
      const response = await fetch("/api/admin/ai", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, model, service, ...(effectiveSource === "draft" ? { source: "draft", apiKey: draftApiKey } : effectiveSource === "environment" ? { source: "environment" } : { keyId: Number(effectiveSource) }) }), signal: controller.signal });
      if (isAdminStepUpResponse(response)) { setResult({ ok: false, error: ADMIN_STEP_UP_MESSAGE, code: "ADMIN_STEP_UP_REQUIRED" }); return; }
      const value = await response.json().catch(() => ({})) as Result;
      if (!response.ok) { setResult({ ...value, ok: false, error: value.error || "تعذر إكمال الفحص. حاول مرة أخرى." }); return; }
      if (value.models) { setModels(value.models); onModels(value.models); }
      if (value.model) setModel(value.model.id);
      setResult({ ...value, ok: true, message: value.models ? `تم جلب ${value.models.length} نموذجًا يدعم generateContent${value.hasMore ? "؛ توجد نتائج إضافية لدى Google" : ""}. اختر النموذج المطلوب ثم اختبره.` : value.message });
      onTested();
    } catch { setResult({ ok: false, error: "تعذر إكمال اتصال الخادم. تحقق من الشبكة وحاول مرة أخرى؛ لا يعني ذلك أن المفتاح غير صحيح." }); }
    finally { window.clearTimeout(timer); pending.current = false; setBusy(""); }
  }
  return <section className={styles.panel} aria-labelledby={`${id}-title`}>
    <header><span><PlugZap size={22} /></span><div><h2 id={`${id}-title`}>فحص الاتصال والنموذج</h2><p>حدّد سبب المشكلة قبل تغيير المفتاح. تُنفّذ الاتصالات من الخادم إلى Google فقط.</p></div></header>
    <div className={styles.fields}><label htmlFor={`${id}-key`}>المفتاح المستخدم<select id={`${id}-key`} value={effectiveSource} onChange={event => { setSource(event.target.value); setModels([]); setResult(null); }} disabled={Boolean(busy)}>{providers.map(item => <option key={item.id} value={String(item.id)}>{item.label} · {item.maskedKey}</option>)}{environmentKeyCount > 0 && <option value="environment">مفتاح الخادم الأول · {environmentKeyCount} مهيّأة</option>}<option value="draft">المفتاح المكتوب في نموذج الإضافة</option></select></label><label htmlFor={`${id}-model`}>معرّف النموذج<input id={`${id}-model`} dir="ltr" list={`${id}-models`} value={model} maxLength={107} onChange={event => { setModel(event.target.value); setResult(null); }} autoComplete="off" spellCheck={false} placeholder="models/gemini-2.5-flash" disabled={Boolean(busy)} /><datalist id={`${id}-models`}>{models.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}</datalist></label></div>
    <div className={styles.actions}><button type="button" disabled={Boolean(busy) || !validSource} onClick={() => void check("listModels")}>{busy === "listModels" ? <LoaderCircle className={styles.spin} size={16} /> : <RefreshCw size={16} />}جلب النماذج المتاحة</button><button type="button" disabled={Boolean(busy) || !validSource || !model.trim()} onClick={() => void check("testConnection")}>{busy === "testConnection" ? <LoaderCircle className={styles.spin} size={16} /> : <KeyRound size={16} />}فحص الوصول للنموذج</button><button type="button" disabled={Boolean(busy) || !validSource || !model.trim()} onClick={() => void check("testGeneration")}>{busy === "testGeneration" ? <LoaderCircle className={styles.spin} size={16} /> : <PlugZap size={16} />}اختبار إجابة قصيرة</button></div>
    <div className={styles.fields}><label htmlFor={`${id}-service`}>اختبار أداة بإعداداتها المحفوظة<select id={`${id}-service`} value={service} onChange={event => { setService(event.target.value); setResult(null); }} disabled={Boolean(busy)}><option value="chat">المحادثة</option><option value="summary">التلخيص</option><option value="translation">الترجمة</option><option value="quiz">الاختبارات</option></select></label><div className={styles.actions}><button type="button" disabled={Boolean(busy)} onClick={() => void check("testRuntime")}>{busy === "testRuntime" ? <LoaderCircle className={styles.spin} size={16} /> : <PlugZap size={16} />}اختبار الأداة الفعلي</button></div></div>
    <p className={styles.hint}>اختبار الأداة يستخدم إعداداتها المحفوظة وتدوير المفاتيح نفسه الذي يستخدمه الطلاب مع محتوى تجريبي عام، وقد يستهلك حصة محدودة. </p>
    <p className={styles.hint}>جلب النماذج وفحص الوصول يقرآن بيانات النموذج فقط. اختبار الإجابة يرسل عبارة تجريبية عامة وقد يستهلك حصة أو تكلفة محدودة وفق مشروعك، ولا يرسل ملفات الطلاب.</p>
    {result?.code === "ADMIN_STEP_UP_REQUIRED" ? <AdminMfaNotice /> : result && <div className={styles.result} data-ok={result.ok} role={result.ok ? "status" : "alert"}>{result.ok ? <ShieldCheck size={20} /> : <CircleAlert size={20} />}<div><strong>{result.ok ? result.generationVerified ? "نجح اختبار التوليد" : "اكتمل فحص الوصول" : "لم يكتمل الفحص"}</strong><p>{result.ok ? result.message : result.error}</p>{result.code && <small dir="ltr">{result.code}{result.providerStatus ? ` · Google HTTP ${result.providerStatus}` : ""}</small>}{Boolean(result.retryAfterSeconds) && <small>أعد المحاولة بعد نحو {result.retryAfterSeconds} ثانية.</small>}</div></div>}
  </section>;
}
