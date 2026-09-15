"use client";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { registerInteractionListener, type InteractionRequest } from "@/lib/interaction-events";
import styles from "./interaction-provider.module.css";

type Toast = { id: number; message: string; tone: "success" | "error" | "info" };
export function InteractionProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<InteractionRequest[]>([]);
  const queueRef = useRef<InteractionRequest[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const off = registerInteractionListener(item => { queueRef.current = [...queueRef.current, item]; setQueue(queueRef.current); });
    let sequence = 0;
    const toast = (event: Event) => {
      const data = (event as CustomEvent).detail;
      if (!data || typeof data.message !== "string") return;
      const id = ++sequence;
      setToasts(items => [...items.slice(-3), { id, message: data.message.slice(0, 500), tone: data.tone }]);
      const timer = setTimeout(() => { timers.current.delete(timer); setToasts(items => items.filter(item => item.id !== id)); }, 6500);
      timers.current.add(timer);
    };
    const activeTimers = timers.current;
    window.addEventListener("meras:toast", toast);
    return () => { off(); window.removeEventListener("meras:toast", toast); activeTimers.forEach(clearTimeout); queueRef.current.forEach(item => item.resolve(false)); queueRef.current = []; };
  }, []);
  function settle(value: string | boolean | null) {
    const [item, ...remaining] = queueRef.current;
    queueRef.current = remaining;
    setQueue(remaining);
    item?.resolve(value);
  }
  return <>{children}<div className={styles.toasts} role="region" aria-label="إشعارات العمليات" aria-live="polite" aria-atomic="false">{toasts.map(item => <div key={item.id} className={styles.toast} data-tone={item.tone}><CheckCircle2 size={20} aria-hidden="true" /><span>{item.message}</span><button aria-label="إغلاق الإشعار" onClick={() => setToasts(items => items.filter(row => row.id !== item.id))}><X size={18} /></button></div>)}</div>{queue[0] && <InteractionDialog key={queue[0].id} item={queue[0]} settle={settle} />}</>;
}

function InteractionDialog({ item, settle }: { item: InteractionRequest; settle: (value: string | boolean | null) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [input, setInput] = useState(item.options.defaultValue || "");
  const [code, setCode] = useState("");
  const [secret, setSecret] = useState("");
  const [setup, setSetup] = useState(item.options.message === "setup");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isMfa = item.kind === "mfa";
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    return () => { element?.close(); previous?.focus(); };
  }, []);
  async function securityAction(action: string, extra: Record<string, string> = {}) {
    const response = await fetch("/api/admin/security/mfa", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "تعذر التحقق من الرمز");
    return payload;
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!isMfa) { settle(item.kind === "prompt" ? input.trim() : true); return; }
    setBusy(true); setError("");
    try {
      if (setup && !secret) { const result = await securityAction("setup"); setSecret(result.secret); return; }
      const result = await securityAction(setup ? "verify" : "stepUp", { code });
      if (result.stepUpValid) { settle(true); return; }
      if (setup) { setSetup(false); setSecret(""); setCode(""); setError("تم تفعيل المصادقة. أدخل الرمز التالي من التطبيق لتأكيد العملية."); }
      else settle(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر التحقق"); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="interaction-title" aria-describedby="interaction-description" onCancel={event => { event.preventDefault(); if (!busy) settle(false); }}>
    <form onSubmit={submit}>
      <div className={styles.top}><span className={styles.icon}>{isMfa ? <ShieldCheck size={26} /> : <TriangleAlert size={26} />}</span><button type="button" disabled={busy} aria-label="إغلاق النافذة" className={styles.close} onClick={() => settle(false)}><X size={20} /></button></div>
      <h2 id="interaction-title">{item.options.title || "تأكيد العملية"}</h2>
      <p id="interaction-description">{isMfa ? "تأكيد إضافي لحماية حسابك. تبقى بياناتك التي أدخلتها محفوظة في الصفحة، وتُستكمل العملية بعد نجاح التحقق." : item.options.message}</p>
      {item.kind === "prompt" && <label className={styles.label}>{item.options.inputLabel}<textarea autoFocus maxLength={1000} value={input} onChange={event => setInput(event.target.value)} /></label>}
      {isMfa && setup && <p className={styles.hint}>اربط تطبيق المصادقة بحسابك أولًا. لا تشارك مفتاح الإعداد أو الرمز مع أي شخص.</p>}
      {secret && <div className={styles.secret}><span>مفتاح الإعداد — أضفه إلى تطبيق المصادقة</span><code dir="ltr">{secret}</code><button type="button" className="button button-ghost" onClick={() => void navigator.clipboard.writeText(secret).catch(() => setError("انسخ المفتاح يدويًا من الحقل أعلاه"))}>نسخ المفتاح</button></div>}
      {isMfa && (!setup || secret) && <label className={styles.label}>رمز تطبيق المصادقة<input autoFocus required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/[^0-9]/g, ""))} dir="ltr" placeholder="000000" /></label>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <footer className={styles.actions}><button type="submit" disabled={busy} className={`button button-primary ${!isMfa && item.options.destructive ? styles.danger : ""}`}>{busy ? "جارٍ التحقق…" : isMfa ? setup && !secret ? "إعداد المصادقة" : "تحقق ومتابعة" : item.options.confirmLabel || "تأكيد"}</button><button type="button" disabled={busy} className="button button-ghost" onClick={() => settle(false)}>إلغاء والعودة</button></footer>
    </form>
  </dialog>;
}
