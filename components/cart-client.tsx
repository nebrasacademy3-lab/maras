"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BadgePercent, Check, CreditCard, Gift, LoaderCircle, LockKeyhole, ShieldCheck, ShoppingBag, Trash2 } from "lucide-react";
import type { Course } from "@/lib/data";
import type { PublicCourseBundle } from "@/lib/course-bundles";
import { syncCommerce } from "./commerce-state";
import { CourseCoverImage } from "./course-cover-image";

type CartPayload = { items: Course[]; subtotal: number; count: number; courseSlugs?: string[] };
type PaymentMethod = "tap" | "tabby" | "tamara";

export function CartClient({ paymentMethods }: { paymentMethods: PaymentMethod[] }) {
  const [cart, setCart] = useState<CartPayload>({ items: [], subtotal: 0, count: 0 });
  const [bundles, setBundles] = useState<PublicCourseBundle[]>([]);
  const [selectedBundleSlug, setSelectedBundleSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [coupon, setCoupon] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const [discount, setDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState("");
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [busySlug, setBusySlug] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(paymentMethods[0] || "tap");
  const checkoutAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public/bundles", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => { const data = await response.json() as { bundles?: PublicCourseBundle[] }; return response.ok ? data.bundles || [] : []; })
      .then((data) => { if (!controller.signal.aborted) setBundles(data); })
      .catch(() => { if (!controller.signal.aborted) setBundles([]); });
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
      setDiscount(0); setAppliedCoupon(""); setCouponMessage(""); setSelectedBundleSlug("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر حذف المادة"); }
    finally { setBusySlug(""); }
  }

  async function applyCoupon() {
    const code = coupon.trim().toUpperCase();
    if (!code || !cart.items.length) return;
    setCouponMessage("جارٍ التحقق..."); setDiscount(0); setAppliedCoupon(""); setSelectedBundleSlug("");
    try {
      const response = await fetch("/api/coupons/validate", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, courseSlugs: cart.items.map((item) => item.slug) }) });
      const data = await response.json() as { discount?: number; code?: string; label?: string; error?: string };
      if (!response.ok || typeof data.discount !== "number") throw new Error(data.error || "الكود غير صالح أو منتهي");
      setDiscount(data.discount); setAppliedCoupon(data.code || code); setCouponMessage(`${data.label || "تم تطبيق الخصم"} بنجاح`);
    } catch (caught) { setCouponMessage(caught instanceof Error ? caught.message : "الكود غير صالح أو منتهي"); }
  }

  async function pay() {
    if (!cart.items.length || paying) return;
    setPaying(true); setError("");
    try {
      const courseSlugs = cart.items.map((item) => item.slug).sort();
      const fingerprint = JSON.stringify({ courseSlugs, coupon: appliedCoupon || "", bundleSlug: selectedBundleSlug || "", paymentMethod });
      if (!checkoutAttemptRef.current || checkoutAttemptRef.current.fingerprint !== fingerprint) {
        checkoutAttemptRef.current = { fingerprint, key: crypto.randomUUID() };
      }
      const response = await fetch("/api/checkout", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "idempotency-key": checkoutAttemptRef.current.key }, body: JSON.stringify({ courseSlugs, coupon: appliedCoupon || undefined, bundleSlug: selectedBundleSlug || undefined, paymentMethod }) });
      const data = await response.json() as { checkoutUrl?: string; mode?: string; error?: string; pending?: boolean };
      if (!response.ok) {
        if (!data.pending) checkoutAttemptRef.current = null;
        throw new Error(data.error || "تعذر بدء الدفع");
      }
      if (data.pending) throw new Error(data.error || "محاولة الدفع قيد التحقق. حاول بعد لحظات.");
      if (data.checkoutUrl && data.mode === "live") { window.location.assign(data.checkoutUrl); return; }
      checkoutAttemptRef.current = null;
      throw new Error("لم تُرجع بوابة الدفع رابطًا صالحًا");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر بدء الدفع"); setPaying(false); }
  }

  const sortedCartSlugs = cart.items.map((item) => item.slug).sort();
  const matchingBundles = bundles.filter((bundle) => {
    const bundleSlugs = [...bundle.courseSlugs].sort();
    return bundleSlugs.length === sortedCartSlugs.length && bundleSlugs.every((slug, index) => slug === sortedCartSlugs[index]);
  });
  const selectedBundle = matchingBundles.find((bundle) => bundle.slug === selectedBundleSlug) || null;
  const effectiveDiscount = selectedBundle?.discount || discount;
  const total = Math.max(0, Math.round((cart.subtotal - effectiveDiscount) * 100) / 100);
  const hasItems = cart.items.length > 0;
  const empty = <div className="cart-empty"><div><ShoppingBag size={30} /></div><h2>السلة فارغة</h2><p>أضف المواد التي تريدها من الكتالوج، وستجدها هنا جاهزة للمراجعة والدفع.</p><Link href="/courses" className="button button-primary">استكشف المواد</Link></div>;
  if (loading) return <div className="cart-loading"><LoaderCircle className="spin" size={28} /><p>نجهّز سلتك التعليمية...</p></div>;
  if (!hasItems) return empty;
  return <div className="cart-layout"><section className="cart-items-panel"><div className="cart-panel-head"><div><span className="eyebrow"><ShoppingBag size={15} /> {cart.count} مواد</span><h2>موادك المختارة</h2><p>كل مادة مرتبطة بجامعتها وتخصصها وتُفعّل على حسابك بعد تأكيد الدفع.</p></div><Link href="/courses" className="button button-soft">إضافة مواد</Link></div><div className="cart-items">{cart.items.map((course) => <article className="cart-item" key={course.slug}><div className={`cart-item-art bg-gradient-to-br ${course.color}`}>{course.coverImage ? <CourseCoverImage src={course.coverImage} alt="" sizes="62px" /> : course.icon}</div><div className="cart-item-info"><span>{course.university} · {course.specialty}</span><h3><Link href={`/courses/${course.slug}`}>{course.title}</Link></h3><small>{course.lessons} درسًا · {course.duration} · وصول {course.access}</small></div><strong className="cart-item-price">{course.price} <small>ر.س</small></strong><button type="button" className="cart-remove" onClick={() => void remove(course.slug)} disabled={busySlug === course.slug} aria-label={`حذف ${course.title}`}><Trash2 size={17} /></button></article>)}</div><div className="cart-trust"><ShieldCheck size={18} /><span><strong>شراء آمن مرتبط بحسابك</strong><small>لا تُرسل بيانات البطاقة إلى مراس؛ تتم العملية داخل صفحة Tap المستضافة.</small></span></div></section><aside className="cart-summary"><div className="cart-summary-badge"><LockKeyhole size={15} /> إتمام آمن</div><h2>ملخص السلة</h2><div className="cart-summary-lines"><p><span>المواد ({cart.count})</span><b>{cart.subtotal} ر.س</b></p><p><span>الخصم</span><b className="discount">{effectiveDiscount ? `- ${effectiveDiscount} ر.س` : "0 ر.س"}</b></p><div><span>الإجمالي</span><strong>{total} <small>ر.س</small></strong></div></div>{matchingBundles.length > 0 && <div className="cart-bundles"><div className="cart-bundles-title"><BadgePercent size={17} /><span><strong>باقات مناسبة لسلتك</strong><small>السعر النهائي يُعاد احتسابه بأمان عند الدفع.</small></span></div>{matchingBundles.map((bundle) => <button type="button" key={bundle.slug} className={selectedBundleSlug === bundle.slug ? "active" : ""} onClick={() => { const next = selectedBundleSlug === bundle.slug ? "" : bundle.slug; setSelectedBundleSlug(next); setCoupon(""); setAppliedCoupon(""); setDiscount(0); setCouponMessage(next ? `تم اختيار ${bundle.title}` : ""); }}><span><strong>{bundle.title}</strong><small>وفّر {bundle.discount} ر.س على {bundle.courseSlugs.length} مواد</small></span><b>{bundle.total} ر.س</b></button>)}</div>}<div className="cart-payment-methods" role="radiogroup" aria-label="طريقة الدفع"><button type="button" className={paymentMethod === "tap" ? "active" : ""} onClick={() => setPaymentMethod("tap")}>بطاقة / Apple Pay</button>{paymentMethods.includes("tabby") && <button type="button" className={paymentMethod === "tabby" ? "active" : ""} onClick={() => setPaymentMethod("tabby")}>تابي</button>}{paymentMethods.includes("tamara") && <button type="button" className={paymentMethod === "tamara" ? "active" : ""} onClick={() => setPaymentMethod("tamara")}>تمارا</button>}</div><div className="cart-coupon"><label><Gift size={17} /><input value={coupon} onChange={(event) => { setCoupon(event.target.value); setDiscount(0); setAppliedCoupon(""); setCouponMessage(""); setSelectedBundleSlug(""); }} placeholder="أدخل كود الخصم" dir="ltr" /><button type="button" onClick={applyCoupon}>تطبيق</button></label>{couponMessage && <p className={effectiveDiscount ? "success" : "error"}>{couponMessage}</p>}<small>لا يمكن الجمع بين الباقة المخفضة وكود خصم. تُعرض وسائل التقسيط بعد تفعيلها في حساب المتجر.</small></div>{error && <p className="checkout-error" role="alert">{error}</p>}<button className="button button-primary cart-pay" onClick={pay} disabled={paying}>{paying ? <LoaderCircle className="spin" size={18} /> : <><CreditCard size={17} /> المتابعة للدفع · {total} ر.س</>}</button><p className="summary-secure"><Check size={14} /> تفعيل كل المواد بعد تأكيد Webhook</p></aside></div>;
}
