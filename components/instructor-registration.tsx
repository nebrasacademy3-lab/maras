"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { authRequest } from "@/lib/auth-request";
import { emptyInstructorFields, InstructorProfileFields } from "./instructor-profile-fields";
import styles from "./instructor-workspace.module.css";

export function InstructorRegistration() {
  const [profile, setProfile] = useState(emptyInstructorFields);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const values = new FormData(event.currentTarget);
    if (values.get("password") !== values.get("passwordConfirmation")) { setError("كلمتا المرور غير متطابقتين"); return; }
    setBusy(true); setError("");
    try {
      const response = await authRequest("/api/instructor/register", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...profile, fullName: values.get("fullName"), email: values.get("email"), phone: values.get("phone"), password: values.get("password"), termsAccepted: values.get("termsAccepted") === "on", privacyAccepted: values.get("privacyAccepted") === "on" }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "تعذر إنشاء الحساب. حاول مرة أخرى.");
      // A full navigation loads the new role and session in all server/client guards.
      window.location.assign(new URL("/verify-email?return_to=%2Finstructor", window.location.origin).href);
    } catch (reason) { setError(reason instanceof Error && reason.name !== "AbortError" ? reason.message : "انتهت مهلة الطلب. تحقق من اتصالك، وحاول تسجيل الدخول قبل إعادة الإنشاء."); }
    finally { setBusy(false); }
  }
  return <form className={styles.panel} onSubmit={register}>
    <div className={styles.sectionTitle}><span><ShieldCheck size={23} /></span><div><h2>حسابك في فريق مراس</h2><p>ابدأ بالبيانات الأساسية، ثم أكمل ملفك ومستنداتك بعد تأكيد البريد.</p></div></div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <fieldset disabled={busy} className={styles.fieldset}><div className={styles.fields}>
      <label className={styles.fullWidth}>الاسم الكامل<input required name="fullName" autoComplete="name" minLength={5} maxLength={120} placeholder="الاسم كما يظهر في مستند الهوية" /></label>
      <label>البريد الإلكتروني<input required type="email" dir="ltr" name="email" autoComplete="email" maxLength={180} placeholder="name@example.com" /></label>
      <label>رقم الجوال الدولي<input required type="tel" dir="ltr" name="phone" autoComplete="tel" pattern="\+[1-9][0-9]{7,14}" maxLength={16} placeholder="+9665xxxxxxxx" /><small>أدخل رمز الدولة، دون مسافات أو صفر قبله.</small></label>
    </div><InstructorProfileFields value={profile} onChange={setProfile} includeExperience={false} />
    <div className={styles.fields}><label>كلمة المرور<input required name="password" type="password" minLength={10} maxLength={128} autoComplete="new-password" /><small>10 أحرف على الأقل، تتضمن رقمًا ورمزًا خاصًا.</small></label><label>تأكيد كلمة المرور<input required name="passwordConfirmation" type="password" minLength={10} maxLength={128} autoComplete="new-password" /></label></div>
    <label className={styles.check}><input required type="checkbox" name="termsAccepted" /><span>قرأت وأوافق على <Link href="/terms" target="_blank" rel="noopener noreferrer">الشروط والأحكام</Link>.</span></label>
    <label className={styles.check}><input required type="checkbox" name="privacyAccepted" /><span>اطلعت على <Link href="/privacy" target="_blank" rel="noopener noreferrer">سياسة الخصوصية</Link> المتعلقة ببيانات حسابي وطلب الانضمام.</span></label>
    <div className={styles.actions}><button type="submit" className="button button-primary">{busy ? "جارٍ إنشاء الحساب…" : "إنشاء الحساب وتأكيد البريد"}<ArrowLeft size={17} /></button><Link href="/login?return_to=%2Finstructor">لدي حساب شارح بالفعل</Link></div>
    <p className={styles.hint}>حساب الشارح مستقل عن حساب الطالب. يمكن استخدامه على جهازين معتمدين، ويمكنك تفعيل التحقق بخطوتين بعد الدخول.</p>
    </fieldset>
  </form>;
}
