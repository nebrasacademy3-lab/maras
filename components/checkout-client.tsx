"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Check, CreditCard, Gift, LockKeyhole, ShieldCheck } from "lucide-react";
import type { Course } from "@/lib/data";
import { CourseCoverImage } from "./course-cover-image";
import { continueRequiredAccountStep } from "./purchase-access";

type PaymentMethod = "tap" | "tabby" | "tamara";

export function CheckoutClient({ course, user, paymentMethods }: { course: Course; user:{fullName:string;email:string;phone:string}; paymentMethods:PaymentMethod[] }) {
  const [coupon, setCoupon] = useState("");
  const [discount, setDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const [accepted, setAccepted] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(paymentMethods[0] || "tap");
  const checkoutAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const total = Math.max(0, course.price - discount);

  const applyCoupon = async () => {
    const code = coupon.trim().toUpperCase();
    if (!code) return;
    setCouponMessage("جارٍ التحقق...");
    try {
      const response = await fetch("/api/coupons/validate", { method:"POST", credentials:"same-origin", headers:{"content-type":"application/json"}, body:JSON.stringify({code,courseSlug:course.slug}) });
      const data = await response.json() as { discount?:number;label?:string;code?:string;error?:string };
      if (!response.ok || typeof data.discount !== "number") throw new Error(data.error || "الكود غير صالح أو منتهي");
      setDiscount(data.discount);
      setAppliedCoupon(data.code || code);
      setCouponMessage(`${data.label || "تم تطبيق الخصم"} بنجاح`);
    } catch (caught) {
      setDiscount(0);
      setAppliedCoupon("");
      setCouponMessage(caught instanceof Error ? caught.message : "الكود غير صالح أو منتهي");
    }
  };

  const pay = async () => {
    if (!accepted || loading) return;
    setLoading(true);
    setError("");
    try {
      const fingerprint = JSON.stringify({ courseSlug: course.slug, coupon: appliedCoupon || "", paymentMethod });
      if (!checkoutAttemptRef.current || checkoutAttemptRef.current.fingerprint !== fingerprint) {
        checkoutAttemptRef.current = { fingerprint, key: crypto.randomUUID() };
      }
      const response = await fetch("/api/checkout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "idempotency-key": checkoutAttemptRef.current.key },
        body: JSON.stringify({ courseSlug: course.slug, coupon: appliedCoupon || undefined, paymentMethod }),
      });
      const data = await response.json() as { checkoutUrl?: string; mode?: string; error?: string; pending?: boolean; code?: string };
      if (!response.ok) {
        if (continueRequiredAccountStep(data)) return;
        if (!data.pending) checkoutAttemptRef.current = null;
        throw new Error(data.error || "تعذر بدء الدفع");
      }
      if (data.pending) throw new Error(data.error || "محاولة الدفع قيد التحقق. حاول بعد لحظات.");
      if (data.checkoutUrl && data.mode === "live") {
        window.location.assign(data.checkoutUrl);
        return;
      }
      checkoutAttemptRef.current = null;
      throw new Error("لم تُرجع بوابة الدفع رابطًا صالحًا");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر بدء الدفع. حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  };

  return <div className="checkout-grid">
    <section className="checkout-main">
      <div className="checkout-title"><span><LockKeyhole size={15} /> دفع آمن ومشفّر</span><h1>إتمام الاشتراك</h1><p>راجع تفاصيل الطلب ثم انتقل إلى صفحة Tap الآمنة لإتمام الدفع.</p></div>
      <div className="checkout-section">
        <div className="checkout-section-title"><span>1</span><div><h2>بيانات المشتري</h2><p>ستُصدر الفاتورة وتُفعّل المادة على هذا البريد</p></div></div>
        <div className="checkout-account-card"><BadgeCheck size={21}/><div><strong>{user.fullName}</strong><span dir="ltr">{user.email}</span><small dir="ltr">{user.phone}</small></div><Link href="/dashboard?view=account">تعديل بيانات الحساب</Link></div>
      </div>
      <div className="checkout-section">
        <div className="checkout-section-title"><span>2</span><div><h2>طريقة الدفع</h2><p>اختر الطريقة المناسبة ثم أكمل بأمان في صفحة Tap</p></div></div>
        <div className="payment-method-list" role="radiogroup" aria-label="طريقة الدفع">
          <button type="button" role="radio" aria-checked={paymentMethod === "tap"} className={`tap-payment-option ${paymentMethod === "tap" ? "active" : ""}`} onClick={() => setPaymentMethod("tap")}><i><CreditCard size={22} /></i><div><strong>بطاقة أو Apple Pay</strong><span>مدى، Visa، Mastercard والوسائل المفعلة</span><div className="payment-brands"><b>mada</b><b>VISA</b><b>Mastercard</b><b> Pay</b></div></div><em><Check size={14} /></em></button>
          {paymentMethods.includes("tabby") && <button type="button" role="radio" aria-checked={paymentMethod === "tabby"} className={`tap-payment-option installment-option ${paymentMethod === "tabby" ? "active" : ""}`} onClick={() => setPaymentMethod("tabby")}><i>ت</i><div><strong>قسّطها مع تابي</strong><span>تظهر خطة التقسيط والأهلية في صفحة الدفع</span></div><em><Check size={14} /></em></button>}
          {paymentMethods.includes("tamara") && <button type="button" role="radio" aria-checked={paymentMethod === "tamara"} className={`tap-payment-option installment-option ${paymentMethod === "tamara" ? "active" : ""}`} onClick={() => setPaymentMethod("tamara")}><i>تـ</i><div><strong>قسّطها مع تمارا</strong><span>تخضع الخطة للموافقة وشروط مزوّد الخدمة</span></div><em><Check size={14} /></em></button>}
        </div>
        <div className="payment-security"><ShieldCheck size={19} /><span><strong>معلومات بطاقتك لا تمر عبر خوادم مراس</strong><small>تُدخل بيانات الدفع في صفحة Tap المستضافة والملتزمة بمعايير الأمان.</small></span></div>
      </div>
      <label className="checkout-terms"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /> أوافق على <Link href="/terms">الشروط والأحكام</Link> و<Link href="/refund-policy">سياسة الاسترداد</Link>.</label>
    </section>
    <aside className="order-summary">
      <h2>ملخص الطلب</h2>
      <div className={`summary-course-art bg-gradient-to-br ${course.color}`}><span className="course-cover-grid" />{course.coverImage ? <CourseCoverImage src={course.coverImage} alt={`غلاف ${course.title}`} sizes="(max-width: 900px) 100vw, 360px" /> : <strong>{course.icon}</strong>}</div>
      <div className="summary-course-info"><small>{course.university}</small><h3>{course.title}</h3><p>{course.lessons} درسًا · {course.duration}</p><span><BadgeCheck size={14} /> وصول {course.access}</span></div>
      <div className="coupon-box"><label><Gift size={17} /><input value={coupon} onChange={(event) => { setCoupon(event.target.value); setDiscount(0); setAppliedCoupon(""); setCouponMessage(""); }} placeholder="كود الخصم" dir="ltr" /><button type="button" onClick={applyCoupon}>تطبيق</button></label>{couponMessage && <p className={discount ? "success" : "error"}>{couponMessage}</p>}<small>تُنشأ أكواد الخصم وتُحدد صلاحيتها من لوحة الإدارة.</small></div>
      <div className="summary-totals"><p><span>سعر المادة</span><b>{course.price} ر.س</b></p><p><span>الخصم</span><b className="discount">{discount ? `- ${discount} ر.س` : "0 ر.س"}</b></p><p><span>ضريبة القيمة المضافة</span><b>مشمولة</b></p><div><span>الإجمالي</span><strong>{total} <small>ر.س</small></strong></div></div>
      {error && <p className="checkout-error" role="alert">{error}</p>}
      <button className="button button-primary pay-button" onClick={pay} disabled={!accepted || loading}>{loading ? <span className="button-loader" /> : <><CreditCard size={17} /> المتابعة للدفع · {total} ر.س</>}</button>
      <p className="summary-secure"><ShieldCheck size={14} /> اتصال مشفّر · تأكيد الدفع من الخادم</p>
    </aside>
  </div>;
}
