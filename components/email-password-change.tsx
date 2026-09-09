"use client";
import { authRequest } from "@/lib/auth-request";
import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { PasswordFields } from "./password-fields";
import { VerificationCodeInput } from "./verification-code-input";
import { passwordRequirements } from "@/lib/auth-input";
import styles from "./security-form.module.css";

export function EmailPasswordChange({ onChanged }: { onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000); return () => clearTimeout(timer); }, [cooldown]);
  async function send() {
    if (busy || cooldown > 0) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await authRequest("/api/profile/password", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "send" }) });
      const data = await response.json().catch(() => ({})) as { error?: string; retryAfterSeconds?: number };
      if (!response.ok) throw new Error(data.error || "تعذر إرسال الرمز");
      setCode(""); setSent(true); setCooldown(data.retryAfterSeconds || 60); setMessage("أرسلنا رمز التغيير إلى بريد حسابك. الرمز صالح 10 دقائق.");
    } catch (caught) { setError(caught instanceof Error && !["TypeError", "TimeoutError", "AbortError"].includes(caught.name) ? caught.message : "تعذر الاتصال. حاول مرة أخرى."); }
    finally { setBusy(false); }
  }
  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (password !== confirmation) { setError("تأكيد كلمة المرور غير متطابق."); return; }
    if (!passwordRequirements(password).every(item => item.met)) { setError("أكمل متطلبات كلمة المرور الموضحة أدناه."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await authRequest("/api/profile/password", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "confirm", code, newPassword: password }) });
      const data = await response.json().catch(() => ({})) as { error?: string; revokedSessions?: number };
      if (!response.ok) throw new Error(data.error || "تعذر تغيير كلمة المرور");
      setMessage(`تم تحديث كلمة المرور بنجاح${data.revokedSessions ? " وإنهاء الجلسات على الأجهزة الأخرى" : ""}.`);
      setCode(""); setPassword(""); setConfirmation(""); setSent(false); setCooldown(0); onChanged();
    } catch (caught) { setError(caught instanceof Error && !["TypeError", "TimeoutError", "AbortError"].includes(caught.name) ? caught.message : "تعذر الاتصال. حاول مرة أخرى."); }
    finally { setBusy(false); }
  }
  return <form className={`${styles.panel} ${styles.account}`} onSubmit={confirm} aria-busy={busy} dir="rtl"><h3><KeyRound size={20} />كلمة المرور وأمان الحساب</h3><p>أكد طلبك برمز يصلك على البريد، ثم اختر كلمة مرور جديدة. يمكنك إنشاء كلمة مرور أيضًا إذا انضممت عبر Google أو Apple.</p><button type="button" className={`button button-soft ${styles.submit}`} disabled={busy || cooldown > 0} onClick={() => void send()}><Mail size={17} />{cooldown ? `إعادة الإرسال بعد ${cooldown} ثانية` : sent ? "إرسال رمز جديد" : busy ? "جارٍ إرسال الرمز…" : "إرسال رمز التغيير"}</button>
    {sent && <><label className={styles.field} htmlFor="password-change-code">الرمز المرسل إلى بريدك<VerificationCodeInput id="password-change-code" value={code} onChange={setCode} disabled={busy} /></label><p id="password-change-code-hint" className={styles.hint}>ألصق رمز التحقق المكوّن من 6 أرقام، أو اكتبه من اليسار إلى اليمين.</p><PasswordFields password={password} confirmation={confirmation} onPasswordChange={setPassword} onConfirmationChange={setConfirmation} /><p className={styles.note}><ShieldCheck size={18} />سيتم تسجيل الخروج من الأجهزة الأخرى بعد تحديث كلمة المرور.</p><button className={`button button-primary ${styles.submit}`} disabled={busy || code.length !== 6}>{busy ? "جارٍ التأكيد…" : "تأكيد الرمز وتحديث كلمة المرور"}</button></>}
    {message && <p className={styles.success} role="status"><CheckCircle2 size={17} />{message}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
  </form>;
}
