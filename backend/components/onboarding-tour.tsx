"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, CheckCircle2, FileUp, GraduationCap, LoaderCircle, PlayCircle, RefreshCw, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { BrandLogo } from "./brand-logo";
import { BrandMark } from "./brand-mark";
import { ThemeToggle } from "./theme-provider";
import { usePlatformControls } from "./use-platform-controls";
import { safeInternalReturnPath } from "@/lib/internal-return-route";

const steps = [
  { icon: UserRound, kicker: "ملفك الدراسي", title: "تجربة تبدأ من جامعتك وتخصصك", text: "يستخدم مراس بيانات ملفك الدراسي لترتيب المواد الأقرب لك، مع بقاء كامل الفهرس متاحًا متى احتجته.", points: ["اقتراحات مرتبطة بالجامعة والتخصص", "حساب واحد على الويب والتطبيق", "إعداداتك وتقدمك محفوظان"] },
  { icon: GraduationCap, kicker: "اكتشاف مرتب", title: "ابحث أولًا، ثم ضيّق النتائج عند الحاجة", text: "اكتب اسم المادة أو رمزها مباشرة. الفلاتر الإضافية تبقى مرتبة وبعيدة عن الواجهة حتى تطلبها.", points: ["بحث عربي سريع وواضح", "فلاتر جامعة وتخصص اختيارية", "مفضلة وسلة متزامنتان"] },
  { icon: PlayCircle, kicker: "تعلّم بلا انقطاع", title: "شاهد المجاني وواصل من آخر ثانية", text: "جرّب الدرس المتاح قبل الاشتراك، ثم تابع تقدمك من أي جهاز داخل مشغل مراس المحمي.", points: ["استكمال المشاهدة تلقائيًا", "سرعات وجودات متعددة", "وصول آمن بعد تأكيد الدفع"] },
  { icon: FileUp, kicker: "مادة غير موجودة؟", title: "أرسل طلبًا واضحًا وتابع حالته", text: "أضف اسم المادة ورمزها وارفع التوصيف أو السلايدات، ثم تابع تحديثات فريق المحتوى من لوحتك.", points: ["مرفقات خاصة مرتبطة بالطلب", "حالة واضحة لكل مرحلة", "إشعار عند كل تحديث مهم"] },
  { icon: ShieldCheck, kicker: "أنت جاهز", title: "كل ما تحتاجه في رحلة واحدة", text: "يمكنك الآن الاستكشاف والمشاهدة والاشتراك وطلب المواد والتواصل مع الفريق من واجهة عربية موحدة.", points: ["دفع مؤكد من الخادم", "إشعارات مرتبطة بحسابك", "صلاحيات منفصلة لكل دور"] },
];

function returnTarget() {
  const queryTarget = safeInternalReturnPath(new URLSearchParams(window.location.search).get("return_to"));
  const storedTarget = safeInternalReturnPath(sessionStorage.getItem("meras_return_to"));
  return queryTarget || storedTarget;
}

