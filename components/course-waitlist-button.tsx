"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, BellOff, LoaderCircle, LogIn } from "lucide-react";

export function CourseWaitlistButton({ courseSlug }: { courseSlug: string }) {
  const [active, setActive] = useState(false);
  const [known, setKnown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let current = true;
    void fetch(`/api/waitlist?courseSlug=${encodeURIComponent(courseSlug)}`, { cache: "no-store", credentials: "same-origin" }).then(async (response) => {
      if (!current) return;
      if (response.status === 401) { setSignedOut(true); setKnown(true); return; }
      const payload = await response.json() as { active?: boolean };
      setActive(Boolean(payload.active)); setKnown(true);
    }).catch(() => { if (current) setKnown(true); });
    return () => { current = false; };
  }, [courseSlug]);

  async function toggle() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/waitlist", { method: active ? "DELETE" : "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseSlug, source: "course_page" }) });
      const payload = await response.json() as { active?: boolean; error?: string; message?: string };
      if (response.status === 401) { setSignedOut(true); return; }
      if (!response.ok) throw new Error(payload.error || "تعذر تحديث التنبيه");
      setActive(Boolean(payload.active)); setMessage(payload.message || (active ? "تم إلغاء التنبيه" : "تم تفعيل التنبيه"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تحديث التنبيه"); }
    finally { setBusy(false); }
  }

  if (!known) return <span className="button button-soft purchase-main-button purchase-preparing"><LoaderCircle className="spin" size={17} /> جارٍ التحقق</span>;
  if (signedOut) return <Link href={`/login?returnTo=${encodeURIComponent(`/courses/${courseSlug}`)}`} className="button button-primary purchase-main-button"><LogIn size={17} /> سجّل الدخول وفعّل التنبيه</Link>;
  return <div className="course-waitlist-control"><button type="button" className={`button purchase-main-button ${active ? "button-soft" : "button-primary"}`} onClick={() => void toggle()} disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : active ? <BellOff size={17} /> : <Bell size={17} />}{active ? "إلغاء تنبيه الإطلاق" : "نبّهني عند الإطلاق"}</button>{message ? <small role="status">{message}</small> : null}</div>;
}
