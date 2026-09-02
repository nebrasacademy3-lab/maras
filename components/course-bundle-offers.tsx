"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, PackageOpen, ShoppingBag } from "lucide-react";
import { setCart } from "./commerce-state";

export type BundleOffer = {
  slug: string;
  title: string;
  description: string;
  discountType: string;
  discountValue: number;
  courses: Array<{ slug: string; title: string; price: number; university: string }>;
  savings: number;
  bundlePrice: number;
  regularPrice: number;
};

export function CourseBundleOffers({ bundles, currentSlug }: { bundles: BundleOffer[]; currentSlug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  if (!bundles.length) return null;

  const addBundle = async (bundle: BundleOffer) => {
    setBusy(bundle.slug); setMessage("");
    try {
      for (const course of bundle.courses) await setCart(course.slug, true);
      router.push(`/cart?bundle=${encodeURIComponent(bundle.slug)}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("401")) { window.location.assign(`/login?return_to=${encodeURIComponent(`/courses/${currentSlug}`)}`); return; }
      setMessage(error instanceof Error ? error.message : "تعذر إضافة الباقة إلى السلة");
    } finally { setBusy(""); }
  };

  return <section className="course-bundle-offers" aria-labelledby="bundle-offers-title">
    <div className="curriculum-head"><div><h2 id="bundle-offers-title">باقات تشمل هذه المادة</h2><p>وفّر عند اشتراكك في أكثر من مادة معًا؛ يُطبّق الخصم تلقائيًا في السلة.</p></div></div>
    <div className="bundle-offer-grid">{bundles.map((bundle) => <article key={bundle.slug} className="bundle-offer-card">
      <header><i><PackageOpen size={18} /></i><div><strong>{bundle.title}</strong><small>{bundle.courses.length} مواد · وفّر {bundle.savings.toLocaleString("ar-SA")} ر.س</small></div></header>
      {bundle.description && <p>{bundle.description}</p>}
      <ul>{bundle.courses.map((course) => <li key={course.slug} className={course.slug === currentSlug ? "current" : ""}><span>{course.title}</span><small>{course.price.toLocaleString("ar-SA")} ر.س</small></li>)}</ul>
      <footer><div><del>{bundle.regularPrice.toLocaleString("ar-SA")} ر.س</del><strong>{bundle.bundlePrice.toLocaleString("ar-SA")} ر.س</strong></div><button type="button" className="button button-primary" disabled={Boolean(busy)} onClick={() => void addBundle(bundle)}>{busy === bundle.slug ? <LoaderCircle className="spin" size={15} /> : <ShoppingBag size={15} />} أضف الباقة إلى السلة</button></footer>
    </article>)}</div>
    {message && <p className="form-error">{message}</p>}
  </section>;
}
