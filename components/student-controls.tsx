"use client";
import { useId, useRef, useState } from "react";
import type { StudentControlsData } from "@/lib/student-control-contract";
import { ADMIN_STEP_UP_MESSAGE, AdminMfaNotice, isAdminStepUpResponse } from "@/components/admin-mfa-notice";
import styles from "./student-controls.module.css";
const groups: Record<string,string>={profile:"بيانات الحساب",subscriptions:"الاشتراكات",ai:"أدوات مراس",interest:"الاهتمامات والسلة",support:"الدعم",requests:"طلبات المواد",notifications:"الإشعارات",sessions:"الأجهزة والجلسات"};
export function StudentControls({email,controls,group,onChanged}:{email:string;controls?:StudentControlsData;group:string;onChanged:()=>Promise<void>|void}) {
 const uid=useId();
 const available=(controls?.actions||[]).filter(row=>row.group===group);
 const [action,setAction]=useState(""); const [values,setValues]=useState<Record<string,string>>({});
 const [reason,setReason]=useState("");const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [stepUp,setStepUp]=useState(false);
 const attempt=useRef<{body:string;key:string}|null>(null);
 const [search,setSearch]=useState("");const [remoteOptions,setRemoteOptions]=useState<Array<{value:string;label:string}>|null>(null);const [searching,setSearching]=useState(false);
 const definition=available.find(row=>row.action===action);
 if(!controls||!available.length)return null;
 function choose(value:string){setAction(value);setValues(value==="profile.update"?{...controls!.profile}:{});setMessage("");setStepUp(false);setRemoteOptions(null);setSearch("");}
 async function findRecords(){
  const kind=definition?.fields.find(field=>field.key==="id")?.choices;if(!kind)return;
  setSearching(true);setMessage("");
  try{const res=await fetch(`/api/admin/students/${encodeURIComponent(email)}/records?kind=${encodeURIComponent(kind)}&q=${encodeURIComponent(search)}`,{cache:"no-store"});const data=await res.json();if(!res.ok)throw new Error(data.error||"تعذر البحث");setRemoteOptions(data.items);setMessage(`نتائج البحث: ${data.total}؛ تُعرض أول 100 نتيجة. ضيّق البحث بالاسم أو الرقم عند الحاجة.`);}catch(e){setMessage(e instanceof Error?e.message:"تعذر البحث");}finally{setSearching(false);}
 }
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(!definition||busy)return;setBusy(true);setMessage("");setStepUp(false);
  const fields=Object.fromEntries(definition.fields.map(field=>[field.key,values[field.key]??field.initial??""]));
  const payload={action:definition.action,reason,...fields,...(definition.action==="profile.update"?{expectedUpdatedAt:values.expectedUpdatedAt||controls!.profile.expectedUpdatedAt}:{})};
  const body=JSON.stringify(payload);if(attempt.current?.body!==body)attempt.current={body,key:crypto.randomUUID()};
  try{const response=await fetch(`/api/admin/students/${encodeURIComponent(email)}/actions`,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({...payload,operationKey:attempt.current.key})});const result=await response.json();if(isAdminStepUpResponse(response)){setStepUp(true);throw new Error(ADMIN_STEP_UP_MESSAGE);}if(!response.ok)throw new Error(result.error||"تعذر تنفيذ الإجراء");setMessage(result.message||"تم الحفظ");attempt.current=null;setReason("");await onChanged();}
  catch(error){setMessage(error instanceof Error?error.message:"تعذر تنفيذ الإجراء");}finally{setBusy(false);}
 }
 return <details className={styles.root}><summary>إدارة {groups[group]||group} من ملف الطالب</summary><form onSubmit={submit} className={styles.form}>
  <label htmlFor={`${uid}-action`}>الإجراء<select id={`${uid}-action`} value={action} onChange={e=>choose(e.target.value)} disabled={busy||searching} required><option value="">اختر الإجراء</option>{available.map(row=><option key={row.action} value={row.action}>{row.label}</option>)}</select></label>
  {definition?.warning&&<p className={styles.warning}>{definition.warning}</p>}
  {definition?.fields.some(field=>field.key==="id")&&<div className={styles.search}><label htmlFor={`${uid}-find`}>البحث في جميع سجلات الطالب، بما فيها الأقدم<input id={`${uid}-find`} value={search} onChange={e=>setSearch(e.target.value)} maxLength={160} placeholder="اسم السجل أو رقمه" disabled={busy||searching}/></label><button type="button" onClick={()=>void findRecords()} disabled={busy||searching}>{searching?"جارٍ البحث…":"بحث السجلات"}</button></div>}
  <div className={styles.grid}>{definition?.fields.map(field=>{
   const opts=field.options||(field.key==="id"&&remoteOptions!==null?remoteOptions:controls.choices[field.choices||""]||[]);const value=values[field.key]??field.initial??"";
   return <label key={field.key} htmlFor={`${uid}-${field.key}`}>{field.label}{field.type==="select"?<select id={`${uid}-${field.key}`} value={value} onChange={e=>setValues({...values,[field.key]:e.target.value})} disabled={busy} required={field.required}><option value="">اختر من القائمة</option>{opts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:field.type==="textarea"?<textarea id={`${uid}-${field.key}`} value={value} onChange={e=>setValues({...values,[field.key]:e.target.value})} maxLength={field.maxLength} required={field.required} disabled={busy} rows={4}/>:<input id={`${uid}-${field.key}`} type={field.type} value={value} onChange={e=>setValues({...values,[field.key]:e.target.value})} maxLength={field.maxLength} min={field.min} max={field.max} required={field.required} disabled={busy}/>}</label>;
  })}</div>
  {definition&&<><label htmlFor={`${uid}-reason`}>سبب الإجراء (يسجّل في سجل التدقيق)<textarea id={`${uid}-reason`} value={reason} onChange={e=>setReason(e.target.value)} minLength={3} maxLength={500} required disabled={busy} rows={2}/></label><button className={styles.submit} type="submit" disabled={busy}>{busy?"جارٍ الحفظ…":"تأكيد الإجراء وحفظه"}</button></>}
  {stepUp&&<AdminMfaNotice/>}{message&&<p role="status" aria-live="polite" className={styles.message}>{message}</p>}
 </form></details>;
}
