"use client";

import { Heart, LoaderCircle, ShoppingBag } from "lucide-react";
import { useState } from "react";

export function CourseActions({ courseSlug, compact = false }: { courseSlug: string; compact?: boolean }) {
  const [busy, setBusy] = useState<"cart" | "favorite" | "">("");
  const [message, setMessage] = useState("");
  async function mutate(path: "/api/cart" | "/api/favorites", kind: "cart" | "favorite") {
    if (busy) return;
    setBusy(kind); setMessage("");
    try {
      const response = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseSlug, active: true }) });
      const payload = await response.json() as { error?: string };
      if (response.status === 401) { window.location.assign(`/login?return_to=${encodeURIComponent(window.location.pathname)}`); return; }
      if (!response.ok) throw new Error(payload.error || "تعذر تنفيذ الطلب");
      setMessage(kind === "cart" ? "أضيفت للسلة" : "أضيفت للمفضلة");
    } catch (error) { setMessage(error instanceof Error ? error.message : "حاول مرة أخرى"); }
    finally { setBusy(""); }
  }
  return <div className={`course-actions ${compact ? "course-actions-compact" : ""}`}>
    <button type="button" onClick={() => mutate("/api/cart", "cart")} aria-label="إضافة إلى السلة" title="إضافة إلى السلة">{busy === "cart" ? <LoaderCircle className="spin" size={15} /> : <ShoppingBag size={15} />}<span>{compact ? "سلة" : "أضف للسلة"}</span></button>
    <button type="button" onClick={() => mutate("/api/favorites", "favorite")} aria-label="إضافة إلى المفضلة" title="إضافة إلى المفضلة">{busy === "favorite" ? <LoaderCircle className="spin" size={15} /> : <Heart size={15} />}<span>{compact ? "مفضلة" : "مفضلة"}</span></button>
    {message && <small role="status">{message}</small>}
  </div>;
}
