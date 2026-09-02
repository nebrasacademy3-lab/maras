"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, GraduationCap, LockKeyhole, Mail, Phone, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { SiteHeader } from "./site-header";
import type { Institution } from "@/lib/data";
import { useAcademicPrograms } from "@/components/use-academic-programs";
import { ACADEMIC_LEVELS } from "@/lib/academic-levels";
import { webDeviceHeaders } from "@/lib/client-device";

function safeReturnTo() {
  if (typeof window === "undefined") return "";
  const value = new URLSearchParams(window.location.search).get("return_to") || "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "";
}

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const timer = window.setTimeout(() => {
      if (params.get("reset") === "success") setNotice("تم تحديث كلمة المرور بنجاح، سجّل الدخول بكلمة المرور الجديدة.");
      else if (params.get("session") === "expired") setNotice("انتهت جلستك، سجّل الدخول من جديد للمتابعة.");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", ...webDeviceHeaders() },
        body: JSON.stringify({ identifier: form.get("identifier"), password: form.get("password"), remember: form.get("remember") === "on" }),
      });
      const data = await readAuthResponse(response);
      if (!response.ok) throw new Error(data.error || "تعذر تسجيل الدخول");
      const returnTo = safeReturnTo();
      if (returnTo && data.next !== "/onboarding" && data.next !== "/complete-profile") window.location.assign(returnTo);
      else {
        if (returnTo) sessionStorage.setItem("meras_return_to", returnTo);
        window.location.assign(data.next || "/dashboard");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تسجيل الدخول");
      setLoading(false);
    }
  };
  return <form className="auth-form" onSubmit={submit}>
    <div className="auth-heading"><span>مرحبًا بعودتك 👋</span><h1>سجّل دخولك إلى مراس</h1><p>أكمل من آخر درس، وتابع موادك ومشترياتك من مكان واحد.</p></div>
    {notice && <p className="auth-success" role="status">{notice}</p>}
    <label className="form-label">البريد الإلكتروني أو رقم الجوال<div className="input-with-icon"><Mail size={18} /><input name="identifier" required autoComplete="username" placeholder="name@example.com أو 05xxxxxxxx" dir="ltr" /></div><small className="field-hint">اكتب البريد المرتبط بحسابك، أو رقم الجوال بصيغة 05xxxxxxxx.</small></label>
    <label className="form-label">كلمة المرور<div className="input-with-icon"><LockKeyhole size={18} /><input name="password" required autoComplete="current-password" type={showPassword ? "text" : "password"} placeholder="أدخل كلمة المرور" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><small className="field-hint">أدخل كلمة المرور التي أنشأتها سابقًا، ويمكنك إظهارها للتأكد من الكتابة.</small></label>
    <div className="auth-options"><label><input name="remember" type="checkbox" defaultChecked /> تذكرني</label><Link href="/forgot-password">نسيت كلمة المرور؟</Link></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button button-primary auth-submit" disabled={loading}>{loading ? <span className="button-loader" /> : <>تسجيل الدخول <ArrowLeft size={17} /></>}</button>
    <p className="auth-security-note"><ShieldCheck size={15} /> جلسة مشفّرة ومحمية من محاولات الدخول المتكررة</p>
    <p className="auth-switch">ما عندك حساب؟ <PreserveAuthLink path="/register">أنشئ حسابك مجانًا</PreserveAuthLink></p>
  </form>;
}

type RegisterData = { fullName: string; phone: string; email: string; password: string; confirmPassword: string; universitySlug: string; specialty: string; academicLevel: string; termsAccepted: boolean };
const emptyRegister: RegisterData = { fullName: "", phone: "", email: "", password: "", confirmPassword: "", universitySlug: "", specialty: "", academicLevel: "", termsAccepted: false };

