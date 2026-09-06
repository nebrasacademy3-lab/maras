"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, KeyRound, Mail } from "lucide-react";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState<"" | "email" | "disabled">("");
  const [loading, setLoading] = useState(false);
  const [error,setError]=useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form=new FormData(event.currentTarget);
    try{const response=await fetch("/api/auth/forgot-password",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:form.get("email")})});const data=await response.json() as {error?:string;delivery?:string};if(!response.ok)throw new Error(data.error||"تعذر إرسال الطلب");setSent(data.delivery==="disabled"?"disabled":"email");}catch(caught){setError(caught instanceof Error?caught.message:"تعذر إرسال الطلب");}finally{setLoading(false);}
  };
  if (sent === "disabled") return <div className="welcome-step"><div className="welcome-check"><KeyRound size={38} /></div><span>الاستعادة عبر الدعم</span><h1>خدمة البريد غير مفعّلة حاليًا</h1><p>لا نستطيع إرسال رابط الاستعادة عبر البريد في الوقت الحالي. تواصل مع فريق الدعم من صفحة التواصل وسيساعدك في استعادة حسابك بعد التحقق من هويتك.</p><Link href="/contact" className="button button-primary">تواصل مع الدعم <ArrowLeft size={17} /></Link><p className="auth-switch">تذكرت كلمة المرور؟ <Link href="/login">سجّل الدخول</Link></p></div>;
  if (sent) return <div className="welcome-step"><div className="welcome-check"><CheckCircle2 size={38} /></div><span>تحقق من بريدك</span><h1>تحقق من بريدك</h1><p>إذا كان البريد مسجلًا فستصلك رسالة صالحة لمدة 15 دقيقة. افحص مجلد الرسائل غير المرغوب فيها أيضًا.</p><Link href="/login" className="button button-primary">العودة لتسجيل الدخول <ArrowLeft size={17} /></Link></div>;
  return <form className="auth-form" onSubmit={submit}>
    <div className="auth-heading"><span>استعادة آمنة</span><h1>نسيت كلمة المرور؟</h1><p>أدخل بريد حسابك وسنرسل لك رابطًا مؤقتًا لتعيين كلمة مرور جديدة.</p></div>
    <div className="privacy-note"><KeyRound size={18} /><span><strong>لن نكشف وجود الحساب</strong><small>ستظهر الرسالة نفسها سواء كان البريد مسجلًا أم لا.</small></span></div>
    <label className="form-label">البريد الإلكتروني<div className="input-with-icon"><Mail size={18} /><input name="email" required type="email" placeholder="name@example.com" dir="ltr" autoComplete="email" /></div></label>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <button className="button button-primary auth-submit" disabled={loading}>{loading ? <span className="button-loader" /> : <>إرسال رابط الاستعادة <ArrowLeft size={17} /></>}</button>
    <p className="auth-switch">تذكرت كلمة المرور؟ <Link href="/login">سجّل الدخول</Link></p>
  </form>;
}
