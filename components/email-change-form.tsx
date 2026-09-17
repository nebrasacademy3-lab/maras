"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Mail, ShieldCheck, X } from "lucide-react";
import { authRequest } from "@/lib/auth-request";
import { VerificationCodeInput } from "@/components/verification-code-input";
import styles from "./security-form.module.css";

type ChangeState = {
  active: boolean;
  currentEmail: string;
  newEmail: string;
  currentVerified: boolean;
  newVerified: boolean;
  expiresInSeconds: number;
};

type ApiResult = Partial<ChangeState> & {
  error?: string;
  ok?: boolean;
  completed?: boolean;
  revokedSessions?: number;
};

export function EmailChangeForm() {
  const [state, setState] = useState<ChangeState>({ active: false, currentEmail: "", newEmail: "", currentVerified: false, newVerified: false, expiresInSeconds: 0 });
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [busy, setBusy] = useState<"loading" | "request" | "verify-current" | "verify-new" | "cancel" | "">("loading");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function call(body: Record<string, unknown>) {
    const response = await authRequest("/api/profile/email", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({})) as ApiResult;
    if (!response.ok) throw new Error(data.error || "تعذر إكمال تغيير البريد.");
    return data;
  }

  useEffect(() => {
    let alive = true;
    authRequest("/api/profile/email", { credentials: "same-origin", cache: "no-store" })
      .then(async response => {
        const data = await response.json().catch(() => ({})) as ApiResult;
        if (!response.ok) throw new Error(data.error || "تعذر تحميل حالة تغيير البريد.");
        return data;
      })
      .then(data => {
        if (!alive) return;
        setState({
          active: Boolean(data.active),
          currentEmail: data.currentEmail || "",
          newEmail: data.newEmail || "",
          currentVerified: Boolean(data.currentVerified),
          newVerified: Boolean(data.newVerified),
          expiresInSeconds: Number(data.expiresInSeconds || 0),
        });
        if (data.active) setNewEmail(data.newEmail || "");
        setBusy("");
      })
      .catch(caught => {
        if (alive) {
          setError(caught instanceof Error ? caught.message : "تعذر تحميل حالة تغيير البريد.");
          setBusy("");
        }
      });
    return () => { alive = false; };
  }, []);

  async function requestChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy("request"); setError(""); setMessage("");
    try {
      const data = await call({ action: "request", newEmail, currentPassword });
      setState({
        active: true,
        currentEmail: data.currentEmail || "",
        newEmail: data.newEmail || newEmail,
        currentVerified: false,
        newVerified: false,
        expiresInSeconds: Number(data.expiresInSeconds || 0),
      });
      setCurrentCode(""); setNewCode(""); setCurrentPassword("");
      setMessage("أرسلنا رمزًا إلى بريدك الحالي وإلى البريد الجديد. يجب تأكيد الرمزين لإتمام التغيير.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر بدء تغيير البريد.");
    } finally {
      setBusy("");
    }
  }

  async function verify(target: "current" | "new") {
    if (busy) return;
    setBusy(target === "current" ? "verify-current" : "verify-new"); setError(""); setMessage("");
    try {
      const data = await call({ action: "verify", target, code: target === "current" ? currentCode : newCode });
      if (data.completed) {
        setMessage("تم تغيير البريد بنجاح وإنهاء الجلسات الأخرى لحماية الحساب.");
        setState(value => ({ ...value, active: false, currentEmail: data.email || value.newEmail, newEmail: "", currentVerified: true, newVerified: true }));
        setCurrentCode(""); setNewCode("");
        window.setTimeout(() => window.location.assign("/dashboard?view=account"), 500);
      } else {
        setState(value => ({ ...value, currentVerified: Boolean(data.currentVerified), newVerified: Boolean(data.newVerified) }));
        setMessage(target === "current" ? "تم تأكيد بريدك الحالي. أكّد الرمز المرسل إلى البريد الجديد." : "تم تأكيد البريد الجديد. أكّد الرمز المرسل إلى بريدك الحالي.");
        if (target === "current") setCurrentCode(""); else setNewCode("");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تأكيد الرمز.");
    } finally {
      setBusy("");
    }
  }

  async function cancel() {
    if (busy) return;
    setBusy("cancel"); setError(""); setMessage("");
    try {
      await call({ action: "cancel" });
      setState(value => ({ ...value, active: false }));
      setNewEmail(""); setCurrentCode(""); setNewCode("");
      setMessage("أُلغي طلب تغيير البريد.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إلغاء الطلب.");
    } finally {
      setBusy("");
    }
  }

  return <section className={styles.panel + " " + styles.account} dir="rtl" aria-labelledby="email-change-title">
    <h3 id="email-change-title"><Mail size={20} />تغيير البريد الإلكتروني</h3>
    <p>لحماية الحساب، نرسل رمزًا إلى البريد الحالي وإلى البريد الجديد. عند اكتمال التحقق تبقى مشترياتك وتقدمك وفواتيرك مرتبطة بالحساب نفسه.</p>
    {!state.active
      ? <form onSubmit={requestChange}>
          <label className={styles.field}>البريد الجديد<input type="email" required value={newEmail} onChange={event => setNewEmail(event.target.value)} autoComplete="email" dir="ltr" maxLength={180} /></label>
          <label className={styles.field}>كلمة المرور الحالية (إن وُجدت)<input type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoComplete="current-password" dir="ltr" maxLength={128} /></label>
          <button className={"button button-primary " + styles.submit} disabled={busy !== "" || busy === "loading"}>{busy === "request" ? "جارٍ إرسال الرموز…" : "إرسال رموز التأكيد"}</button>
        </form>
      : <div>
          <p className={styles.note}><ShieldCheck size={18} />الحالة: {state.currentVerified ? "تم تأكيد البريد الحالي" : "بانتظار تأكيد البريد الحالي"} · {state.newVerified ? "تم تأكيد البريد الجديد" : "بانتظار تأكيد البريد الجديد"}.</p>
          {!state.currentVerified && <label className={styles.field}>رمز البريد الحالي<VerificationCodeInput id="email-change-current-code" value={currentCode} onChange={setCurrentCode} disabled={Boolean(busy)} /></label>}
          {!state.newVerified && <label className={styles.field}>رمز البريد الجديد<VerificationCodeInput id="email-change-new-code" value={newCode} onChange={setNewCode} disabled={Boolean(busy)} /></label>}
          <div className={styles.actions}>
            {!state.currentVerified && <button type="button" className={"button button-primary " + styles.submit} disabled={busy !== "" || currentCode.length !== 6} onClick={() => void verify("current")}>{busy === "verify-current" ? "جارٍ التأكيد…" : "تأكيد البريد الحالي"}</button>}
            {!state.newVerified && <button type="button" className={"button button-soft " + styles.submit} disabled={busy !== "" || newCode.length !== 6} onClick={() => void verify("new")}>{busy === "verify-new" ? "جارٍ التأكيد…" : "تأكيد البريد الجديد"}</button>}
            <button type="button" className={"button button-ghost " + styles.submit} disabled={Boolean(busy)} onClick={() => void cancel()}><X size={15} />إلغاء الطلب</button>
          </div>
        </div>}
    {message && <p className={styles.success} role="status"><CheckCircle2 size={17} />{message}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
}
