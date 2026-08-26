"use client";

import { useState } from "react";
import { CheckCircle2, FileUp, LoaderCircle, Send } from "lucide-react";

export function SupportForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [ticketNumber, setTicketNumber] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("loading");
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/support", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json() as { ticket?: { ticketNumber?: string }; error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر إرسال التذكرة");
      setTicketNumber(result.ticket?.ticketNumber || `SP-${Date.now().toString().slice(-8)}`);
      setStatus("done");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إرسال التذكرة. حاول مرة أخرى.");
      setStatus("idle");
    }
  };
  if (status === "done") return <div className="form-success-state"><div><CheckCircle2 size={37} /></div><span>تم فتح التذكرة</span><h2 dir="ltr">#{ticketNumber}</h2><p>وصلت رسالتك إلى فريق الدعم. سنرسل لك إشعارًا عند إضافة أول رد.</p><button className="button button-primary" onClick={() => setStatus("idle")}>فتح تذكرة أخرى</button></div>;
  return <form className="support-form" onSubmit={submit}>
    <div className="two-fields"><label>التصنيف<select name="category" required><option>مشكلة في الفيديو</option><option>الدفع</option><option>المادة</option><option>الحساب</option><option>مشكلة تقنية</option><option>اقتراح</option></select></label><label>الأولوية<select name="priority" required><option>عادية</option><option>عالية</option><option>عاجلة — لا أستطيع الوصول للمادة</option></select></label></div>
    <label>البريد الإلكتروني (اختياري)<input name="userEmail" type="email" placeholder="name@example.com" dir="ltr" /></label>
    <label>عنوان المشكلة<input name="title" required placeholder="اكتب عنوانًا مختصرًا وواضحًا" /></label>
    <label>تفاصيل المشكلة<textarea name="message" required minLength={10} placeholder="اشرح ما حدث، وما الخطوات التي جرّبتها..." /></label>
    <label className="file-drop"><FileUp size={22} /><span><strong>أرفق صورة أو ملفًا (اختياري)</strong><small>رفع المرفقات يُفعّل عند ربط التخزين الخاص</small></span><input type="file" hidden /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button button-primary form-main-submit" disabled={status === "loading"}>{status === "loading" ? <LoaderCircle size={18} className="spin" /> : <><Send size={17} /> إرسال التذكرة</>}</button>
  </form>;
}
