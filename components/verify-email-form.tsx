"use client";
import { authRequest } from "@/lib/auth-request";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { safeAccountReturnTo } from "@/lib/account-readiness";
import styles from "./verify-email-form.module.css";
import ui from "./security-form.module.css";
import { VerificationCodeInput } from "./verification-code-input";

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
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Email confirmation changes account readiness; reload server guards and cached client account state.
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
    setBusy("sending"); setError(""); setNotice("");
    try {
      const result = await readResult(await authRequest("/api/auth/email-verification", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "send" }) }));
      if (!alive.current) return;
      if (result.alreadyVerified) { continueAccount(result.next); return; }
      setCode("");
      setCooldown(result.retryAfterSeconds || 60);
      setNotice("أرسلنا رمزًا من 6 أرقام إلى بريدك. تحقق أيضًا من البريد غير المرغوب فيه.");
      input.current?.focus();
    } catch (caught) { if (alive.current) setError(caught instanceof Error && !["TypeError", "TimeoutError", "AbortError"].includes(caught.name) ? caught.message : "تعذر إرسال الرمز"); }
    finally { if (alive.current) setBusy(""); }
  }, []);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    void authRequest("/api/auth/email-verification", { credentials: "same-origin", cache: "no-store", signal: controller.signal }).then(readResult).then(async result => {
      if (controller.signal.aborted) return;
      if (result.emailVerified) { continueAccount(result.next); return; }
      setConfigured(result.deliveryConfigured !== false);
      setCooldown(result.cooldownSeconds || 0);
      if (result.deliveryConfigured === false) { setError("إرسال البريد غير متاح حاليًا. يمكنك التصفح والتواصل مع الدعم، وسيبقى الشراء متاحًا بعد تأكيد بريدك."); setBusy(""); }
      else if (!result.codeSent && !result.cooldownSeconds) await send();
      else { setNotice("أدخل آخر رمز أُرسل إلى بريدك. تأكيد البريد مطلوب مرة واحدة فقط."); setBusy(""); }
    }).catch(caught => { if (!controller.signal.aborted) { setError(caught instanceof Error && !["TypeError", "TimeoutError", "AbortError"].includes(caught.name) ? caught.message : "تعذر تحميل حالة البريد"); setBusy(""); } });
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
      const result = await readResult(await authRequest("/api/auth/email-verification", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "verify", code }) }));
      if (alive.current) continueAccount(result.next);
    } catch (caught) { if (alive.current) { setError(caught instanceof Error && !["TypeError", "TimeoutError", "AbortError"].includes(caught.name) ? caught.message : "تعذر تأكيد البريد"); setBusy(""); } }
  }

  return <div className={ui.panel} dir="rtl"><span className={ui.icon}><Mail size={29} /></span><div className={ui.heading}><span className={ui.eyebrow}>خطوة أخيرة، وتبدأ رحلتك</span><h1>بريدك هو مفتاح حسابك</h1><p>أدخل الرمز المرسل إلى بريدك لتأكيد ملكيته وحماية حسابك ومشترياتك.</p></div><div className={styles.email}><Mail size={18} aria-hidden="true" /><span dir="ltr">{email}</span></div>
    <form className={ui.form} onSubmit={verify} aria-busy={Boolean(busy)}><label className={ui.field} htmlFor="email-code">رمز التحقق<VerificationCodeInput id="email-code" inputRef={input} value={code} onChange={value => { setCode(value); setError(""); }} invalid={Boolean(error) && code.length > 0} disabled={busy === "verifying"} /></label><p id="email-code-hint" className={ui.hint}>ستة أرقام، من اليسار إلى اليمين. يمكنك لصق الرمز كاملًا.</p>
      {notice && <p className={ui.success} role="status"><CheckCircle2 size={17} />{notice}</p>}{error && <p className={ui.error} role="alert">{error}</p>}
      <div className={ui.actions}><button className={`button button-primary ${ui.submit}`} disabled={Boolean(busy) || code.length !== 6}>{busy === "verifying" ? "جارٍ التأكيد…" : <>تأكيد البريد والمتابعة <ArrowLeft size={17} /></>}</button>
      <button className={`button button-soft ${ui.submit}`} type="button" disabled={Boolean(busy) || cooldown > 0 || !configured} onClick={() => void send()}><RefreshCw size={15} />{busy === "sending" ? "جارٍ الإرسال…" : busy === "loading" ? "جارٍ تجهيز التحقق…" : cooldown ? `إعادة الإرسال بعد ${cooldown} ثانية` : "إرسال رمز جديد"}</button></div>
    </form><p className={ui.note}><ShieldCheck size={18} />الرمز صالح 10 دقائق ولمرة واحدة. تأكيد البريد مطلوب مرة واحدة لحسابك.</p><details className={styles.help}><summary>لم تصلني الرسالة</summary><p>تحقق من مجلد الرسائل غير المرغوب فيها، وتأكد من البريد الموضح أعلاه. إذا احتجت المساعدة، <Link href="/contact">تواصل مع فريق مراس</Link>.</p></details><Link className={ui.link} href="/courses">متابعة تصفح المواد</Link></div>;
}
