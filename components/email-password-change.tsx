"use client";
import { useEffect, useState } from "react";
import { KeyRound, Mail } from "lucide-react";

export function EmailPasswordChange({ onChanged }: { onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000); return () => clearTimeout(timer); }, [cooldown]);
  async function send() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/profile/password", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "send" }) });
      const data = await response.json().catch(() => ({})) as { error?: string; retryAfterSeconds?: number };
      if (!response.ok) throw new Error(data.error || "تعذر إرسال الرمز");
      setSent(true); setCooldown(data.retryAfterSeconds || 60); setMessage("أرسلنا رمز التغيير إلى بريد حسابك. الرمز صالح 10 دقائق.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر إرسال الرمز"); }
    finally { setBusy(false); }
  }
  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const newPassword = String(values.get("newPassword") || "");
    if (newPassword !== String(values.get("confirmPassword") || "")) { setError("تأكيد كلمة المرور غير متطابق"); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/profile/password", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "confirm", code: values.get("code"), newPassword }) });
      const data = await response.json().catch(() => ({})) as { error?: string; revokedSessions?: number };
      if (!response.ok) throw new Error(data.error || "تعذر تغيير كلمة المرور");
      setMessage(`تم تحديث كلمة المرور بنجاح${data.revokedSessions ? " وإنهاء الجلسات على الأجهزة الأخرى" : ""}.`);
      form.reset(); setSent(false); setCooldown(0); onChanged();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر تغيير كلمة المرور"); }
    finally { setBusy(false); }
  }
  return <form className="security-form" onSubmit={confirm} aria-busy={busy}><h3><KeyRound size={16} />تغيير كلمة المرور عبر البريد</h3><p>سنرسل رمزًا إلى بريد حسابك للتأكد من أنك صاحب الطلب. يمكنك إنشاء كلمة مرور أيضًا إن سجّلت بحساب Google أو Apple.</p><button type="button" className="button button-soft" disabled={busy || cooldown > 0} onClick={() => void send()}><Mail size={16} />{cooldown ? `إعادة الإرسال بعد ${cooldown} ثانية` : sent ? "إرسال رمز جديد" : "إرسال رمز التغيير"}</button>
    {sent && <><label>الرمز المرسل إلى بريدك<input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9٠-٩۰-۹]{6}" minLength={6} maxLength={6} dir="ltr" /></label><label>كلمة المرور الجديدة<input name="newPassword" type="password" required minLength={10} maxLength={128} autoComplete="new-password" dir="ltr" /></label><label>تأكيد كلمة المرور الجديدة<input name="confirmPassword" type="password" required minLength={10} maxLength={128} autoComplete="new-password" dir="ltr" /></label><small>10 أحرف على الأقل مع رقم ورمز خاص. سيتم تسجيل الخروج من الأجهزة الأخرى تلقائيًا.</small><button className="button button-primary" disabled={busy}>{busy ? "جارٍ التأكيد…" : "تأكيد الرمز وتحديث كلمة المرور"}</button></>}
    {message && <p className="auth-success" role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}