export function RegisterForm({ institutions }: { institutions: Institution[] }) {
  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(emptyRegister);
  const university = useMemo(() => institutions.find((item) => item.slug === data.universitySlug), [data.universitySlug, institutions]);
  const catalog = useAcademicPrograms(data.universitySlug);
  const update = <K extends keyof RegisterData>(field: K, value: RegisterData[K]) => setData((current) => ({ ...current, [field]: value }));

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (step === 1 && data.password !== data.confirmPassword) { setError("تأكيد كلمة المرور غير مطابق"); return; }
    if (step === 2 && (!data.universitySlug || !data.specialty || !data.academicLevel || catalog.loading)) { setError(catalog.loading ? "انتظر تحميل تخصصات الجامعة" : "اختر الجامعة والتخصص"); return; }
    if (step < 3) { setStep(step + 1); return; }
    if (!data.termsAccepted) { setError("يلزم الموافقة على الشروط وسياسة الخصوصية"); return; }
    setLoading(true);
    try {
      const referralCode = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("ref") || "";
      const response = await fetch("/api/auth/register", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", ...webDeviceHeaders() }, body: JSON.stringify({ ...data, referralCode }) });
      const result = await readAuthResponse(response);
      if (!response.ok) throw new Error(result.error || "تعذر إنشاء الحساب");
      const returnTo = safeReturnTo();
      if (returnTo) sessionStorage.setItem("meras_return_to", returnTo);
      window.location.assign(result.next || "/onboarding");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إنشاء الحساب");
      setLoading(false);
    }
  };

  return <form className="auth-form register-form" onSubmit={submit}>
    <div className="auth-steps">{[1,2,3].map((item) => <span key={item} className={step >= item ? "active" : ""}><i>{step > item ? <CheckCircle2 size={13} /> : item}</i><small>{["بياناتك","دراستك","تأكيد"][item - 1]}</small></span>)}</div>
    {step === 1 && <>
      <div className="auth-heading"><span>انضم إلى مراس</span><h1>أنشئ حسابك الآمن</h1><p>كل الحقول مطلوبة حتى تُربط مشترياتك وموادك وطلباتك بحساب واحد.</p></div>
      <label className="form-label">الاسم الكامل<div className="input-with-icon"><UserRound size={18} /><input required minLength={5} autoComplete="name" value={data.fullName} onChange={(event) => update("fullName", event.target.value)} placeholder="الاسم الثلاثي" /></div><small className="field-hint">اكتب اسمك كما تفضّل ظهوره في ملفك وشهاداتك.</small></label>
      <div className="two-fields"><label className="form-label">رقم الجوال السعودي<div className="input-with-icon"><Phone size={18} /><input required pattern="(?:\\+?966|0)?5[0-9]{8}" autoComplete="tel" value={data.phone} onChange={(event) => update("phone", event.target.value)} placeholder="05xxxxxxxx" dir="ltr" /></div><small className="field-hint">مثال صحيح: 05xxxxxxxx، ويُستخدم لاستعادة الحساب والتواصل.</small></label><label className="form-label">البريد الإلكتروني<div className="input-with-icon"><Mail size={18} /><input required type="email" autoComplete="email" value={data.email} onChange={(event) => update("email", event.target.value)} placeholder="name@example.com" dir="ltr" /></div><small className="field-hint">استخدم بريدًا تستطيع الوصول إليه لاستقبال التنبيهات المهمة.</small></label></div>
      <label className="form-label">كلمة المرور<div className="input-with-icon"><LockKeyhole size={18} /><input required minLength={10} maxLength={128} autoComplete="new-password" value={data.password} onChange={(event) => update("password", event.target.value)} type={showPassword ? "text" : "password"} placeholder="10 أحرف مع رقم ورمز خاص" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="إظهار كلمة المرور">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><small className="password-hint"><i className={data.password.length >= 10 ? "active" : ""} /> 10 أحرف <i className={/\d/.test(data.password) ? "active" : ""} /> رقم واحد <i className={/[^\p{L}\p{N}\s]/u.test(data.password) ? "active" : ""} /> رمز خاص</small></label>
      <label className="form-label">تأكيد كلمة المرور<div className="input-with-icon"><ShieldCheck size={18} /><input required minLength={10} maxLength={128} autoComplete="new-password" value={data.confirmPassword} onChange={(event) => update("confirmPassword", event.target.value)} type={showPassword ? "text" : "password"} placeholder="أعد كتابة كلمة المرور" /></div>{data.confirmPassword && <small className={data.password === data.confirmPassword ? "field-success" : "field-warning"}>{data.password === data.confirmPassword ? "كلمتا المرور متطابقتان" : "كلمتا المرور غير متطابقتين"}</small>}</label>
    </>}
    {step === 2 && <>
      <div className="auth-heading"><span>ملفك الدراسي</span><h1>جامعتك وتخصصك ومستواك</h1><p>هذه البيانات إلزامية لتخصيص المواد وإسناد طلباتك للمشرف المناسب.</p></div>
      <label className="form-label">الجامعة أو الكلية<div className="input-with-icon"><GraduationCap size={18} /><select required value={data.universitySlug} onChange={(event) => setData((current) => ({ ...current, universitySlug: event.target.value, specialty: "" }))}><option value="">اختر من القائمة الرسمية</option>{institutions.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></div></label>
      <label className="form-label">التخصص<div className="input-with-icon"><Sparkles size={18} /><select required disabled={!data.universitySlug || catalog.loading} value={data.specialty} onChange={(event) => update("specialty", event.target.value)}><option value="">{catalog.loading ? "جارٍ تحميل التخصصات الرسمية..." : data.universitySlug ? "اختر تخصصك في هذه الجهة" : "اختر الجامعة أولًا"}</option>{catalog.programs.map((item) => <option key={`${item.name}-${item.degree}`} value={item.name}>{item.name} — {item.degree}</option>)}</select></div>{data.universitySlug && !catalog.loading && !catalog.error && <small className="catalog-status"><CheckCircle2 size={13} /> {catalog.verified ? "تمت مطابقة القائمة مع المصدر الرسمي الآن" : "قائمة أكاديمية منظمة مع رابط المصدر الرسمي"} · {catalog.programs.length} برنامجًا</small>}{catalog.error && <small className="catalog-status">تعذر تحميل المصدر الرسمي، استخدم القائمة المتاحة</small>}</label>
      <label className="form-label">المستوى الدراسي<div className="input-with-icon"><GraduationCap size={18} /><select required value={data.academicLevel} onChange={(event) => update("academicLevel", event.target.value)}><option value="">اختر مستواك الحالي</option>{ACADEMIC_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}</select></div><small className="catalog-status">اختر «خريج» إذا أنهيت دراستك، ويمكن تحديث المستوى من الملف الشخصي لاحقًا.</small></label>
      <div className="privacy-note"><ShieldCheck size={18} /><span><strong>البيانات لا تظهر للعامة</strong><small>تُستخدم لتخصيص المحتوى والفواتير وطلبات المواد فقط.</small></span></div>
    </>}
    {step === 3 && <div className="register-review">
      <div className="welcome-check"><ShieldCheck size={35} /></div><span>راجع بياناتك</span><h1>خطوة أخيرة</h1><p>بعد الإنشاء سنعرض لك جولة قصيرة تشرح المنصة وطلب مادة غير متوفرة مع رفع السلايدات.</p>
      <dl><div><dt>الاسم</dt><dd>{data.fullName}</dd></div><div><dt>الجوال</dt><dd dir="ltr">{data.phone}</dd></div><div><dt>الجامعة</dt><dd>{university?.name}</dd></div><div><dt>التخصص</dt><dd>{data.specialty}</dd></div><div><dt>المستوى</dt><dd>{data.academicLevel}</dd></div></dl>
      <label className="terms-check"><input required type="checkbox" checked={data.termsAccepted} onChange={(event) => update("termsAccepted", event.target.checked)} /> <span>أوافق على <Link href="/terms">الشروط والأحكام</Link> و<Link href="/privacy">سياسة الخصوصية</Link>.</span></label>
    </div>}
    {(error || catalog.error) && <p className="form-error" role="alert">{error || catalog.error}</p>}
    <button className="button button-primary auth-submit" disabled={loading}>{loading ? <span className="button-loader" /> : <>{step === 3 ? "إنشاء الحساب وبدء الجولة" : "التالي"} <ArrowLeft size={17} /></>}</button>
    {step > 1 && <button type="button" className="back-step" onClick={() => { setError(""); setStep(step - 1); }}>العودة للخطوة السابقة</button>}
    {step === 1 && <p className="auth-switch">عندك حساب؟ <PreserveAuthLink path="/login">سجّل الدخول</PreserveAuthLink></p>}
  </form>;
}

export function AuthShell({ children, mode }: { children: React.ReactNode; mode: "login" | "register" }) {
  return <main className="auth-page"><SiteHeader /><div className="auth-grid"><section className="auth-panel">{children}</section><aside className="auth-visual"><div className="auth-visual-glow" /><div className="auth-visual-content"><span className="auth-visual-badge"><Sparkles size={15} /> تعلّم بثقة</span><h2>{mode === "login" ? "كل تقدمك محفوظ، وكأنك ما توقفت." : "حساب واحد لكل رحلتك الجامعية."}</h2><p>{mode === "login" ? "ارجع إلى آخر ثانية شاهدتها، وكمّل دروسك من أي جهاز." : "موادك ومشترياتك وطلبات المحتوى وفواتيرك مرتبطة بملفك الدراسي."}</p><div className="auth-proof-card"><div className="auth-proof-art">∑<i><PlayCircleIcon /></i></div><div><small>تكمل الآن</small><strong>الهياكل المتقطعة</strong><span>68% مكتمل</span><div><i /></div></div></div><ul><li><CheckCircle2 size={17} /> محتوى مرتبط بجامعتك وتخصصك</li><li><CheckCircle2 size={17} /> دفع آمن وتفعيل تلقائي</li><li><CheckCircle2 size={17} /> مشغل خاص وتقدم محفوظ</li></ul></div><p className="auth-quote">“شرح واضح، تجربة مرتبة، ودرس مجاني قبل الاشتراك.”</p></aside></div></main>;
}

async function readAuthResponse(response: Response): Promise<{ error?: string; next?: string }> {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) as { error?: string; next?: string } : {};
  } catch {
    return { error: response.status >= 500 ? "الخادم غير متاح مؤقتًا. تحقق من إعدادات Railway ثم حاول مرة أخرى." : `تعذر إكمال الطلب (رمز ${response.status}).` };
  }
}

function PlayCircleIcon() { return <span>▶</span>; }

function PreserveAuthLink({path,children}:{path:string;children:React.ReactNode}) {
  return <Link href={path} onClick={(event)=>{const returnTo=safeReturnTo();if(returnTo){event.preventDefault();window.location.assign(`${path}?return_to=${encodeURIComponent(returnTo)}`);}}}>{children}</Link>;
}
