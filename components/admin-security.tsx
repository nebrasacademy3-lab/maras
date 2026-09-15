"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, Clipboard, KeyRound, LoaderCircle, LockKeyhole, ShieldAlert, ShieldCheck, Smartphone } from "lucide-react";
import styles from "./admin-security.module.css";

type SecurityStatus = {
  enabled: boolean;
  pendingSetup: boolean;
  stepUpValid: boolean;
  stepUpExpiresAt: string | null;
  factor: null | {
    id: number;
    label: string;
    verifiedAt: string | null;
    createdAt: string;
  };
};

type SetupMaterial = { secret: string; otpauthUri: string };
type ApiResult = Partial<SecurityStatus & SetupMaterial> & { ok?: boolean; code?: string; error?: string };

const EMPTY_STATUS: SecurityStatus = {
  enabled: false,
  pendingSetup: false,
  stepUpValid: false,
  stepUpExpiresAt: null,
  factor: null,
};

function readableDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function AdminSecurity({ adminName, backHref }: { adminName: string; backHref: string }) {
  const [status, setStatus] = useState<SecurityStatus>(EMPTY_STATUS);
  const [setup, setSetup] = useState<SetupMaterial | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/security/mfa", { cache: "no-store", credentials: "same-origin" });
      const result = await response.json() as ApiResult;
      if (!response.ok) throw new Error(result.error || "تعذر تحميل إعدادات الأمان.");
      setStatus({
        enabled: Boolean(result.enabled),
        pendingSetup: Boolean(result.pendingSetup),
        stepUpValid: Boolean(result.stepUpValid),
        stepUpExpiresAt: result.stepUpExpiresAt || null,
        factor: result.factor || null,
      });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر تحميل إعدادات الأمان." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const request = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(request);
  }, [refresh]);

  async function submit(action: "setup" | "verify" | "stepUp" | "disable") {
    if (action !== "setup" && !/^\d{6}$/.test(code)) {
      setNotice({ kind: "error", text: "أدخل الرمز المكون من 6 أرقام من تطبيق المصادقة." });
      return;
    }
    if (action === "disable" && !window.confirm("هل تريد تعطيل المصادقة الإضافية لهذا الحساب؟")) return;
    setBusy(action);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/security/mfa", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, code }),
      });
      const result = await response.json() as ApiResult;
      if (!response.ok) throw new Error(result.error || "تعذر إكمال العملية.");

      if (action === "setup" && result.secret && result.otpauthUri) {
        setSetup({ secret: result.secret, otpauthUri: result.otpauthUri });
        setStatus((current) => ({ ...current, pendingSetup: true }));
        setNotice({ kind: "success", text: "أضف المفتاح إلى تطبيق المصادقة، ثم أدخل أول رمز للتفعيل." });
      } else if (action === "verify") {
        setSetup(null);
        setCode("");
        setNotice({ kind: "success", text: "تم تفعيل المصادقة الإضافية بنجاح." });
        await refresh();
      } else if (action === "stepUp") {
        setCode("");
        setStatus((current) => ({ ...current, stepUpValid: true, stepUpExpiresAt: result.stepUpExpiresAt || null }));
        setNotice({ kind: "success", text: "تم تأكيد هويتك. العمليات الحساسة متاحة لمدة ساعة واحدة." });
      } else {
        setSetup(null);
        setCode("");
        setStatus(EMPTY_STATUS);
        setNotice({ kind: "success", text: "تم تعطيل المصادقة الإضافية." });
      }
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر إكمال العملية." });
    } finally {
      setBusy("");
    }
  }

  async function copySecret() {
    if (!setup) return;
    try {
      await navigator.clipboard.writeText(setup.secret);
      setNotice({ kind: "success", text: "تم نسخ مفتاح الإعداد." });
    } catch {
      setNotice({ kind: "error", text: "تعذر النسخ تلقائيًا. حدّد المفتاح وانسخه يدويًا." });
    }
  }

  return (
    <main className={styles.page} dir="rtl">
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <Link href={backHref} className={styles.back}><ArrowRight size={17} /> العودة إلى الإدارة</Link>
            <p className={styles.eyebrow}><ShieldCheck size={17} /> مركز أمان الإدارة</p>
            <h1>حماية حساب {adminName}</h1>
            <p className={styles.lead}>فعّل رمزًا متغيرًا من تطبيق المصادقة، ثم استخدمه لتأكيد الحذف والتصدير المالي والإرسال والتغييرات الحساسة.</p>
          </div>
          <div className={`${styles.statusBadge} ${status.enabled ? styles.statusOn : styles.statusOff}`}>
            {status.enabled ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}
            <span>{status.enabled ? "الحماية الإضافية مفعلة" : "الحماية الإضافية غير مفعلة"}</span>
          </div>
        </header>

        {notice ? <div role="status" className={`${styles.notice} ${notice.kind === "success" ? styles.success : styles.error}`}>{notice.kind === "success" ? <Check size={19} /> : <ShieldAlert size={19} />}{notice.text}</div> : null}

        <section className={styles.grid} aria-busy={loading}>
          <article className={styles.primaryCard}>
            <div className={styles.cardHeading}>
              <span className={styles.icon}><Smartphone size={24} /></span>
              <div><h2>تطبيق المصادقة</h2><p>متوافق مع Google Authenticator وMicrosoft Authenticator و1Password وما شابهها.</p></div>
            </div>

            {loading ? (
              <div className={styles.loading}><LoaderCircle className={styles.spin} size={24} /> جارٍ تحميل حالة الأمان…</div>
            ) : !status.enabled ? (
              <div className={styles.flow}>
                {!setup ? (
                  <>
                    <div className={styles.step}><b>1</b><span>ابدأ الإعداد لإنشاء مفتاح خاص بهذا الحساب. لن يظهر المفتاح مرة أخرى بعد التفعيل.</span></div>
                    <button type="button" className={styles.primaryButton} onClick={() => void submit("setup")} disabled={Boolean(busy)}>
                      {busy === "setup" ? <LoaderCircle className={styles.spin} size={18} /> : <KeyRound size={18} />} بدء الإعداد الآمن
                    </button>
                  </>
                ) : (
                  <>
                    <div className={styles.step}><b>1</b><span>افتح تطبيق المصادقة وأضف حسابًا جديدًا باستخدام المفتاح التالي.</span></div>
                    <div className={styles.secretBox}>
                      <code dir="ltr">{setup.secret}</code>
                      <button type="button" onClick={() => void copySecret()} aria-label="نسخ مفتاح الإعداد"><Clipboard size={18} /></button>
                    </div>
                    <a className={styles.openApp} href={setup.otpauthUri}><Smartphone size={17} /> فتح تطبيق المصادقة على هذا الجهاز</a>
                    <div className={styles.step}><b>2</b><span>أدخل الرمز الظاهر في التطبيق لإتمام التفعيل.</span></div>
                    <CodeField code={code} setCode={setCode} />
                    <button type="button" className={styles.primaryButton} onClick={() => void submit("verify")} disabled={Boolean(busy)}>
                      {busy === "verify" ? <LoaderCircle className={styles.spin} size={18} /> : <ShieldCheck size={18} />} تفعيل الحماية
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className={styles.flow}>
                <div className={styles.enabledSummary}>
                  <ShieldCheck size={25} />
                  <div><strong>{status.factor?.label || "تطبيق المصادقة"}</strong><span>مفعّل منذ {readableDate(status.factor?.verifiedAt || null)}</span></div>
                </div>
                <div className={styles.step}><b><LockKeyhole size={16} /></b><span>للسماح بالعمليات الحساسة خلال الدقائق العشر القادمة، أدخل رمزًا جديدًا.</span></div>
                <CodeField code={code} setCode={setCode} />
                <div className={styles.actions}>
                  <button type="button" className={styles.primaryButton} onClick={() => void submit("stepUp")} disabled={Boolean(busy)}>
                    {busy === "stepUp" ? <LoaderCircle className={styles.spin} size={18} /> : <LockKeyhole size={18} />} تأكيد العمليات الحساسة
                  </button>
                  <button type="button" className={styles.dangerButton} onClick={() => void submit("disable")} disabled={Boolean(busy)}>
                    {busy === "disable" ? <LoaderCircle className={styles.spin} size={18} /> : <ShieldAlert size={18} />} تعطيل
                  </button>
                </div>
              </div>
            )}
          </article>

          <aside className={styles.sideCard}>
            <h2><LockKeyhole size={20} /> حالة التأكيد الحالي</h2>
            <div className={`${styles.stepUpState} ${status.stepUpValid ? styles.active : ""}`}>
              <span>{status.stepUpValid ? <Check size={20} /> : <KeyRound size={20} />}</span>
              <div><strong>{status.stepUpValid ? "تم تأكيد الهوية" : "يلزم رمز حديث"}</strong><p>{status.stepUpValid ? `ينتهي ${readableDate(status.stepUpExpiresAt)}` : "سيُطلب التأكيد قبل أي عملية حساسة."}</p></div>
            </div>
            <ul>
              <li>رمز المصادقة لا يُخزن بصورته الأصلية.</li>
              <li>التأكيد مرتبط بجلسة الإدارة الحالية فقط.</li>
              <li>لا يمكن استخدام الرمز نفسه أكثر من مرة.</li>
              <li>يُلغى التأكيد تلقائيًا بعد ساعة واحدة أو عند انتهاء جلسة الدخول.</li>
            </ul>
          </aside>
        </section>
      </div>
    </main>
  );
}

function CodeField({ code, setCode }: { code: string; setCode: (value: string) => void }) {
  return (
    <label className={styles.codeField}>
      <span>رمز المصادقة</span>
      <input
        dir="ltr"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="000000"
        aria-label="رمز المصادقة المكون من ستة أرقام"
      />
    </label>
  );
}
