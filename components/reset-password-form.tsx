"use client";
import { authRequest } from "@/lib/auth-request";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";
import { PasswordFields } from "./password-fields";
import { passwordRequirements } from "@/lib/auth-input";
import styles from "./security-form.module.css";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const validToken = /^[A-Za-z0-9_-]{32,256}$/.test(token);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError("");
    if (password !== confirmation) { setError("تأكيد كلمة المرور غير متطابق."); return; }
    if (!passwordRequirements(password).every(item => item.met)) { setError("أكمل متطلبات كلمة المرور الموضحة أدناه."); return; }
    setLoading(true);
    try {
      const response = await authRequest("/api/auth/reset-password", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر تحديث كلمة المرور. جرّب طلب رابط جديد.");
      setPassword(""); setConfirmation(""); setDone(true);
      // The consumed one-time secret no longer needs to remain in browser history.
      window.history.replaceState(null, "", window.location.pathname);
    } catch (caught) { setError(caught instanceof Error && !["TypeError", "TimeoutError", "AbortError"].includes(caught.name) ? caught.message : "تعذر الاتصال. تحقق من اتصالك وحاول مرة أخرى."); }
    finally { setLoading(false); }
  }

  if (!validToken && !done) return <div className={styles.panel} dir="rtl"><span className={styles.icon}><KeyRound size={27} /></span><div className={styles.heading}><span className={styles.eyebrow}>نحتاج رابط الاستعادة</span><h1>افتح الرابط من بريدك</h1><p>هذا الرابط غير مكتمل. اطلب رسالة جديدة لبدء استعادة حسابك بأمان.</p></div><Link href="/forgot-password" className={`button button-primary ${styles.submit}`}>طلب رابط جديد <ArrowLeft size={17} /></Link><Link href="/login" className={styles.link}>العودة لتسجيل الدخول</Link></div>;
  if (done) return <div className={styles.panel} dir="rtl" role="status"><span className={styles.icon}><CheckCircle2 size={29} /></span><div className={styles.heading}><span className={styles.eyebrow}>تم التحديث بنجاح</span><h1>أهلًا بعودتك إلى مراس</h1><p>حُفظت كلمة المرور الجديدة وأُغلقت الجلسات السابقة. يمكنك الآن تسجيل الدخول ومتابعة موادك.</p></div><Link href="/login?reset=success" className={`button button-primary ${styles.submit}`}>تسجيل الدخول <ArrowLeft size={17} /></Link></div>;
  return <div className={styles.panel} dir="rtl"><span className={styles.icon}><KeyRound size={27} /></span><div className={styles.heading}><span className={styles.eyebrow}>الخطوة الأخيرة لاستعادة حسابك</span><h1>كلمة مرور جديدة، بداية مطمئنة</h1><p>اختر كلمة مرور مميزة لا تستخدمها في حساب آخر، ثم أكّدها للمتابعة.</p></div><form className={styles.form} onSubmit={submit} aria-busy={loading}><PasswordFields password={password} confirmation={confirmation} onPasswordChange={setPassword} onConfirmationChange={setConfirmation} />{error && <p className={styles.error} role="alert">{error}</p>}<button className={`button button-primary ${styles.submit}`} disabled={loading}>{loading ? "جارٍ تحديث كلمة المرور…" : <>حفظ كلمة المرور الجديدة <ArrowLeft size={17} /></>}</button></form><p className={styles.note}><ShieldCheck size={18} />عند الحفظ، تنتهي الجلسات السابقة لحماية حسابك.</p><Link href="/forgot-password" className={styles.link}>انتهت صلاحية الرابط؟ اطلب رابطًا جديدًا</Link></div>;
}
