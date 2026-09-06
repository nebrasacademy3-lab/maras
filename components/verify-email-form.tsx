"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { safeAccountReturnTo } from "@/lib/account-readiness";
import styles from "./verify-email-form.module.css";

type Result = { error?: string; next?: string; emailVerified?: boolean; alreadyVerified?: boolean; deliveryConfigured?: boolean; cooldownSeconds?: number; retryAfterSeconds?: number; expiresInSeconds?: number; codeSent?: boolean };
async function readResult(response: Response): Promise<Result> {
  const result = await response.json().catch(() => ({})) as Result;
  if (!response.ok) throw new Error(result.error || "تعذر إكمال الطلب. حاول مرة أخرى.");
  return result;
}

function continueAccount(next = "/dashboard") {
  let saved = "";
  try { saved = sessionStorage.getItem("meras_return_to") || ""; } catch { /* Storage can be disabled. */ }
  const returnTo = safeAccountReturnTo(new URLSearchParams(window.location.search).get("return_to") || saved);
  if (next === "/complete-profile" || next === "/onboarding") {
    try { sessionStorage.setItem("meras_return_to", returnTo); } catch { /* URL carries the return path too. */ }
    window.location.assign(`${next}?return_to=${encodeURIComponent(returnTo)}`);
  } else {
    try { sessionStorage.removeItem("meras_return_to"); } catch { /* Optional cache. */ }
    window.location.assign(returnTo.startsWith("/verify-email") ? "/dashboard" : returnTo);
  }
}

export function VerifyEmailForm({ email }: { email: string }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"loading" | "sending" | "verifying" | "">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [configured, setConfigured] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(true);

  const send = useCallback(async () => {
    setBusy("sending"); setError("");
    try {
      const result = await readResult(await fetch("/api/auth/email-verification", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "send" }) }));
      if (!alive.current) return;
      if (result.alreadyVerified) { continueAccount(result.next); return; }
      setCooldown(result.retryAfterSeconds || 60);
      setNotice("أرسلنا رمزًا من 6 أرقام إلى بريدك. تحقق أيضًا من البريد غير المرغوب فيه.");
      input.current?.focus();
    } catch (caught) { if (alive.current) setError(caught instanceof Error ? caught.message : "تعذر إرسال الرمز"); }
    finally { if (alive.current) setBusy(""); }
  }, []);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    void fetch("/api/auth/email-verification", { credentials: "same-origin", cache: "no-store", signal: controller.signal }).then(readResult).then(async result => {
      if (controller.signal.aborted) return;
      if (result.emailVerified) { continueAccount(result.next); return; }
      setConfigured(result.deliveryConfigured !== false);
      setCooldown(result.cooldownSeconds || 0);
      if (result.deliveryConfigured === false) { setError("إرسال البريد غير متاح حاليًا. يمكنك التصفح والتواصل مع الدعم، وسيبقى الشراء متاحًا بعد تأكيد بريدك."); setBusy(""); }
      else if (!result.codeSent && !result.cooldownSeconds) await send();
      else { setNotice("أدخل آخر رمز أُرسل إلى بريدك. تأكيد البريد مطلوب مرة واحدة فقط."); setBusy(""); }
    }).catch(caught => { if (!controller.signal.aborted) { setError(caught instanceof Error ? caught.message : "تعذر تحميل حالة البريد"); setBusy(""); } });
    return () => { alive.current = false; controller.abort(); };
  }, [send]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy("verifying"); setError("");
    try {
      const result = await readResult(await fetch("/api/auth/email-verification", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "verify", code }) }));
      if (alive.current) continueAccount(result.next);
    } catch (caught) { if (alive.current) { setError(caught instanceof Error ? caught.message : "تعذر تأكيد البريد"); setBusy(""); } }
  }

  return <div className={styles.panel} dir="rtl"><span className={styles.icon}><Mail size={30} /></span><div className="auth-heading"><span>خطوة واحدة لحساب موثوق</span><h1>أكّد بريدك الإلكتروني</h1><p>نؤكد ملكية بريدك مرة واحدة لحماية حسابك ومشترياتك، وليس قبل كل عملية شراء.</p></div><strong className={styles.email} dir="ltr">{email}</strong>
    <form className="auth-form" onSubmit={verify} aria-busy={Boolean(busy)}><label className="form-label" htmlFor="email-code">رمز التحقق<input ref={input} id="email-code" className={styles.code} inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} minLength={6} required pattern="[0-9٠-٩۰-۹]{6}" value={code} onChange={event => setCode(event.target.value.replace(/[^0-9٠-٩۰-۹]/g, "").slice(0, 6))} placeholder="000000" /></label>
      {notice && <p className={styles.notice} role="status"><CheckCircle2 size={17} />{notice}</p>}{error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-primary auth-submit" disabled={Boolean(busy) || code.length !== 6}>{busy === "verifying" ? "جارٍ التأكيد…" : <>تأكيد البريد والمتابعة <ArrowLeft size={17} /></>}</button>
      <button className="button button-soft" type="button" disabled={Boolean(busy) || cooldown > 0 || !configured} onClick={() => void send()}><RefreshCw size={15} />{busy === "sending" ? "جارٍ الإرسال…" : cooldown ? `إعادة الإرسال بعد ${cooldown} ثانية` : "إرسال رمز جديد"}</button>
    </form><p className={styles.security}><ShieldCheck size={16} />الرمز صالح 10 دقائق ولمرة واحدة. لا تشاركه مع أحد.</p><Link className={styles.browse} href="/courses">متابعة تصفح المواد</Link></div>;
}
