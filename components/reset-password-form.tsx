"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";
import { PasswordField } from "./security-fields";
import { acceptsNewPassword } from "@/lib/security-form";
export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [done, setDone] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (loading) return; setError("");
    if (!acceptsNewPassword(password)) { setError("استخدم 10 أحرف على الأقل مع رقم ورمز خاص."); return; }
    if (password !== confirmation) { setError("كلمتا المرور غير متطابقتين. راجع التأكيد."); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }), signal: AbortSignal.timeout(20000) });
      const data = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || data?.ok !== true) throw new Error(data.error || "تعذر تغيير كلمة المرور. جرّب طلب رابط جديد.");
      setPassword(""); setConfirmation(""); setDone(true);
    } catch (caught) { setError(caught instanceof Error && !["TimeoutError", "AbortError", "TypeError"].includes(caught.name) ? caught.message : "تعذر الاتصال. تحقق من الإنترنت ثم حاول مرة أخرى."); }
    finally { setLoading(false); }
  }
  if (done) return <div className="security-result" role="status"><span className="security-feature-icon success"><CheckCircle2 size={32} /></span><span className="eyebrow">بداية جديدة، وتقدّم محفوظ</span><h1>تم تحديث كلمة المرور</h1><p>أُغلقت الجلسات السابقة لحماية حسابك. سجّل الدخول بكلمة المرور الجديدة.</p><Link href="/login?reset=success" className="button button-primary">تسجيل الدخول <ArrowLeft size={17} /></Link></div>;
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) return <div className="security-result"><span className="security-feature-icon"><KeyRound size={30} /></span><h1>لنحصل على رابط جديد</h1><p>رابط الاستعادة غير مكتمل أو غير صالح. اطلب رابطًا جديدًا إلى بريد حسابك.</p><Link href="/forgot-password" className="button button-primary">طلب رابط الاستعادة</Link></div>;
  return <form className="auth-form security-form-modern" onSubmit={submit} aria-busy={loading}><span className="security-feature-icon"><KeyRound size={29} /></span><div className="auth-heading"><span>الخطوة الأخيرة لاستعادة حسابك</span><h1>كلمة مرور جديدة</h1><p>اختر كلمة مرور فريدة لا تستخدمها في حسابات أخرى.</p></div><PasswordField name="password" label="كلمة المرور الجديدة" value={password} onChange={setPassword} disabled={loading} requirements /><PasswordField name="confirmation" label="تأكيد كلمة المرور الجديدة" value={confirmation} onChange={setConfirmation} disabled={loading} />{confirmation && confirmation !== password && <small className="security-mismatch">التأكيد لا يطابق كلمة المرور بعد.</small>}{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-primary auth-submit" disabled={loading}>{loading ? "جارٍ تحديث كلمة المرور…" : <>حفظ كلمة المرور <ArrowLeft size={17} /></>}</button><p className="security-inline-note"><ShieldCheck size={16} />بعد الحفظ، ستُغلق الجلسات السابقة تلقائيًا.</p><Link className="security-text-link" href="/forgot-password">الرابط منتهي؟ اطلب رابطًا جديدًا</Link></form>;
}