export function OnboardingTour({ firstName }: { firstName: string }) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const controls = usePlatformControls();
  const current = steps[step];
  const Icon = current.icon;
  const progress = ((step + 1) / steps.length) * 100;

  useEffect(() => {
    if (controls.loading || controls.error || controls.onboarding) return;
    const controller = new AbortController();
    fetch("/api/auth/me", { credentials: "include", cache: "no-store", signal: controller.signal })
      .finally(() => { if (!controller.signal.aborted) window.location.replace(returnTarget() || "/dashboard"); });
    return () => controller.abort();
  }, [controls.error, controls.loading, controls.onboarding]);

  async function finish() {
    setSubmitting(true);
    setSubmitError("");
    try {
      const response = await fetch("/api/profile/onboarding", { method: "POST", credentials: "include" });
      const payload = await response.json().catch(() => ({})) as { error?: string; message?: string; next?: string };
      if (!response.ok) throw new Error(payload.error || payload.message || "تعذّر حفظ إعداد البداية.");
      const storedTarget = returnTarget() || payload.next || "/dashboard";
      sessionStorage.removeItem("meras_return_to");
      const target = safeInternalReturnPath(storedTarget, "/dashboard");
      window.location.assign(target);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "تعذّر حفظ إعداد البداية. حاول مجددًا.");
      setSubmitting(false);
    }
  }

  if (controls.loading || (!controls.onboarding && !controls.error)) {
    return <main className="onboarding-page onboarding-gate"><header><BrandLogo compact /><ThemeToggle compact /></header><section><BrandMark /><LoaderCircle className="spin" size={22} /><h1>نجهّز لوحتك</h1><p>{controls.loading ? "نتحقق من إعداد تجربة البداية..." : "تم تجاوز دليل البداية وفق إعدادات المنصة، وسيتم فتح لوحتك الآن."}</p></section></main>;
  }

  if (controls.error) {
    return <main className="onboarding-page onboarding-gate"><header><BrandLogo compact /><ThemeToggle compact /></header><section><BrandMark /><h1>تعذّر التحقق من إعداد البداية</h1><p>لم نتمكن من قراءة إعدادات المنصة الآن. لم نفقد أي بيانات، ويمكنك إعادة المحاولة.</p><button type="button" className="button button-primary" onClick={() => void controls.refresh()}><RefreshCw size={16} /> إعادة المحاولة</button></section></main>;
  }

  return (
    <main className="onboarding-page" onKeyDown={(event) => {
      if (event.key === "ArrowLeft" && step < steps.length - 1) setStep((value) => value + 1);
      if (event.key === "ArrowRight" && step > 0) setStep((value) => value - 1);
    }}>
      <header><BrandLogo compact /><div className="onboarding-header-actions"><span><ShieldCheck size={14} /> تجربة آمنة ومخصصة</span><ThemeToggle compact /></div></header>
      {controls.maintenanceMessage && <div className="onboarding-maintenance" role="status">{controls.maintenanceMessage}</div>}
      <section className="onboarding-shell">
        <aside>
          <div className="onboarding-welcome"><span className="onboarding-avatar"><Sparkles size={18} /></span><div><span>أهلًا بك</span><strong>{firstName}</strong></div></div>
          <h1>دليل البداية</h1>
          <p>خمس محطات قصيرة توضّح لك أهم ما تحتاجه داخل مراس.</p>
          <div className="onboarding-progress">
            <div><span>تقدم الجولة</span><b>{step + 1} من {steps.length}</b></div>
            <i role="progressbar" aria-label="تقدم دليل البداية" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={step + 1}><em style={{ width: `${progress}%` }} /></i>
          </div>
          <nav aria-label="خطوات دليل البداية">{steps.map((item, index) => <button type="button" key={item.title} className={index === step ? "active" : index < step ? "done" : ""} onClick={() => setStep(index)} aria-current={index === step ? "step" : undefined} disabled={submitting}><i>{index < step ? <CheckCircle2 size={16} /> : index + 1}</i><span><strong>{item.kicker}</strong><small>{item.title}</small></span></button>)}</nav>
          <div className="onboarding-aside-note"><ShieldCheck size={16} /><span>هذه الجولة تعريفية فقط؛ لن نطلب فيها كلمة مرور أو بيانات دفع.</span></div>
        </aside>
        <article aria-live="polite">
          <div className="onboarding-visual" key={current.title}><span /><span /><BrandMark className="onboarding-official-mark" /><i><Icon size={45} /></i><b>{String(step + 1).padStart(2, "0")}</b></div>
          <div className="onboarding-copy">
            <span className="onboarding-kicker">{current.kicker}</span>
            <h2>{current.title}</h2>
            <p>{current.text}</p>
            <ul>{current.points.map((point) => <li key={point}><CheckCircle2 size={17} />{point}</li>)}</ul>
            {submitError && <p className="onboarding-error" role="alert">{submitError}</p>}
            <footer>
              <button type="button" className="button button-ghost" disabled={step === 0 || submitting} onClick={() => setStep((value) => value - 1)}>السابق</button>
              {step < steps.length - 1 ? <button type="button" className="button button-primary" onClick={() => setStep((value) => value + 1)}>التالي <ArrowLeft size={16} /></button> : <button type="button" className="button button-primary" disabled={submitting} onClick={() => void finish()}>{submitting ? <><LoaderCircle size={16} className="spin" /> جارٍ تجهيز لوحتك...</> : <>ابدأ في لوحتي <BookOpen size={16} /></>}</button>}
            </footer>
          </div>
        </article>
      </section>
    </main>
  );
}
