"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, CreditCard, Gift, LoaderCircle, LockKeyhole, ShieldCheck, ShoppingBag, Trash2 } from "lucide-react";
import type { Course } from "@/lib/data";
import { syncCommerce } from "./commerce-state";
import { CourseCoverImage } from "./course-cover-image";
import { usePlatformControls } from "./use-platform-controls";
import { checkoutIntent, clearCheckoutAttempt, getCheckoutAttemptKey } from "@/lib/checkout-attempt-client";

type CartPayload = { items: Course[]; subtotal: number; count: number; courseSlugs?: string[] };
type CheckoutResult = { checkoutUrl?: string; mode?: string; pending?: boolean; error?: string; newAttemptRequired?: boolean };

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export function CartClient() {
  const controls = usePlatformControls();
  const [cart, setCart] = useState<CartPayload>({ items: [], subtotal: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [coupon, setCoupon] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const [discount, setDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState("");
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [busySlug, setBusySlug] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/cart", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => { const data = await response.json() as CartPayload & { error?: string }; if (!response.ok) throw new Error(data.error || "تعذر تحميل السلة"); return data; })
      .then((data) => { if (!controller.signal.aborted) { setCart({ items: data.items || [], subtotal: data.subtotal || 0, count: data.count || 0 }); syncCommerce({ cartSlugs: data.courseSlugs || (data.items || []).map((item) => item.slug) }); setLoading(false); } })
      .catch((caught) => { if (!controller.signal.aborted) { setError(caught instanceof Error ? caught.message : "تعذر تحميل السلة"); setLoading(false); } });
    return () => controller.abort();
  }, []);

  async function remove(slug: string) {
    setBusySlug(slug); setError("");
    try {
      const response = await fetch("/api/cart", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseSlug: slug, active: false }) });
      const data = await response.json() as CartPayload & { error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر حذف المادة");
      setCart({ items: data.items || [], subtotal: data.subtotal || 0, count: data.count || 0 });
      syncCommerce({ cartSlugs: data.courseSlugs || (data.items || []).map((item) => item.slug) });
      setDiscount(0); setAppliedCoupon(""); setCouponMessage("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر حذف المادة"); }
    finally { setBusySlug(""); }
  }

  async function applyCoupon() {
    if (controls.loading || controls.error || !controls.purchases) {
      setCouponMessage(controls.maintenanceMessage || "الشراء واستخدام الأكواد متوقفان مؤقتًا");
      return;
    }
    const code = coupon.trim().toUpperCase();
    if (!code || !cart.items.length) return;
    setCouponMessage("جارٍ التحقق..."); setDiscount(0); setAppliedCoupon("");
    try {
      const response = await fetch("/api/coupons/validate", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, courseSlugs: cart.items.map((item) => item.slug) }) });
      const data = await response.json() as { discount?: number; code?: string; label?: string; error?: string };
      if (!response.ok || typeof data.discount !== "number") throw new Error(data.error || "الكود غير صالح أو منتهي");
      setDiscount(data.discount); setAppliedCoupon(data.code || code); setCouponMessage(`${data.label || "تم تطبيق الخصم"} بنجاح`);
    } catch (caught) { setCouponMessage(caught instanceof Error ? caught.message : "الكود غير صالح أو منتهي"); }
  }

  async function pay() {
    if (!cart.items.length || paying) return;
    if (controls.loading || controls.error || !controls.purchases) {
      setError(controls.maintenanceMessage || (controls.error ? "تعذر التحقق من حالة الدفع الآن" : "الشراء متوقف مؤقتًا بقرار الإدارة"));
      return;
    }
    setPaying(true); setError("");
    const intent = checkoutIntent(cart.items.map((item) => item.slug), appliedCoupon);
    const attemptKey = getCheckoutAttemptKey(intent);
    try {
      for (let retry = 0; retry < 4; retry += 1) {
        const response = await fetch("/api/checkout", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "idempotency-key": attemptKey }, body: JSON.stringify({ courseSlugs: cart.items.map((item) => item.slug), coupon: appliedCoupon || undefined }) });
        const data = await response.json() as CheckoutResult;
        if (!response.ok && response.status !== 202) {
          if (data.newAttemptRequired) clearCheckoutAttempt(intent);
          throw new Error(data.error || "تعذر بدء الدفع");
        }
        if (data.mode === "complete") { clearCheckoutAttempt(intent); window.location.assign("/dashboard?view=learning&checkout=complete"); return; }
        if (data.checkoutUrl && data.mode === "live") { window.location.assign(data.checkoutUrl); return; }
        if (response.status === 202 || data.pending) { setError("تم تثبيت محاولة الدفع، وجارٍ استعادة رابطها الآمن..."); await wait(1500 + retry * 500); continue; }
        throw new Error("لم تُرجع بوابة الدفع رابطًا صالحًا");
      }
      throw new Error("تم حفظ محاولة الدفع بأمان. أعد الضغط لاستعادة الرابط نفسه دون إنشاء مطالبة جديدة.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر بدء الدفع"); setPaying(false); }
  }

  const total = Math.max(0, Math.round((cart.subtotal - discount) * 100) / 100);
  const hasItems = cart.items.length > 0;
  const empty = <div className="cart-empty"><div><ShoppingBag size={30} /></div><h2>السلة فارغة</h2><p>أضف المواد التي تريدها من الكتالوج، وستجدها هنا جاهزة للمراجعة والدفع.</p><Link href="/courses" className="button button-primary">استكشف المواد</Link></div>;
  if (loading) return <div className="cart-loading"><LoaderCircle className="spin" size={28} /><p>نجهّز سلتك التعليمية...</p></div>;
  if (!hasItems) return empty;
  const purchasesBlocked = controls.loading || controls.error || !controls.purchases;
  return <div className="cart-layout"><section className="cart-items-panel"><div className="cart-panel-head"><div><span className="eyebrow"><ShoppingBag size={15} /> {cart.count} مواد</span><h2>موادك المختارة</h2><p>كل مادة مرتبطة بجامعتها وتخصصها وتُفعّل على حسابك بعد تأكيد الدفع.</p></div><Link href="/courses" className="button button-soft">إضافة مواد</Link></div><div className="cart-items">{cart.items.map((course) => <article className="cart-item" key={course.slug}><div className={`cart-item-art bg-gradient-to-br ${course.color}`}>{course.coverImage ? <CourseCoverImage src={course.coverImage} alt="" sizes="62px" /> : course.icon}</div><div className="cart-item-info"><span>{course.university} · {course.specialty}</span><h3><Link href={`/courses/${course.slug}`}>{course.title}</Link></h3><small>{course.lessons} درسًا · {course.duration} · وصول {course.access}</small></div><strong className="cart-item-price">{course.price} <small>ر.س</small></strong><button type="button" className="cart-remove" onClick={() => void remove(course.slug)} disabled={busySlug === course.slug} aria-label={`حذف ${course.title}`}><Trash2 size={17} /></button></article>)}</div><div className="cart-trust"><ShieldCheck size={18} /><span><strong>شراء آمن مرتبط بحسابك</strong><small>لا تُرسل بيانات البطاقة إلى مراس؛ تتم العملية داخل صفحة Tap المستضافة.</small></span></div></section><aside className="cart-summary"><div className="cart-summary-badge"><LockKeyhole size={15} /> إتمام آمن</div><h2>ملخص السلة</h2><div className="cart-summary-lines"><p><span>المواد ({cart.count})</span><b>{cart.subtotal} ر.س</b></p><p><span>الخصم</span><b className="discount">{discount ? `- ${discount} ر.س` : "0 ر.س"}</b></p><div><span>الإجمالي</span><strong>{total} <small>ر.س</small></strong></div></div><div className="cart-coupon"><label><Gift size={17} /><input value={coupon} onChange={(event) => { setCoupon(event.target.value); setDiscount(0); setAppliedCoupon(""); setCouponMessage(""); }} placeholder="أدخل كود الخصم" dir="ltr" disabled={purchasesBlocked} /><button type="button" onClick={applyCoupon} disabled={purchasesBlocked}>تطبيق</button></label>{couponMessage && <p className={discount ? "success" : "error"}>{couponMessage}</p>}<small>{purchasesBlocked ? controls.maintenanceMessage || (controls.error ? "تعذر التحقق من حالة الشراء الآن" : "الشراء متوقف مؤقتًا بقرار الإدارة") : "الأكواد الفعالة تُدار من لوحة الإدارة."}</small></div>{error && <p className="checkout-error" role="alert">{error}</p>}<button className="button button-primary cart-pay" onClick={pay} disabled={paying || purchasesBlocked}>{paying ? <LoaderCircle className="spin" size={18} /> : <><CreditCard size={17} /> {purchasesBlocked ? "الدفع متوقف مؤقتًا" : `الدفع عبر Tap · ${total} ر.س`}</>}</button><p className="summary-secure"><Check size={14} /> {purchasesBlocked ? "يمكنك إزالة المواد أو العودة لاحقًا" : "تفعيل كل المواد بعد تأكيد Webhook"}</p></aside></div>;
}
