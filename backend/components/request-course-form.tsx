"use client";

import { useState } from "react";
import { ArrowLeft, BellRing, CheckCircle2, FileText, LoaderCircle, Paperclip, Sparkles, UploadCloud, X } from "lucide-react";

export function RequestCourseForm({ universityName, specialty, studentName }: { universityName:string; specialty:string; studentName:string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState("");
  const [files,setFiles]=useState<File[]>([]);
  const choose=(list:FileList|null)=>{if(!list)return;const selected=Array.from(list);const total=selected.reduce((sum,file)=>sum+file.size,0);setFiles(selected);setError(total>100*1024*1024?"إجمالي حجم المرفقات يجب ألا يتجاوز 100 ميجابايت":"");};
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if(error)return;
    setStatus("loading"); setError("");
    const form = new FormData(event.currentTarget); files.forEach((file)=>form.append("files",file));
    try { const response=await fetch("/api/course-requests",{method:"POST",body:form}); const result=await response.json() as {error?:string}; if(!response.ok)throw new Error(result.error||"تعذر إرسال الطلب"); setStatus("done"); }
    catch(caught){setError(caught instanceof Error?caught.message:"تعذر إرسال الطلب");setStatus("idle");}
  };
  if(status==="done")return <div className="form-success-state"><div><CheckCircle2 size={37}/></div><span>وصل طلبك إلى المشرف</span><h2>يمكنك متابعة الحالة من لوحتك</h2><p>حُفظت بيانات المادة والمرفقات وربطت بحسابك. سنرسل إشعارًا عند تغيير الحالة.</p><button className="button button-primary" onClick={()=>{setStatus("idle");setFiles([]);}}>طلب مادة أخرى</button></div>;
  return <form className="request-form" onSubmit={submit} encType="multipart/form-data">
    <div className="request-profile-lock"><CheckCircle2 size={18}/><span><strong>{studentName}</strong><small>{universityName} · {specialty}</small></span><em>من ملفك المكتمل</em></div>
    <label>اسم المادة<div className="input-with-icon"><Sparkles size={18}/><input name="courseName" required minLength={3} maxLength={160} placeholder="مثال: علم الأدوية Pharmacology"/></div></label>
    <label>رمز المادة (اختياري)<div className="input-with-icon"><FileText size={18}/><input name="courseCode" maxLength={40} placeholder="مثال: PHRM 214" dir="ltr"/></div></label>
    <label>ملاحظات أو تفاصيل المنهج<textarea name="notes" maxLength={1500} placeholder="اسم المدرّس، الوحدات المطلوبة، موعد الاختبار أو أي تفاصيل تساعد المشرف..."/></label>
    <label className="request-upload"><input type="file" multiple accept=".pdf,.ppt,.pptx,.doc,.docx,.png,.jpg,.jpeg" onChange={(event)=>choose(event.target.files)}/><UploadCloud size={28}/><span><strong>ارفع السلايدات أو توصيف المقرر</strong><small>PDF, PPTX, DOCX أو صور · عدد الملفات غير محدود · إجمالي حتى 100MB</small></span></label>
    {files.length>0&&<div className="request-file-list">{files.map((file,index)=><span key={`${file.name}-${file.size}`}><Paperclip size={14}/><b>{file.name}</b><small>{(file.size/1024/1024).toFixed(1)} MB</small><button type="button" onClick={()=>{const next=files.filter((_,item)=>item!==index);setFiles(next);setError(next.reduce((sum,item)=>sum+item.size,0)>100*1024*1024?"إجمالي حجم المرفقات يجب ألا يتجاوز 100 ميجابايت":"");}} aria-label="حذف الملف"><X size={14}/></button></span>)}</div>}
    <label className="terms-check"><input type="checkbox" name="notify" defaultChecked/> أرسل لي إشعارًا عند إسناد الطلب أو بدء إنتاج المادة أو توفرها.</label>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <button className="button button-primary form-main-submit" disabled={status==="loading"}>{status==="loading"?<LoaderCircle size={18} className="spin"/>:<><BellRing size={17}/> إرسال الطلب والمرفقات <ArrowLeft size={16}/></>}</button>
  </form>;
}
