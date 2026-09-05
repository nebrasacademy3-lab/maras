"use client";
import { SearchableSelect } from "@/components/searchable-select";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Archive, BellRing, Check, ChevronLeft, Edit3, Eye, LoaderCircle, Plus, RefreshCw, Route, Search, Sparkles, UsersRound, X } from "lucide-react";
import { AdminCenterNav } from "@/components/admin-center-nav";
import { fromDateTimeLocal, toDateTimeLocal } from "@/components/admin-datetime";
import { ADMIN_STEP_UP_MESSAGE, AdminMfaNotice, isAdminStepUpMessage, isAdminStepUpResponse } from "@/components/admin-mfa-notice";
import { useRealtimeSync } from "@/components/realtime-sync";
import styles from "./admin-learning-tracks-center.module.css";

type Interest = { id:number; status:string; source:string; lastNotifiedVersion:number; createdAt:string; email:string; fullName:string; universitySlug:string|null; specialty:string|null };

type TrackStatus = "draft" | "coming_soon" | "enrollment_open" | "available" | "archived";
type TrackCategory = "english" | "training" | "foundation" | "university" | "career" | "exam" | "skills";
type TrackIcon = "languages" | "briefcase" | "calculator" | "presentation" | "rocket" | "target" | "sparkles";
type TrackAccent = "blue" | "violet" | "emerald" | "amber" | "rose" | "cyan";
type Track = {
  id:number; slug:string; title:string; subtitle:string; description:string; category:TrackCategory; iconKey:TrackIcon;
  accent:TrackAccent; status:TrackStatus; ctaLabel:string; destination:string|null; position:number; featured:boolean;
  showInterestCount:boolean; releaseVersion:number; launchAt:string|null; updatedAt:string; interests:{active:number;total:number};
};
type FormState = {
  slug:string; title:string; subtitle:string; description:string; category:TrackCategory; iconKey:TrackIcon; accent:TrackAccent;
  status:TrackStatus; ctaLabel:string; destination:string; position:string; featured:boolean; showInterestCount:boolean; launchAt:string;
};

const emptyForm:FormState = {
  slug:"", title:"", subtitle:"", description:"", category:"skills", iconKey:"sparkles", accent:"blue", status:"coming_soon",
  ctaLabel:"أبلغني عند الإطلاق", destination:"", position:"100", featured:false, showInterestCount:false, launchAt:"",
};
const statusLabel:Record<TrackStatus,string> = { draft:"مسودة", coming_soon:"قريبًا", enrollment_open:"التسجيل مفتوح", available:"متاح الآن", archived:"مؤرشف" };
const categoryLabel:Record<TrackCategory,string> = { english:"اللغة الإنجليزية", training:"دورات تدريبية", foundation:"تأسيس", university:"مهارات جامعية", career:"استعداد مهني", exam:"اختبارات", skills:"مهارات عامة" };
const iconLabel:Record<TrackIcon,string> = { languages:"لغات", briefcase:"حقيبة", calculator:"تأسيس", presentation:"عرض", rocket:"انطلاق", target:"هدف", sparkles:"مراس" };
const accentLabel:Record<TrackAccent,string> = { blue:"أزرق", violet:"بنفسجي", emerald:"زمردي", amber:"ذهبي", rose:"وردي", cyan:"سماوي" };
const dateInput = (value:string|null) => toDateTimeLocal(value);
const dateLabel = (value:string|null) => value ? new Date(value).toLocaleString("ar-SA",{dateStyle:"medium",timeStyle:"short"}) : "غير محدد";

