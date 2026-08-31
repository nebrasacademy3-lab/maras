"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileUp, LoaderCircle, MessageCircle, RefreshCw, ShieldCheck, X } from "lucide-react";
import { uploadProgressLabel, uploadWithProgress, type UploadProgress } from "@/lib/upload-client";
import { SupportChatThread, type SupportChatReply, type SupportChatTicket } from "@/components/support-chat";

type SupportTicket = SupportChatTicket & {
  userEmail:string|null; category:string; priority:string; message:string; contactChannel?:string; updatedAt:string; replies?:SupportChatReply[];
};

const statusLabel: Record<string, string> = { new: "جديدة", open: "مفتوحة", waiting: "بانتظار ردك", resolved: "محلولة", closed: "مغلقة" };
const channelLabel: Record<string, string> = { in_app: "محادثة مراس", email: "البريد الإلكتروني", whatsapp: "واتساب" };

export function SupportForm() {
  const [tickets,setTickets]=useState<SupportTicket[]>([]);
  const [selectedId,setSelectedId]=useState<number | null>(() =>{if(typeof window==="undefined")return null;const id=Number(new URLSearchParams(window.location.search).get("ticket"));return Number.isInteger(id)&&id>0?id:null;});
  const [status,setStatus]=useState<"idle"|"loading"|"done">("idle"); const [ticketNumber,setTicketNumber]=useState(""); const [error,setError]=useState("");
  const [uploadProgress,setUploadProgress]=useState<UploadProgress|null>(null); const uploadAbortRef=useRef<AbortController|null>(null);

  const loadTickets=useCallback(async()=>{
    try{const response=await fetch("/api/support",{credentials:"same-origin",cache:"no-store"});const result=await response.json() as {tickets?:SupportTicket[]};if(response.ok)setTickets(result.tickets||[]);}
    catch{/* keep last snapshot */}
  },[]);
  useEffect(()=>{queueMicrotask(()=>{void loadTickets();});},[loadTickets]);
  const selected=useMemo(()=>tickets.find((ticket)=>ticket.id===selectedId)||null,[tickets,selectedId]);

  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setStatus("loading");setError("");const element=event.currentTarget;const form=new FormData(element);
    const files=form.getAll("files").filter((item):item is File=>item instanceof File&&item.size>0);
    const controller=new AbortController();uploadAbortRef.current=controller;setUploadProgress({loaded:0,total:files.reduce((sum,file)=>sum+file.size,0),percent:0,bytesPerSecond:0,remainingSeconds:null});
    try{
      const result=await uploadWithProgress<{ticket?:{ticketNumber?:string;id?:number}}>({url:"/api/support",body:form,timeoutMs:15*60_000,signal:controller.signal,onProgress:setUploadProgress});
      setTicketNumber(result.ticket?.ticketNumber||"");setStatus("done");element.reset();await loadTickets();if(result.ticket?.id)setSelectedId(result.ticket.id);
    }catch(reason){setError(reason instanceof Error?reason.message:"تعذر فتح المحادثة");setStatus("idle");}
    finally{uploadAbortRef.current=null;setUploadProgress(null);}
  };

  const reopen=async()=>{
    if(!selected)return;
    const response=await fetch("/api/support",{method:"PATCH",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({ticketId:selected.id,action:"reopen"})});
    if(response.ok)await loadTickets();
  };

  if(selected)return <div className="support-workspace support-chat-workspace">
    <section className="support-inbox-card support-chat-card">
      <div className="support-card-heading"><button className="button button-ghost" type="button" onClick={()=>setSelectedId(null)}>كل المحادثات</button><div><h2>{selected.title}</h2><p><span dir="ltr">#{selected.ticketNumber}</span> · {channelLabel[selected.contactChannel||"in_app"]} · {statusLabel[selected.status]||selected.status}</p></div><span className="support-heading-icon"><MessageCircle size={20}/></span></div>
      <SupportChatThread ticket={selected} onReload={loadTickets} onReopen={reopen}/>
    </section>
  </div>;

  return <div className="support-workspace">
    <section className="support-composer-card">
      <div className="support-card-heading"><span className="support-heading-icon"><MessageCircle size={20}/></span><div><h2>ابدأ محادثة مع فريق مراس</h2><p>أرسل نصًا أو صورًا أو مستندات، وبعد فتح المحادثة يمكنك إرسال رسائل صوتية والرد على أي رسالة.</p></div></div>
      <form className="support-form" onSubmit={submit}>
        <div className="two-fields"><label>التصنيف<select name="category" required><option value="technical">مشكلة تقنية</option><option value="payment">الدفع والفواتير</option><option value="course">المواد والدروس</option><option value="account">الحساب</option><option value="suggestion">اقتراح</option></select></label><label>الأولوية<select name="priority" required><option value="normal">عادية</option><option value="high">عالية</option><option value="urgent">عاجلة</option></select></label></div>
        <label>عنوان المحادثة<input name="title" required minLength={3} placeholder="مثال: لا يعمل الفيديو في المادة"/></label>
        <label>قناة المتابعة<select name="contactChannel" defaultValue="in_app"><option value="in_app">محادثة مراس</option><option value="email">البريد الإلكتروني</option><option value="whatsapp">واتساب</option></select></label>
        <label>اشرح المشكلة<textarea name="message" minLength={3} placeholder="اكتب التفاصيل..."/></label>
        <label className="support-file-picker"><FileUp size={20}/><span><strong>إرفاق صور أو مستندات</strong><small>حتى 8 ملفات، و15 ميجابايت للملف الواحد</small></span><input name="files" type="file" multiple accept="image/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.txt"/></label>
        {error&&<p className="form-error" role="alert">{error}</p>}
        {status==="loading"&&uploadProgress&&<div className="upload-progress-card"><div><span style={{width:`${uploadProgress.percent}%`}}/></div><small>{uploadProgressLabel(uploadProgress)}</small><button type="button" onClick={()=>uploadAbortRef.current?.abort()}><X size={14}/> إلغاء</button></div>}
        <button className="button button-primary form-main-submit" disabled={status==="loading"}>{status==="loading"?<LoaderCircle size={18} className="spin"/>:<><MessageCircle size={17}/> فتح المحادثة</>}</button>
      </form>
      {status==="done"&&<div className="support-success-inline"><CheckCircle2 size={20}/><span>تم فتح المحادثة <b dir="ltr">#{ticketNumber}</b>.</span><button type="button" onClick={()=>setStatus("idle")}><X size={16}/></button></div>}
    </section>
    <section className="support-inbox-card">
      <div className="support-card-heading"><span className="support-heading-icon"><ShieldCheck size={20}/></span><div><h2>محادثاتك</h2><p>اضغط على البطاقة لفتح الشات بحجم مناسب.</p></div><button className="icon-button" type="button" onClick={()=>void loadTickets()}><RefreshCw size={17}/></button></div>
      {!tickets.length?<div className="support-empty"><MessageCircle size={28}/><p>لا توجد محادثات بعد.</p></div>:<div className="support-ticket-list support-ticket-list-cards">{tickets.map((ticket)=><button type="button" className="support-ticket-item" key={ticket.id} onClick={()=>setSelectedId(ticket.id)}><span><b>{ticket.title}</b><small dir="ltr">#{ticket.ticketNumber}</small></span><em>{statusLabel[ticket.status]||ticket.status}</em><time>{new Date(ticket.updatedAt||ticket.createdAt).toLocaleDateString("ar-SA")}</time></button>)}</div>}
    </section>
  </div>;
}
