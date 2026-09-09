"use client";
import { authRequest } from "@/lib/auth-request";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, KeyRound, Mail, ShieldCheck } from "lucide-react";
import styles from "./security-form.module.css";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState<"" | "email" | "disabled">("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const submittedEmail = String(new FormData(event.currentTarget).get("email") || "").trim();
    setEmail(submittedEmail);
    setLoading(true); setError("");
    try {
      const response = await authRequest("/api/auth/forgot-password", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: submittedEmail }) });
      const data = await response.json().catch(() => ({})) as { error?: string; delivery?: string };
      if (!response.ok) throw new Error(data.error || "تعذر إرسال الطلب. حاول مرة أخرى.");
      setSent(data.delivery === "disabled" ? "disabled" : "email");
    } catch (caught) { setError(caught instanceof Error && !["TypeError", "TimeoutError", "AbortError"].includes(caught.name) ? caught.message : "تعذر الاتصال. تحقق من اتصالك وحاول مرة أخرى."); }
    finally { setLoading(false); }
  }
  if (sent) return <div className={styles.panel} dir="rtl" role="status"><span className={styles.icon}>{sent === "disabled" ? <KeyRound size={28} /> : <CheckCircle2 size={29} />}</span><div className={styles.heading}><span className={styles.eyebrow}>{sent === "disabled" ? "فريق مراس معك" : "الخطوة التالية في بريدك"}</span><h1>{sent === "disabled" ? "سنساعدك على استعادة حسابك" : "تحقّق من صندوق الوارد"}</h1><p>{sent === "disabled" ? "خدمة البريد غير متاحة حاليًا. تواصل مع فريق الدعم لمساعدتك على استعادة الحساب بعد التحقق من هويتك." : "إذا كان هذا البريد مرتبطًا بحساب، فستصلك رسالة برابط صالح لمدة 15 دقيقة. افتح أحدث رسالة وأكمل الخطوات."}</p></div>{sent === "email" && <><p className={styles.note}><Mail size={19} /><span dir="ltr" style={{ overflowWrap: "anywhere", minWidth: 0 }}>{email.trim()}</span></p><p className={styles.hint}>لم تجد الرسالة؟ تحقق من البريد غير المرغوب فيه، وتأكد من صحة عنوان بريدك.</p><button type="button" className={styles.link} style={{ border: 0, background: "transparent", cursor: "pointer" }} onClick={() => setSent("")}>تعديل البريد أو المحاولة مجددًا</button></>}<Link href={sent === "disabled" ? "/contact" : "/login"} className={`button button-primary ${styles.submit}`}>{sent === "disabled" ? "التواصل مع الدعم" : "العودة لتسجيل الدخول"}<ArrowLeft size={17} /></Link></div>;
  return <div className={styles.panel} dir="rtl"><span className={styles.icon}><KeyRound size={28} /></span><div className={styles.heading}><span className={styles.eyebrow}>نساعدك على العودة</span><h1>نسيت كلمة المرور؟</h1><p>اكتب بريدك المرتبط بمراس. سنرسل لك رابطًا مؤقتًا لتعيين كلمة مرور جديدة ومتابعة رحلتك.</p></div><form className={styles.form} onSubmit={submit} aria-busy={loading}><label className={styles.field} htmlFor="recovery-email">البريد الإلكتروني<span className={styles.input}><Mail size={19} aria-hidden="true" /><input id="recovery-email" name="email" required type="email" placeholder="name@example.com" dir="ltr" autoComplete="email" inputMode="email" autoCapitalize="off" spellCheck={false} maxLength={254} defaultValue={email} /></span></label>{error && <p className={styles.error} role="alert">{error}</p>}<button className={`button button-primary ${styles.submit}`} disabled={loading}>{loading ? "جارٍ إرسال رابط الاستعادة…" : <>إرسال رابط الاستعادة <ArrowLeft size={17} /></>}</button></form><p className={styles.note}><ShieldCheck size={18} />رابط خاص بحسابك، يُستخدم مرة واحدة. لا تشاركه مع أحد.</p><p className={styles.footer}>تذكرت كلمة المرور؟ <Link href="/login" className={styles.link}>سجّل الدخول</Link></p></div>;
}
