"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, LoaderCircle, ShieldCheck, Smartphone } from "lucide-react";
import { BrandLogo } from "./brand-logo";
import { ThemeToggle } from "./theme-provider";

export function MobilePaymentReturn({ orderNumber }: { orderNumber: string }) {
  const [opening, setOpening] = useState(Boolean(orderNumber));
  const deepLink = useMemo(() => orderNumber ? `merasalelm://orders?payment=return&order=${encodeURIComponent(orderNumber)}` : "", [orderNumber]);

  const openApp = useCallback(() => {
    if (!deepLink) return;
    setOpening(true);
    window.location.assign(deepLink);
  }, [deepLink]);

  useEffect(() => {
    if (!deepLink) return;
    const timer = window.setTimeout(openApp, 700);
    return () => window.clearTimeout(timer);
  }, [deepLink, openApp]);

  return <main className="mobile-payment-return" dir="rtl">
    <header><BrandLogo compact /><ThemeToggle compact /></header>
    <section>
      <div className="payment-return-icon">{orderNumber ? <CheckCircle2 size={42} /> : <ShieldCheck size={42} />}</div>
      <span>عودة آمنة من بوابة الدفع</span>
      <h1>{orderNumber ? "أكمل داخل تطبيق مراس" : "تعذر مطابقة رقم الطلب"}</h1>
      <p>{orderNumber ? "سنفتح سجل الطلبات في التطبيق، وهناك يتم التحقق من حالة الدفع وتفعيل المواد من الخادم. لا تغلق صفحة Tap قبل اكتمالها." : "افتح تطبيق مراس وانتقل إلى الطلبات والفواتير، أو سجّل الدخول إلى الموقع لمراجعة حسابك."}</p>
      {orderNumber && <code dir="ltr">{orderNumber}</code>}
      <div className="payment-return-actions">
        {orderNumber && <button type="button" className="button button-primary" onClick={openApp}>{opening ? <LoaderCircle className="spin" size={17} /> : <Smartphone size={17} />} فتح تطبيق مراس</button>}
        <Link className="button button-ghost" href="/login?return_to=%2Fdashboard%3Fview%3Dorders">عرض الطلبات في الموقع <ArrowLeft size={16} /></Link>
      </div>
      <small><ShieldCheck size={14} /> لا تعتمد مراس على صفحة العودة وحدها؛ التأكيد النهائي يصل مباشرة من Tap إلى الخادم.</small>
    </section>
  </main>;
}