export function AdminLearningTracksCenter({ adminName }:{ adminName:string }) {
  const [tracks,setTracks] = useState<Track[]>([]);
  const [form,setForm] = useState<FormState>(emptyForm);
  const [editingId,setEditingId] = useState<number|null>(null);
  const [query,setQuery] = useState("");
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [notice,setNotice] = useState<{tone:"ok"|"error";text:string}|null>(null);
  const [interestTrack,setInterestTrack] = useState<Track|null>(null);
  const [interests,setInterests] = useState<Interest[]|null>(null);
  const lastLoad = useRef(0);

  const load = useCallback(async(signal?:AbortSignal)=>{
    lastLoad.current=Date.now();
    try {
      const response=await fetch("/api/admin/learning-tracks",{cache:"no-store",credentials:"same-origin",signal});
      const payload=await response.json() as {tracks?:Track[];error?:string};
      if(!response.ok) throw new Error(payload.error||"تعذر تحميل المسارات");
      setTracks(payload.tracks||[]);
    } catch(error) {
      if(error instanceof DOMException&&error.name==="AbortError") return;
      setNotice({tone:"error",text:error instanceof Error?error.message:"تعذر تحميل المسارات"});
    } finally { setLoading(false); }
  },[]);

  useEffect(()=>{
    const controller=new AbortController();
    const timer=window.setTimeout(()=>void load(controller.signal),0);
    return()=>{window.clearTimeout(timer);controller.abort();};
  },[load]);
  useRealtimeSync((payload)=>{
    if(payload.changed&&!payload.changed.includes("catalog")&&!payload.changed.includes("admin")) return;
    if(Date.now()-lastLoad.current<5000) return;
    void load();
  });

  async function openInterests(track:Track){
    setInterestTrack(track);setInterests(null);
    try {
      const response=await fetch(`/api/admin/learning-tracks?track=${track.id}`,{cache:"no-store",credentials:"same-origin"});
      const payload=await response.json() as {interests?:Interest[];error?:string};
      if(!response.ok) throw new Error(payload.error||"تعذر تحميل المهتمين");
      setInterests(payload.interests||[]);
    } catch(error) { setNotice({tone:"error",text:error instanceof Error?error.message:"تعذر تحميل المهتمين"});setInterestTrack(null); }
  }
  function exportInterests(){
    if(!interests||!interestTrack) return;
    const rows=[["الاسم","البريد","الجامعة","التخصص","الحالة","آخر نسخة أُبلغ بها","تاريخ التسجيل"],...interests.map((row)=>[row.fullName,row.email,row.universitySlug||"",row.specialty||"",row.status,String(row.lastNotifiedVersion),row.createdAt])];
    const csv="\uFEFF"+rows.map((row)=>row.map((cell)=>`"${String(cell).replace(/"/g,'""')}"`).join(",")).join("\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    const anchor=document.createElement("a");anchor.href=url;anchor.download=`track-${interestTrack.slug}-interests.csv`;anchor.click();URL.revokeObjectURL(url);
  }

  const stats=useMemo(()=>({
    public:tracks.filter((track)=>["coming_soon","enrollment_open","available"].includes(track.status)).length,
    interests:tracks.reduce((sum,track)=>sum+track.interests.active,0),
    ready:tracks.filter((track)=>track.status==="available"||track.status==="enrollment_open").length,
  }),[tracks]);
  const visible=useMemo(()=>{const normalized=query.trim().toLowerCase();return tracks.filter((track)=>!normalized||[track.title,track.subtitle,track.slug,categoryLabel[track.category]].join(" ").toLowerCase().includes(normalized));},[query,tracks]);

  function reset(){setEditingId(null);setForm(emptyForm);setNotice(null);}
  function edit(track:Track){
    setEditingId(track.id);
    setForm({slug:track.slug,title:track.title,subtitle:track.subtitle,description:track.description,category:track.category,iconKey:track.iconKey,accent:track.accent,status:track.status,ctaLabel:track.ctaLabel,destination:track.destination||"",position:String(track.position),featured:track.featured,showInterestCount:track.showInterestCount,launchAt:dateInput(track.launchAt)});
    setNotice(null);window.scrollTo({top:0,behavior:"smooth"});
  }

  async function mutate(method:"POST"|"PATCH",body:Record<string,unknown>,success:string){
    setSaving(true);setNotice(null);
    try {
      const response=await fetch("/api/admin/learning-tracks",{method,credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
      const payload=await response.json() as {error?:string;code?:string};
      if(isAdminStepUpResponse(response)) throw new Error(ADMIN_STEP_UP_MESSAGE);
      if(!response.ok) throw new Error(payload.error||"تعذر حفظ المسار");
      setNotice({tone:"ok",text:success});await load();return true;
    } catch(error) { setNotice({tone:"error",text:error instanceof Error?error.message:"تعذر حفظ المسار"});return false; }
    finally { setSaving(false); }
  }

  async function save(){
    const ok=await mutate(editingId?"PATCH":"POST",{...form,id:editingId,position:Number(form.position),destination:form.destination||null,launchAt:fromDateTimeLocal(form.launchAt)},editingId?"تم تحديث المسار؛ وستصل حالة الإطلاق للمهتمين مرة واحدة.":"تم إنشاء المسار وإضافته إلى خطة المحتوى.");
    if(ok){setEditingId(null);setForm(emptyForm);}
  }
  async function archive(track:Track){
    if(!window.confirm("أرشفة «"+track.title+"»؟ سيختفي من الواجهة مع الاحتفاظ بسجل المهتمين.")) return;
    await mutate("PATCH",{...track,status:"archived",position:track.position},"تمت أرشفة المسار دون حذف سجل الاهتمامات.");
  }

  return <main className={styles.page} dir="rtl"><div className={styles.shell}>
    <AdminCenterNav />
    <header className={styles.header}>
      <div><span><Route size={16}/> خارطة محتوى مراس</span><h1>المسارات القادمة</h1><p>{adminName} · تحكم بما يظهر في الرئيسية، واجمع الاهتمامات، وافتح التسجيل مع إشعار تلقائي.</p></div>
      <nav><button type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> تحديث</button></nav>
    </header>

    <section className={styles.stats} aria-label="ملخص المسارات">
      <article><i><Eye size={19}/></i><span><small>ظاهرة للطلاب</small><strong>{stats.public.toLocaleString("ar-SA")}</strong></span></article>
      <article><i><UsersRound size={19}/></i><span><small>اهتمامات نشطة</small><strong>{stats.interests.toLocaleString("ar-SA")}</strong></span></article>
      <article><i><BellRing size={19}/></i><span><small>مفتوحة أو متاحة</small><strong>{stats.ready.toLocaleString("ar-SA")}</strong></span></article>
    </section>
    {notice&&notice.tone==="error"&&isAdminStepUpMessage(notice.text)?<AdminMfaNotice/>:notice?<div className={styles.notice} data-tone={notice.tone}>{notice.tone==="ok"?<Check size={17}/>:<X size={17}/>}<span>{notice.text}</span></div>:null}

    <section className={styles.editor}>
      <div className={styles.editorHeading}><div><span>{editingId?"تعديل المسار":"مسار جديد"}</span><h2>{editingId?form.title||"بيانات المسار":"أضف ما ستطلقه مراس لاحقًا"}</h2></div>{editingId?<button type="button" onClick={reset}><X size={15}/> إلغاء</button>:null}</div>
      <div className={styles.formGrid}>
        <label>اسم المسار<input value={form.title} onChange={(event)=>setForm({...form,title:event.target.value})} placeholder="مثال: تقوية الإنجليزية"/></label>
        <label>المعرّف الإنجليزي<input dir="ltr" value={form.slug} onChange={(event)=>setForm({...form,slug:event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g,"-")})} placeholder="english-boost"/></label>
        <label className={styles.wide}>العنوان المختصر<input value={form.subtitle} onChange={(event)=>setForm({...form,subtitle:event.target.value})} placeholder="ما الذي سيحصل عليه الطالب؟"/></label>
        <label className={styles.wide}>الوصف<textarea value={form.description} onChange={(event)=>setForm({...form,description:event.target.value})} placeholder="وصف واضح ومختصر للمسار ومحتواه المتوقع."/></label>
        <label>التصنيف<SearchableSelect value={form.category} onChange={(event)=>setForm({...form,category:event.target.value as TrackCategory})}>{Object.entries(categoryLabel).map(([value,label])=><option key={value} value={value}>{label}</option>)}</SearchableSelect></label>
        <label>الأيقونة<SearchableSelect value={form.iconKey} onChange={(event)=>setForm({...form,iconKey:event.target.value as TrackIcon})}>{Object.entries(iconLabel).map(([value,label])=><option key={value} value={value}>{label}</option>)}</SearchableSelect></label>
        <label>اللون<SearchableSelect value={form.accent} onChange={(event)=>setForm({...form,accent:event.target.value as TrackAccent})}>{Object.entries(accentLabel).map(([value,label])=><option key={value} value={value}>{label}</option>)}</SearchableSelect></label>
        <label>الحالة<SearchableSelect value={form.status} onChange={(event)=>setForm({...form,status:event.target.value as TrackStatus})}>{Object.entries(statusLabel).map(([value,label])=><option key={value} value={value}>{label}</option>)}</SearchableSelect></label>
        <label>الترتيب<input type="number" min="0" value={form.position} onChange={(event)=>setForm({...form,position:event.target.value})}/></label>
        <label>موعد متوقع<input type="datetime-local" value={form.launchAt} onChange={(event)=>setForm({...form,launchAt:event.target.value})}/></label>
        <label>نص الزر<input value={form.ctaLabel} onChange={(event)=>setForm({...form,ctaLabel:event.target.value})}/></label>
        <label>رابط الوجهة<input dir="ltr" value={form.destination} onChange={(event)=>setForm({...form,destination:event.target.value})} placeholder="/courses أو /path"/></label>
        <label className={styles.switch}><input type="checkbox" checked={form.featured} onChange={(event)=>setForm({...form,featured:event.target.checked})}/><span><Sparkles size={16}/> إبراز المسار أولًا</span></label>
        <label className={styles.switch}><input type="checkbox" checked={form.showInterestCount} onChange={(event)=>setForm({...form,showInterestCount:event.target.checked})}/><span><UsersRound size={16}/> إظهار عدد المهتمين</span></label>
      </div>
      <aside className={styles.preview} data-accent={form.accent}><small>معاينة البطاقة</small><span>{statusLabel[form.status]}</span><h3>{form.title||"اسم المسار"}</h3><p>{form.subtitle||"عنوان قصير يوضح قيمة المسار للطالب."}</p><div><b>{form.ctaLabel||"نص الإجراء"}</b><em>{form.featured?"مميز":"عادي"}</em></div></aside>
      <button className={styles.save} type="button" disabled={saving} onClick={()=>void save()}>{saving?<LoaderCircle className={styles.spin} size={17}/>:editingId?<Check size={17}/>:<Plus size={17}/>} {editingId?"حفظ التعديلات":"إنشاء المسار"}</button>
    </section>

    <section className={styles.list}>
      <div className={styles.listHeading}><div><span>الترتيب ودورة الحياة</span><h2>كل المسارات</h2></div><label><Search size={16}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="ابحث بالاسم أو التصنيف"/></label></div>
      {loading?<div className={styles.empty}><RefreshCw className={styles.spin} size={22}/> جارٍ تحميل المسارات…</div>:visible.length?<div className={styles.trackGrid}>{visible.map((track)=><article key={track.id} className={styles.trackCard} data-accent={track.accent}>
        <header><span>{categoryLabel[track.category]}</span><b data-status={track.status}>{statusLabel[track.status]}</b></header><h3>{track.title}</h3><p>{track.subtitle||track.description||"لا يوجد وصف مختصر."}</p>
        <div className={styles.meta}><span><UsersRound size={14}/> {track.interests.active.toLocaleString("ar-SA")} مهتم</span><span>{track.featured?<Eye size={14}/>:null} {track.featured?"مميز":"عادي"}</span><span>ترتيب {track.position.toLocaleString("ar-SA")}</span></div>
        <small>الموعد: {dateLabel(track.launchAt)} · نسخة الإطلاق {track.releaseVersion.toLocaleString("ar-SA")}</small>
        <footer><button type="button" onClick={()=>edit(track)}><Edit3 size={15}/> تعديل</button><button type="button" onClick={()=>void openInterests(track)}><UsersRound size={15}/> المهتمون ({track.interests.total.toLocaleString("ar-SA")})</button>{track.status!=="archived"?<button type="button" onClick={()=>void archive(track)}><Archive size={15}/> أرشفة</button>:null}</footer>
      </article>)}</div>:<div className={styles.empty}><Route size={24}/><h3>لا توجد نتائج</h3><p>غيّر عبارة البحث أو أنشئ مسارًا جديدًا.</p></div>}
    </section>

    {interestTrack?<section className={styles.list}>
      <div className={styles.listHeading}><div><span>سجل الاهتمام</span><h2>المهتمون بمسار «{interestTrack.title}»</h2></div><div className={styles.interestActions}><button type="button" disabled={!interests?.length} onClick={exportInterests}>تصدير CSV</button><button type="button" onClick={()=>{setInterestTrack(null);setInterests(null);}}><X size={15}/> إغلاق</button></div></div>
      {!interests?<div className={styles.empty}><RefreshCw className={styles.spin} size={22}/> جارٍ تحميل المهتمين…</div>:interests.length?<div className={styles.interestTable}><div className={styles.interestHead}><span>الطالب</span><span>الجامعة والتخصص</span><span>المصدر</span><span>الحالة</span><span>آخر إشعار</span><span>التسجيل</span></div>{interests.map((row)=><div key={row.id} className={styles.interestRow}><span><b>{row.fullName}</b><small dir="ltr">{row.email}</small></span><span>{row.universitySlug||"—"}<small>{row.specialty||"—"}</small></span><span>{row.source==="homepage"?"الرئيسية":row.source==="mobile"?"التطبيق":row.source}</span><span>{row.status==="active"?"مهتم":"ألغى الاهتمام"}</span><span>{row.lastNotifiedVersion>=interestTrack.releaseVersion&&interestTrack.releaseVersion>0?"أُبلغ بالإطلاق":row.lastNotifiedVersion>0?`نسخة ${row.lastNotifiedVersion}`:"لم يُبلغ بعد"}</span><span>{new Date(row.createdAt).toLocaleDateString("ar-SA")}</span></div>)}</div>:<div className={styles.empty}><UsersRound size={24}/><h3>لا يوجد مهتمون بعد</h3><p>سيظهر هنا كل طالب سجّل اهتمامه من الرئيسية أو التطبيق.</p></div>}
    </section>:null}
    <Link className={styles.back} href="/admin"><ChevronLeft size={16}/> العودة إلى لوحة الإدارة</Link>
  </div></main>;
}
