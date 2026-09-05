"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BadgeCheck, BrainCircuit, Check, CreditCard, Crown, FileText, Languages, LoaderCircle, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import type { AiEntitlementStatus } from "@/lib/ai-contracts";
import styles from "./ai-subscription-checkout.module.css";
import { continueRequiredAccountStep } from "./purchase-access";

export function AiSubscriptionCheckout({ price, entitlement, returnOrder }: { price: number; entitlement: AiEntitlementStatus; returnOrder: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(returnOrder ? "نتحقق من الدفع لدى Tap…" : "");
  const [paid, setPaid] = useState(false);
  const attemptKey = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!returnOrder) return;
    let stopped = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = async () => {
      attempts += 1;
      try {
        const response = await fetch(`/api/ai/subscription/checkout?order=${encodeURIComponent(returnOrder)}`, { cache: "no-store", credentials: "same-origin" });
        const body = await response.json() as { order?: { status: string; entitlementExpiresAt: string | null }; error?: string };
        if (!response.ok) throw new Error(body.error || "تعذر التحقق من الطلب");
        if (body.order?.status === "paid") {
          setPaid(true);
          setStatus(`تم تفعيل اشتراكك${body.order.entitlementExpiresAt ? ` حتى ${new Date(body.order.entitlementExpiresAt).toLocaleDateString("ar-SA")}` : ""}.`);
          return;
        }
        if (["failed", "cancelled", "declined"].includes(body.order?.status || "")) {
          setStatus("");
          setError("لم تكتمل عملية الدفع. يمكنك بدء محاولة جديدة.");
          return;
        }
        setStatus("وصلت عودتك من بوابة الدفع، وننتظر تأكيد Tap الآمن…");
      } catch (caught) {
        if (!stopped) setError(caught instanceof Error ? caught.message : "تعذر التحقق من الطلب");
      }
      if (!stopped && attempts < 15) timer = setTimeout(check, 2_000);
    };
    void check();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [returnOrder]);

  const pay = async () => {
    if (loading) return;
    setLoading(true); setError(""); setStatus("");
    try {
      const response = await fetch("/api/ai/subscription/checkout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "idempotency-key": attemptKey.current },
        body: JSON.stringify({ product: "meras-ai" }),
      });
      const body = await response.json() as { checkoutUrl?: string; pending?: boolean; orderNumber?: string; error?: string; code?: string };
      if (!response.ok) {
        if (continueRequiredAccountStep(body)) return;
        if (!body.pending) attemptKey.current = crypto.randomUUID();
        throw new Error(body.error || "تعذر بدء الدفع");
      }
      if (body.checkoutUrl) { window.location.assign(body.checkoutUrl); return; }
      if (body.pending) { setStatus(`الطلب ${body.orderNumber || ""} قيد التحقق ولم ننشئ مطالبة مكررة.`); return; }
      throw new Error("لم تُرجع بوابة الدفع رابطًا صالحًا");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر بدء الدفع"); }
    finally { setLoading(false); }
  };

  return <div className={styles.page} dir="rtl"><div className={styles.shell}>
    <section className={styles.pitch}>
      <span className={styles.logo}><Sparkles size={30}/></span><small>خطة أدوات مراس بلس</small><h1>حوّل ملفاتك إلى وقت مذاكرة أذكى</h1><p>حدود موسعة للمحادثة والتلخيص والترجمة والاختبارات، مع حفظ كل أعمالك داخل حسابك.</p>
      <div className={styles.features}><article><BrainCircuit size={19}/><div><b>محادثات تعليمية موسعة</b><span>شرح عربي واضح وسجل منظم.</span></div></article><article><FileText size={19}/><div><b>تلخيص ملفات أكثر</b><span>ملخصات مرتبة من محتوى المحاضرة.</span></div></article><article><Languages size={19}/><div><b>ترجمة علمية دقيقة</b><span>حفظ المصطلحات والمعادلات والوحدات.</span></div></article><article><BadgeCheck size={19}/><div><b>اختبارات تفاعلية</b><span>أسئلة وبطاقات مع شرح الإجابة.</span></div></article></div>
      <p className={styles.included}><Crown size={16}/> إذا كنت مشتركًا في أي مادة نشطة، تحصل على خطة الأدوات تلقائيًا دون شراء مستقل.</p>
    </section>
    <aside className={styles.checkout}>
      <div className={styles.secure}><LockKeyhole size={17}/> دفع آمن عبر Tap</div><h2>الاشتراك الشهري</h2><p>يتجدد الوصول بشراء شهر جديد. السعر يحدده الخادم ولا يُقبل أي سعر من المتصفح.</p>
      <div className={styles.price}><strong>{price}</strong><span>ريال سعودي<small>لمدة شهر</small></span></div>
      <div className={styles.payment}><CreditCard size={21}/><div><b>بطاقة، مدى أو Apple Pay</b><span>تدخل بياناتك في صفحة Tap المستضافة</span></div><Check size={16}/></div>
      {entitlement.tier === "subscriber" ? <div className={styles.active}><BadgeCheck size={19}/><span><b>خطة المشترك مفعلة لديك الآن</b><small>المصدر: {entitlement.source === "course" ? "اشتراك مادة" : "اشتراك أو هدية أدوات"}</small></span></div> : null}
      {status ? <div className={`${styles.message} ${paid ? styles.success : ""}`} role="status" aria-live="polite">{paid ? <BadgeCheck size={18}/> : <LoaderCircle className={styles.spin} size={18}/>}<span>{status}</span></div> : null}
      {error ? <div className={`${styles.message} ${styles.failure}`} role="alert">{error}</div> : null}
      {paid ? <Link className={styles.pay} href="/study-tools"><Sparkles size={18}/> ابدأ استخدام أدوات مراس</Link> : <button className={styles.pay} onClick={()=>void pay()} disabled={loading}>{loading?<LoaderCircle className={styles.spin} size={18}/>:<CreditCard size={18}/>} المتابعة للدفع · {price} ر.س</button>}
      <p className={styles.note}><ShieldCheck size={14}/> لا تمر معلومات بطاقتك عبر خوادم مراس. التفعيل لا يحدث إلا بعد تأكيد CAPTURED من Tap.</p>
      <Link className={styles.back} href="/study-tools">العودة إلى أدوات مراس</Link>
    </aside>
  </div></div>;
}
