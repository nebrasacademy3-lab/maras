"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { safeAccountReturnTo } from "@/lib/account-readiness";
import styles from "./social-auth-buttons.module.css";

export function SocialAuthButtons() {
  const [providers, setProviders] = useState({ google: false, apple: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/oauth/providers", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        setProviders({ google: data.google === true, apple: data.apple === true });
      }).catch(() => { /* Password sign-in remains fully available. */ });
    const code = new URLSearchParams(window.location.search).get("oauth_error");
    const messages: Record<string, string> = {
      account_exists: "يوجد حساب بهذا البريد. سجّل الدخول بالطريقة الأصلية أو استخدم «نسيت كلمة المرور». لا نربط الحسابات تلقائيًا حفاظًا على أمانك.",
      provider_unavailable: "طريقة الدخول غير مفعّلة حاليًا. يمكنك استخدام بريدك الإلكتروني.",
      email_required: "لم نحصل على بريد موثّق من مزوّد الدخول. استخدم التسجيل بالبريد.",
      device_limit: "وصل حسابك إلى الحد المسموح من الأجهزة. سجّل الخروج من جهاز سابق أو تواصل مع الدعم.",
      cancelled: "لم يكتمل تسجيل الدخول. يمكنك إعادة المحاولة.",
      rate_limited: "محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.",
      account_unavailable: "تعذر الدخول إلى هذا الحساب. تواصل مع الدعم.",
      invalid_state: "انتهت محاولة الدخول أو تعذر التحقق منها. ابدأ المحاولة من جديد.",
    };
    const timer = window.setTimeout(() => { if (code) setError(messages[code] || "تعذر الدخول الآن. حاول مجددًا أو استخدم البريد الإلكتروني."); }, 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, []);
  function start(provider: "google" | "apple") {
    setBusy(true);
    const params = new URLSearchParams(window.location.search);
    const returnTo = safeAccountReturnTo(params.get("return_to"), "");
    if (returnTo) {
      try { sessionStorage.setItem("meras_return_to", returnTo); } catch { /* The URL also preserves the destination. */ }
    }
    const query = new URLSearchParams();
    if (returnTo) query.set("return_to", returnTo);
    const referral = params.get("ref");
    if (referral && /^[A-Za-z0-9_-]{3,64}$/.test(referral)) query.set("ref", referral);
    window.location.assign(`/api/auth/oauth/${provider}/start?${query}`);
  }
  if (!providers.google && !providers.apple && !error) return null;
  return <div className={styles.root}>
    {error && <p className="form-error" role="alert">{error}</p>}
    {(providers.google || providers.apple) && <>
      <div className={styles.buttons}>
        {providers.google && <button type="button" disabled={busy} onClick={() => start("google")}><GoogleMark /><span>المتابعة باستخدام Google</span></button>}
        {providers.apple && <button type="button" disabled={busy} onClick={() => start("apple")} className={styles.apple}><AppleMark /><span>المتابعة باستخدام Apple</span></button>}
      </div>
      <p className={styles.hint}>حساب واحد، وتكمل بياناتك الدراسية بعد الدخول. <Link href="/privacy">خصوصيتك محفوظة</Link></p>
      <div className={styles.divider}><span>أو باستخدام البريد الإلكتروني</span></div>
    </>}
  </div>;
}
function GoogleMark() {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.25c1.9-1.75 2.97-4.32 2.97-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.41l-3.25-2.51c-.9.6-2.06.96-3.36.96-2.61 0-4.83-1.76-5.62-4.12H3.03v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.38 13.92a6 6 0 0 1 0-3.84V7.49H3.03a10 10 0 0 0 0 9.02l3.35-2.59Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.82 1.52l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.97 5.49l3.35 2.59A5.99 5.99 0 0 1 12 5.96Z"/></svg>;
}
function AppleMark() {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="currentColor" aria-hidden="true"><path d="M16.6 1.4c.1 1.3-.4 2.6-1.2 3.5-.8.9-2.1 1.6-3.4 1.5-.2-1.3.4-2.6 1.2-3.4.9-1 2.2-1.6 3.4-1.6ZM20.8 17.1c-.5 1.3-.8 1.9-1.5 3-1 1.5-2.3 3.3-4 3.3-1.5 0-1.9-1-4-1s-2.5 1-4 1c-1.7 0-2.9-1.6-3.9-3.1C.7 16.1.4 10.3 2.2 7.5c1.3-2 3.3-3.1 5.2-3.1 1.7 0 2.8 1 4.2 1s2.3-1 4.2-1c1.7 0 3.5.9 4.8 2.5-4.2 2.3-3.5 8.2.2 10.2Z"/></svg>;
}
