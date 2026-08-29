"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileUp, LoaderCircle, MessageCircle, Paperclip, RefreshCw, Send, ShieldCheck, X } from "lucide-react";
import { uploadProgressLabel, uploadWithProgress, type UploadProgress } from "@/lib/upload-client";

type SupportFile = { id: number; originalName: string; contentType: string; sizeBytes: number; createdAt: string };
type SupportReply = { id: number; authorEmail: string; authorRole: string; body: string; internal?: boolean; createdAt: string; files?: SupportFile[] };
type SupportTicket = { id: number; ticketNumber: string; userEmail: string|null; category: string; priority: string; title: string; message: string; contactChannel?: string; status: string; createdAt: string; updatedAt: string; replies?: SupportReply[] };

const statusLabel: Record<string, string> = { new: "جديدة", open: "مفتوحة", waiting: "بانتظار ردك", resolved: "محلولة", closed: "مغلقة" };
const channelLabel: Record<string, string> = { in_app: "محادثة مراس", email: "البريد الإلكتروني", whatsapp: "واتساب" };

export function SupportForm() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(() => { if (typeof window === "undefined") return null; const requested = Number(new URLSearchParams(window.location.search).get("ticket")); return Number.isInteger(requested) && requested > 0 ? requested : null; });
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [ticketNumber, setTicketNumber] = useState("");
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadProgress,setUploadProgress]=useState<UploadProgress|null>(null);
  const [replyProgress,setReplyProgress]=useState<UploadProgress|null>(null);
  const uploadAbortRef=useRef<AbortController|null>(null);
  const replyAbortRef=useRef<AbortController|null>(null);

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
    setStatus("loading"); setError("");
    const element = event.currentTarget;
    const form = new FormData(element);
    const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
    const controller=new AbortController(); uploadAbortRef.current=controller;
    setUploadProgress({loaded:0,total:files.reduce((sum,file)=>sum+file.size,0),percent:0,bytesPerSecond:0,remainingSeconds:null});
    try {
      const result = await uploadWithProgress<{ ticket?: { ticketNumber?: string; id?: number }; error?: string }>({url:"/api/support",body:form,timeoutMs:15*60_000,signal:controller.signal,onProgress:setUploadProgress});
      setTicketNumber(result.ticket?.ticketNumber || `SP-${Date.now().toString().slice(-8)}`);
      setStatus("done");
      await loadTickets();
      if (result.ticket?.id) setSelectedId(result.ticket.id);
      if (files.length) element.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إرسال التذكرة. حاول مرة أخرى."); setStatus("idle");
    } finally { uploadAbortRef.current=null; setUploadProgress(null); }
  };

  const sendReply = async () => {
    if (!selected || (!reply.trim() && !replyFiles.length)) return;
    setReplyBusy(true); setError("");
    try {
      const form = new FormData(); form.set("ticketId", String(selected.id)); form.set("message", reply);
      replyFiles.forEach((file) => form.append("files", file));
      const controller=new AbortController(); replyAbortRef.current=controller;
      setReplyProgress({loaded:0,total:replyFiles.reduce((sum,file)=>sum+file.size,0),percent:0,bytesPerSecond:0,remainingSeconds:null});
      await uploadWithProgress<{ok?:boolean}>({url:"/api/support",body:form,timeoutMs:15*60_000,signal:controller.signal,onProgress:setReplyProgress});
      setReply(""); setReplyFiles([]); if (fileRef.current) fileRef.current.value = ""; await loadTickets();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر إرسال الرد"); }
    finally { replyAbortRef.current=null; setReplyProgress(null); setReplyBusy(false); }
  };

  const changeStatus = async (action: "reopen" | "close") => {
    if (!selected) return;
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
      <form className="support-form" onSubmit={submit}>
        <div className="two-fields"><label>التصنيف<select name="category" required><option value="technical">مشكلة تقنية</option><option value="payment">الدفع والفواتير</option><option value="course">المواد والدروس</option><option value="account">الحساب</option><option value="suggestion">اقتراح</option></select></label><label>الأولوية<select name="priority" required><option value="normal">عادية</option><option value="high">عالية</option><option value="urgent">عاجلة</option></select></label></div>
        <label>عنوان المحادثة<input name="title" required minLength={3} placeholder="مثال: لا يعمل الفيديو في المادة" /></label>
        <label>قناة المتابعة المفضلة<select name="contactChannel" defaultValue="in_app"><option value="in_app">محادثة مراس — الأسرع</option><option value="email">البريد الإلكتروني</option><option value="whatsapp">واتساب</option></select></label>
        <label>اشرح المشكلة<textarea name="message" required minLength={10} placeholder="اكتب التفاصيل والخطوات التي جربتها..." /></label>
        <label className="support-file-picker"><FileUp size={20} /><span><strong>إرفاق صور أو مستندات</strong><small>حتى 5 ملفات، و15 ميجابايت للملف الواحد</small></span><input name="files" type="file" multiple accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.txt" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        {status==="loading"&&uploadProgress&&<div className="upload-progress-card" role="status"><div><span style={{width:`${uploadProgress.percent}%`}}/></div><small>{uploadProgressLabel(uploadProgress)}</small><button type="button" onClick={()=>uploadAbortRef.current?.abort()}><X size={14}/> إلغاء الرفع</button></div>}
        <button className="button button-primary form-main-submit" disabled={status === "loading"}>{status === "loading" ? <LoaderCircle size={18} className="spin" /> : <><Send size={17} /> فتح المحادثة</>}</button>
      </form>
      {status === "done" && <div className="support-success-inline"><CheckCircle2 size={20} /><span>تم فتح المحادثة <b dir="ltr">#{ticketNumber}</b>. يمكنك متابعة الرد من الأسفل.</span><button type="button" onClick={() => setStatus("idle")} aria-label="إخفاء الرسالة"><X size={16} /></button></div>}
    </section>

    <section className="support-inbox-card">
      <div className="support-card-heading"><span className="support-heading-icon"><ShieldCheck size={20} /></span><div><h2>محادثاتك</h2><p>كل رسالة وملف هنا مرتبطان بحسابك فقط.</p></div><button className="icon-button" type="button" onClick={() => void loadTickets()} aria-label="تحديث المحادثات"><RefreshCw size={17} /></button></div>
      {!tickets.length ? <div className="support-empty"><MessageCircle size={28} /><p>لا توجد محادثات بعد.</p><small>افتح أول محادثة وسيظهر رد الفريق هنا.</small></div> : <div className="support-chat-layout"><div className="support-ticket-list">{tickets.map((ticket) => <button type="button" className={`support-ticket-item ${selected?.id === ticket.id ? "active" : ""}`} key={ticket.id} onClick={() => setSelectedId(ticket.id)}><span><b>{ticket.title}</b><small dir="ltr">#{ticket.ticketNumber}</small></span><em>{statusLabel[ticket.status] || ticket.status}</em><time>{new Date(ticket.updatedAt || ticket.createdAt).toLocaleDateString("ar-SA")}</time></button>)}</div>{selected && <div className="support-thread"><header><div><h3>{selected.title}</h3><p><span dir="ltr">#{selected.ticketNumber}</span> · {channelLabel[selected.contactChannel || "in_app"]} · {statusLabel[selected.status] || selected.status}</p></div><div className="support-thread-actions">{selected.status === "closed" || selected.status === "resolved" ? <button type="button" className="button button-soft" onClick={() => void changeStatus("reopen")}>إعادة فتح</button> : null}</div></header><div className="support-messages"><article className="support-bubble student"><div><strong>أنت</strong><time>{new Date(selected.createdAt).toLocaleString("ar-SA")}</time></div><p>{selected.message}</p></article>{selected.replies?.filter((item) => item.body || item.files?.length).map((item) => <article className={`support-bubble ${item.authorRole === "student" ? "student" : "agent"}`} key={item.id}><div><strong>{item.authorRole === "student" ? "أنت" : "فريق مراس"}</strong><time>{new Date(item.createdAt).toLocaleString("ar-SA")}</time></div>{item.body && <p>{item.body}</p>}{item.files?.length ? <div className="support-attachments">{item.files.map((file) => <a key={file.id} href={`/api/support/files/${file.id}`} target="_blank" rel="noreferrer"><Paperclip size={14} />{file.originalName}</a>)}</div> : null}</article>)}</div>{selected.status !== "closed" && selected.status !== "resolved" ? <div className="support-reply-box"><textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder="اكتب ردك هنا..." aria-label="رد على المحادثة" />{replyBusy&&replyProgress&&<div className="upload-progress-card compact" role="status"><div><span style={{width:`${replyProgress.percent}%`}}/></div><small>{uploadProgressLabel(replyProgress)}</small><button type="button" onClick={()=>replyAbortRef.current?.abort()}><X size={14}/> إلغاء</button></div>}<div><label className="support-attach-button"><Paperclip size={17} /><span>{replyFiles.length ? `${replyFiles.length} ملفات` : "إرفاق"}</span><input ref={fileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.txt" onChange={(event) => setReplyFiles(Array.from(event.target.files || []).slice(0, 5))} /></label><button type="button" className="button button-primary" disabled={replyBusy || (!reply.trim() && !replyFiles.length)} onClick={() => void sendReply()}>{replyBusy ? <LoaderCircle size={16} className="spin" /> : <><Send size={16} /> إرسال</>}</button></div></div> : <div className="support-closed-note"><CheckCircle2 size={18} /> أُغلقت المحادثة من المشرف. يمكنك إعادة فتحها وإرسال رسالة جديدة.</div>}</div>}</div>}
    </section>
  </div>;
}
