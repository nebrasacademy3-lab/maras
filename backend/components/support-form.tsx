"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileUp, LoaderCircle, MessageCircle, Paperclip, RefreshCw, Send, ShieldCheck, X } from "lucide-react";
import { usePlatformControls } from "./use-platform-controls";

type SupportFile = { id: number; originalName: string; contentType: string; sizeBytes: number; createdAt: string };
type SupportReply = { id: number; authorEmail: string; authorRole: string; body: string; internal?: boolean; createdAt: string; files?: SupportFile[] };
type SupportTicket = { id: number; ticketNumber: string; userEmail: string|null; category: string; priority: string; title: string; message: string; contactChannel?: string; status: string; createdAt: string; updatedAt: string; replies?: SupportReply[] };

const statusLabel: Record<string, string> = { new: "جديدة", open: "مفتوحة", waiting: "بانتظار ردك", resolved: "محلولة", closed: "مغلقة" };
const channelLabel: Record<string, string> = { in_app: "محادثة مراس", email: "البريد الإلكتروني", whatsapp: "واتساب" };

export function SupportForm() {
  const controls = usePlatformControls();
  const supportMutationsDisabled = controls.loading || Boolean(controls.error) || !controls.support;
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(() => { if (typeof window === "undefined") return null; const requested = Number(new URLSearchParams(window.location.search).get("ticket")); return Number.isInteger(requested) && requested > 0 ? requested : null; });
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [ticketNumber, setTicketNumber] = useState("");
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadTickets = useCallback(async () => {
    try {
      const response = await fetch("/api/support", { credentials: "same-origin", cache: "no-store" });
      const result = await response.json() as { tickets?: SupportTicket[] };
      if (response.ok) setTickets(result.tickets || []);
    } catch { /* The form remains usable when the list refresh is temporarily unavailable. */ }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void loadTickets(), 0); return () => window.clearTimeout(timer); }, [loadTickets]);
  const selected = useMemo(() => tickets.find((ticket) => ticket.id === selectedId) || tickets[0] || null, [selectedId, tickets]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (supportMutationsDisabled) {
      setError(controls.maintenanceMessage || (controls.error ? "تعذر التحقق من حالة الدعم الآن" : "إرسال رسائل الدعم متوقف مؤقتًا بقرار الإدارة"));
      return;
    }
    setStatus("loading"); setError("");
    const form = new FormData(event.currentTarget);
    const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
    try {
      const response = await fetch("/api/support", { method: "POST", credentials: "same-origin", body: form });
      const result = await response.json() as { ticket?: { ticketNumber?: string; id?: number }; error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر إرسال التذكرة");
      setTicketNumber(result.ticket?.ticketNumber || `SP-${Date.now().toString().slice(-8)}`);
      setStatus("done");
      await loadTickets();
      if (result.ticket?.id) setSelectedId(result.ticket.id);
      if (files.length) event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إرسال التذكرة. حاول مرة أخرى."); setStatus("idle");
    }
  };

  const sendReply = async () => {
    if (!selected || (!reply.trim() && !replyFiles.length)) return;
    if (supportMutationsDisabled) { setError(controls.maintenanceMessage || "إرسال رسائل الدعم متوقف مؤقتًا"); return; }
    setReplyBusy(true); setError("");
    try {
      const form = new FormData(); form.set("ticketId", String(selected.id)); form.set("message", reply);
      replyFiles.forEach((file) => form.append("files", file));
      const response = await fetch("/api/support", { method: "POST", credentials: "same-origin", body: form });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر إرسال الرد");
      setReply(""); setReplyFiles([]); if (fileRef.current) fileRef.current.value = ""; await loadTickets();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر إرسال الرد"); }
    finally { setReplyBusy(false); }
  };

  const changeStatus = async (action: "reopen" | "close") => {
    if (!selected) return;
    if (supportMutationsDisabled) { setError(controls.maintenanceMessage || "تحديث محادثات الدعم متوقف مؤقتًا"); return; }
    setError("");
    try {
      const response = await fetch("/api/support", { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticketId: selected.id, action }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر تحديث التذكرة");
      await loadTickets();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر تحديث التذكرة"); }
  };

  return <div className="support-workspace">
    <section className="support-composer-card">
      <div className="support-card-heading"><span className="support-heading-icon"><MessageCircle size={20} /></span><div><h2>ابدأ محادثة مع فريق مراس</h2><p>تظل المحادثة محفوظة في حسابك حتى يغلقها المشرف، ويمكنك إعادة فتحها عند الحاجة.</p></div></div>
      {!controls.loading && (controls.error || !controls.support) && <p className="form-error" role="alert">{controls.maintenanceMessage || (controls.error ? "تعذر التحقق من حالة الدعم الآن. يمكنك قراءة محادثاتك السابقة." : "فتح المحادثات وإرسال الرسائل متوقفان مؤقتًا بقرار الإدارة. يمكنك قراءة محادثاتك السابقة.")}</p>}
      <form className="support-form" onSubmit={submit} data-disabled={supportMutationsDisabled || undefined}>
        <div className="two-fields"><label>التصنيف<select name="category" required><option value="technical">مشكلة تقنية</option><option value="payment">الدفع والفواتير</option><option value="course">المواد والدروس</option><option value="account">الحساب</option><option value="suggestion">اقتراح</option></select></label><label>الأولوية<select name="priority" required><option value="normal">عادية</option><option value="high">عالية</option><option value="urgent">عاجلة</option></select></label></div>
        <label>عنوان المحادثة<input name="title" required minLength={3} placeholder="مثال: لا يعمل الفيديو في المادة" /></label>
        <label>قناة المتابعة المفضلة<select name="contactChannel" defaultValue="in_app"><option value="in_app">محادثة مراس — الأسرع</option><option value="email">البريد الإلكتروني</option><option value="whatsapp">واتساب</option></select></label>
        <label>اشرح المشكلة<textarea name="message" required minLength={10} placeholder="اكتب التفاصيل والخطوات التي جربتها..." /></label>
        <label className="support-file-picker"><FileUp size={20} /><span><strong>إرفاق صور أو مستندات</strong><small>حتى 5 ملفات، و15 ميجابايت للملف الواحد</small></span><input name="files" type="file" multiple accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.txt" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary form-main-submit" disabled={status === "loading" || supportMutationsDisabled}>{status === "loading" || controls.loading ? <LoaderCircle size={18} className="spin" /> : <><Send size={17} /> {controls.error || !controls.support ? "الدعم متوقف مؤقتًا" : "فتح المحادثة"}</>}</button>
      </form>
      {status === "done" && <div className="support-success-inline"><CheckCircle2 size={20} /><span>تم فتح المحادثة <b dir="ltr">#{ticketNumber}</b>. يمكنك متابعة الرد من الأسفل.</span><button type="button" onClick={() => setStatus("idle")} aria-label="إخفاء الرسالة"><X size={16} /></button></div>}
    </section>

    <section className="support-inbox-card">
      <div className="support-card-heading"><span className="support-heading-icon"><ShieldCheck size={20} /></span><div><h2>محادثاتك</h2><p>كل رسالة وملف هنا مرتبطان بحسابك فقط.</p></div><button className="icon-button" type="button" onClick={() => void loadTickets()} aria-label="تحديث المحادثات"><RefreshCw size={17} /></button></div>
      {!tickets.length ? <div className="support-empty"><MessageCircle size={28} /><p>لا توجد محادثات بعد.</p><small>افتح أول محادثة وسيظهر رد الفريق هنا.</small></div> : <div className="support-chat-layout"><div className="support-ticket-list">{tickets.map((ticket) => <button type="button" className={`support-ticket-item ${selected?.id === ticket.id ? "active" : ""}`} key={ticket.id} onClick={() => setSelectedId(ticket.id)}><span><b>{ticket.title}</b><small dir="ltr">#{ticket.ticketNumber}</small></span><em>{statusLabel[ticket.status] || "حالة غير معروفة"}</em><time>{new Date(ticket.updatedAt || ticket.createdAt).toLocaleDateString("ar-SA")}</time></button>)}</div>{selected && <div className="support-thread"><header><div><h3>{selected.title}</h3><p><span dir="ltr">#{selected.ticketNumber}</span> · {channelLabel[selected.contactChannel || "in_app"]} · {statusLabel[selected.status] || "حالة غير معروفة"}</p></div><div className="support-thread-actions">{selected.status === "closed" || selected.status === "resolved" ? <button type="button" className="button button-soft" disabled={supportMutationsDisabled} title={supportMutationsDisabled ? "إعادة فتح المحادثات متوقفة مؤقتًا" : undefined} onClick={() => void changeStatus("reopen")}>إعادة فتح</button> : null}</div></header><div className="support-messages"><article className="support-bubble student"><div><strong>أنت</strong><time>{new Date(selected.createdAt).toLocaleString("ar-SA")}</time></div><p>{selected.message}</p></article>{selected.replies?.filter((item) => item.body || item.files?.length).map((item) => <article className={`support-bubble ${item.authorRole === "student" ? "student" : "agent"}`} key={item.id}><div><strong>{item.authorRole === "student" ? "أنت" : "فريق مراس"}</strong><time>{new Date(item.createdAt).toLocaleString("ar-SA")}</time></div>{item.body && <p>{item.body}</p>}{item.files?.length ? <div className="support-attachments">{item.files.map((file) => <a key={file.id} href={`/api/support/files/${file.id}`} target="_blank" rel="noreferrer"><Paperclip size={14} />{file.originalName}</a>)}</div> : null}</article>)}</div>{selected.status !== "closed" && selected.status !== "resolved" ? <div className="support-reply-box">{supportMutationsDisabled && <p className="form-error" role="status">{controls.maintenanceMessage || "إرسال الردود متوقف مؤقتًا. تبقى المحادثة والمرفقات متاحة للقراءة."}</p>}<textarea value={reply} disabled={supportMutationsDisabled} onChange={(event) => setReply(event.target.value)} placeholder={supportMutationsDisabled ? "إرسال الردود متوقف مؤقتًا" : "اكتب ردك هنا..."} aria-label="رد على المحادثة" /><div><label className="support-attach-button" aria-disabled={supportMutationsDisabled}><Paperclip size={17} /><span>{replyFiles.length ? `${replyFiles.length} ملفات` : "إرفاق"}</span><input ref={fileRef} type="file" disabled={supportMutationsDisabled} multiple accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.txt" onChange={(event) => setReplyFiles(Array.from(event.target.files || []).slice(0, 5))} /></label><button type="button" className="button button-primary" disabled={supportMutationsDisabled || replyBusy || (!reply.trim() && !replyFiles.length)} onClick={() => void sendReply()}>{replyBusy ? <LoaderCircle size={16} className="spin" /> : <><Send size={16} /> إرسال</>}</button></div></div> : <div className="support-closed-note"><CheckCircle2 size={18} /> {supportMutationsDisabled ? "المحادثة مغلقة وتبقى متاحة للقراءة." : "أُغلقت المحادثة من المشرف. يمكنك إعادة فتحها وإرسال رسالة جديدة."}</div>}</div>}</div>}
    </section>
  </div>;
}
