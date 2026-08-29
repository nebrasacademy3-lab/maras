"use client";

import { Check, Heart, LoaderCircle, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { ensureCommerceLoaded, setCart, setFavorite, useCommerceState } from "./commerce-state";
import { usePlatformControls } from "./use-platform-controls";

export function CourseActions({ courseSlug, compact = false, purchasable = true }: { courseSlug: string; compact?: boolean; purchasable?: boolean }) {
  const { cartSlugs, favoriteSlugs, loaded } = useCommerceState();
  const [busy, setBusy] = useState<"cart" | "favorite" | "">("");
  const [message, setMessage] = useState("");
  const controls = usePlatformControls();
  const isInCart = cartSlugs.includes(courseSlug);
  const isFavorite = favoriteSlugs.includes(courseSlug);
  const purchaseUnavailable = controls.loading || controls.error || !controls.purchases;

  useEffect(() => { void ensureCommerceLoaded(); }, []);

  async function mutate(kind: "cart" | "favorite") {
    if (busy) return;
    const active = kind === "cart" ? !isInCart : !isFavorite;
    if (kind === "cart" && active && purchaseUnavailable) {
      setMessage(controls.loading ? "جارٍ التحقق من حالة الشراء..." : controls.maintenanceMessage || (controls.error ? "تعذر التحقق من حالة الشراء الآن" : "الشراء متوقف مؤقتًا بقرار الإدارة"));
      return;
    }
    setBusy(kind); setMessage("");
    try {
      const response = kind === "cart" ? await setCart(courseSlug, active) : await setFavorite(courseSlug, active);
      void response;
      setMessage(kind === "cart" ? (active ? "أضيفت إلى السلة" : "أزيلت من السلة") : (active ? "أضيفت إلى المفضلة" : "أزيلت من المفضلة"));
    } catch (error) {
      if (error instanceof Error && error.message.includes("401")) window.location.assign(`/login?return_to=${encodeURIComponent(window.location.pathname)}`);
      else setMessage(error instanceof Error ? error.message : "حاول مرة أخرى");
    } finally { setBusy(""); }
  }

  return <div className={`course-actions ${compact ? "course-actions-compact" : ""} ${loaded ? "commerce-ready" : ""}`}>
    <button type="button" className={isInCart ? "is-added" : ""} onClick={() => void mutate("cart")} disabled={(!purchasable || purchaseUnavailable) && !isInCart} aria-pressed={isInCart} aria-label={!purchasable && !isInCart ? "المادة قيد التجهيز" : purchaseUnavailable && !isInCart ? "الشراء متوقف مؤقتًا" : isInCart ? "إزالة المادة من السلة" : "إضافة إلى السلة"} title={!purchasable && !isInCart ? "تتاح بعد اكتمال الفيديوهات" : purchaseUnavailable && !isInCart ? controls.maintenanceMessage || "الشراء متوقف مؤقتًا" : isInCart ? "إزالة من السلة" : "إضافة إلى السلة"}>{busy === "cart" ? <LoaderCircle className="spin" size={15} /> : <ShoppingBag size={15} />}<span>{!purchasable && !isInCart ? "قريبًا" : purchaseUnavailable && !isInCart ? "الشراء متوقف" : compact ? (isInCart ? "مضافة" : "سلة") : (isInCart ? "مضافة للسلة" : "أضف للسلة")}</span><Check className="course-action-check" size={13} /></button>
    <button type="button" className={isFavorite ? "is-favorite" : ""} onClick={() => void mutate("favorite")} aria-pressed={isFavorite} aria-label={isFavorite ? "إزالة المادة من المفضلة" : "إضافة إلى المفضلة"} title={isFavorite ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}>{busy === "favorite" ? <LoaderCircle className="spin" size={15} /> : <Heart size={15} fill={isFavorite ? "currentColor" : "none"} />}<span>{compact ? "مفضلة" : (isFavorite ? "في المفضلة" : "مفضلة")}</span></button>
    {(message || (!controls.loading && !controls.error && !controls.purchases ? controls.maintenanceMessage || "الشراء متوقف مؤقتًا بقرار الإدارة" : "")) && <small role="status" className="course-action-message">{message || controls.maintenanceMessage || "الشراء متوقف مؤقتًا بقرار الإدارة"}</small>}
  </div>;
}
