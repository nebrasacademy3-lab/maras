"use client";
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, KeyRound, Copy, Download } from "lucide-react";
import { confirmAction, notify } from "@/lib/interaction-events";
import styles from "./account-mfa-panel.module.css";
type Status = { enabled: boolean; pendingSetup: boolean; available: boolean; recoveryCodesRemaining: number };
export function AccountMfaPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [password, setPassword] = useState(""); const [code, setCode] = useState("");
  const [secret, setSecret] = useState(""); const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try { const response = await fetch("/api/account/mfa", { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر تحميل الأمان"); setStatus(result); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر تحميل إعداد الأمان"); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void refresh(), 0); return () => clearTimeout(timer); }, [refresh]);
  async function action(action: "setup" | "verify" | "recovery" | "disable") {
    if ((action === "disable" || action === "recovery") && !await confirmAction({ title: action === "disable" ? "تعطيل المصادقة الإضافية؟" : "استبدال رموز الاستعادة؟", message: action === "disable" ? "ستحتاج كلمة المرور فقط للدخول بعد التعطيل، وستُلغى الجلسات الأخرى." : "ستتوقف رموز الاستعادة السابقة. احفظ الرموز الجديدة في مكان آمن.", destructive: true })) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/account/mfa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, password, code }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر تعديل الأمان");
      if (result.secret) setSecret(result.secret);
      if (result.recoveryCodes) setRecoveryCodes(result.recoveryCodes);
      if (action !== "setup") { setSecret(""); setPassword(""); setCode(""); await refresh(); }
      notify(action === "verify" ? "تم تفعيل المصادقة الإضافية؛ احفظ رموز الاستعادة" : "تم تحديث إعداد الأمان", "success");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر إكمال الطلب"); }
    finally { setBusy(false); }
  }
  function saveRecovery() {
    const blob = new Blob([`مراس العلم — رموز استعادة الحساب\nكل رمز يستخدم مرة واحدة. لا تشارك هذه الرموز.\n\n${recoveryCodes.join("\n")}`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "maras-recovery-codes.txt"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className={styles.panel} aria-labelledby="account-mfa-title" data-testid="account-mfa"><div className={styles.heading}><span><ShieldCheck size={25} /></span><div><h3 id="account-mfa-title">المصادقة متعددة العوامل</h3><p>طبقة تحقق إضافية لحسابك، تفعّلها باختيارك.</p></div><b data-enabled={status?.enabled}>{status ? status.enabled ? "مفعّلة" : "غير مفعّلة" : "جارٍ التحميل"}</b></div>
    <p className={styles.copy}>عند التفعيل ستحتاج كلمة المرور ورمز تطبيق المصادقة، حتى عند استخدام Google أو Apple. احتفظ برموز الاستعادة خارج جهازك لتستخدمها عند فقدانه.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!status && <button type="button" className="button button-soft" onClick={() => void refresh()}>إعادة تحميل الإعداد</button>}
    {status && !status.available && <p>إعداد الخدمة غير مكتمل على الخادم. تواصل مع الدعم قبل التفعيل.</p>}
    {status?.available && <>
      <label>كلمة المرور الحالية<input autoComplete="current-password" type="password" maxLength={128} value={password} onChange={event => setPassword(event.target.value)} placeholder="لن تُحفظ في المتصفح" /></label>
      {secret && <div className={styles.secret}><strong>أضف المفتاح إلى تطبيق المصادقة</strong><p>نوع الحساب: TOTP · رمز من 6 أرقام يتغير كل 30 ثانية.</p><code dir="ltr">{secret}</code><button type="button" className="button button-ghost" onClick={() => void navigator.clipboard.writeText(secret).catch(() => setError("انسخ المفتاح يدويًا"))}><Copy size={16} />نسخ المفتاح</button></div>}
      {(status.enabled || secret || status.pendingSetup) && <label>رمز تطبيق المصادقة<input inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/[^0-9]/g, ""))} placeholder="000000" /></label>}
      <div className={styles.actions}>{!status.enabled ? <><button type="button" className="button button-primary" disabled={busy || !password} onClick={() => void action("setup")}>{secret ? "إنشاء مفتاح جديد" : "بدء التفعيل"}</button>{(secret || status.pendingSetup) && <button type="button" className="button button-primary" disabled={busy || !password || code.length !== 6} onClick={() => void action("verify")}>تحقق وفعّل</button>}</> : <><button type="button" className="button button-soft" disabled={busy || !password || code.length !== 6} onClick={() => void action("recovery")}><KeyRound size={16} />رموز استعادة جديدة</button><button type="button" className="button button-ghost" disabled={busy || !password || code.length !== 6} onClick={() => void action("disable")}>تعطيل التحقق الإضافي</button></>}</div>
      {status.enabled && <small>{status.recoveryCodesRemaining} رموز استعادة غير مستخدمة. لا يعرض المشرفون مفتاحك أو رموزك.</small>}
    </>}
    {recoveryCodes.length > 0 && <div className={styles.recovery}><h4>احفظ هذه الرموز الآن</h4><p>تظهر مرة واحدة فقط. لا ترسلها للدعم أو لأي شخص.</p><div dir="ltr">{recoveryCodes.map(value => <code key={value}>{value}</code>)}</div><button type="button" className="button button-soft" onClick={saveRecovery}><Download size={16} />حفظ نسخة خاصة</button><button type="button" className="button button-ghost" onClick={() => setRecoveryCodes([])}>حفظتها — إخفاء</button></div>}
  </section>;
}
