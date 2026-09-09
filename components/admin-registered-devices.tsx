"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Laptop, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { AdminMfaNotice, isAdminStepUpResponse } from "@/components/admin-mfa-notice";
import styles from "./registered-devices.module.css";

type Device = { id:number; deviceLabel:string; platform:string; firstSeenAt:string; lastSeenAt:string; revokedAt:string|null; revokedBy:string|null; revocationReason:string|null };
const date = (value:string) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("ar-SA") : "غير محدد";
type DevicesProps = { email:string; onChanged?:()=>void|Promise<void> };
export function AdminRegisteredDevices(props:DevicesProps) { return <RegisteredDevicesContent key={props.email.toLowerCase()} {...props}/>; }

function RegisteredDevicesContent({ email, onChanged }: DevicesProps) {
  const [devices,setDevices]=useState<Device[]|null>(null);
  const [error,setError]=useState(""); const [notice,setNotice]=useState("");
  const [selected,setSelected]=useState<Device|null>(null); const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false); const [stepUp,setStepUp]=useState(false);
  const endpoint=`/api/admin/students/${encodeURIComponent(email)}/devices`;
  const loadController=useRef<AbortController|null>(null);
  const mounted=useRef(true);
  const load=useCallback(async()=>{
    loadController.current?.abort();
    const controller=new AbortController();loadController.current=controller;
    let expired=false;
    const timer=setTimeout(()=>{expired=true;controller.abort();},12_000);
    const current=()=>mounted.current&&loadController.current===controller;
    try {
      const response=await fetch(endpoint,{credentials:"same-origin",cache:"no-store",signal:controller.signal});
      const result=await response.json() as {registeredDevices?:Device[];error?:string};
      if(!response.ok)throw new Error(result.error||"تعذر تحميل الأجهزة المعتمدة");
      if(current()&&!controller.signal.aborted){setDevices(result.registeredDevices||[]);setError("");}
    }catch(caught){if(current()&&(!controller.signal.aborted||expired))setError(expired?"انتهت مهلة تحميل الأجهزة. حاول تحديث القائمة.":caught instanceof Error?caught.message:"تعذر تحميل الأجهزة المعتمدة");}
    finally{clearTimeout(timer);}
  },[endpoint]);
  useEffect(()=>{mounted.current=true;const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);mounted.current=false;loadController.current?.abort();};},[load]);
  const replace=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(!selected||busy||reason.trim().length<4)return;
    setBusy(true);setError("");setNotice("");setStepUp(false);loadController.current?.abort();
    try{
      const response=await fetch(endpoint,{method:"DELETE",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({deviceId:selected.id,reason:reason.trim()})});
      if(!mounted.current)return;
      if(isAdminStepUpResponse(response)){setStepUp(true);return;}
      const result=await response.json() as {error?:string};
      if(!mounted.current)return;
      if(!response.ok)throw new Error(result.error||"تعذر إلغاء اعتماد الجهاز");
      setSelected(null);setReason("");setNotice("أُلغي اعتماد الجهاز وجلساته. أصبح بالإمكان تسجيل جهاز بديل واحد.");
      await load();if(mounted.current)await onChanged?.();
    }catch(caught){if(mounted.current)setError(caught instanceof Error?caught.message:"تعذر إلغاء اعتماد الجهاز");}finally{if(mounted.current)setBusy(false);}
  };
  return <section className={styles.panel} aria-label="الأجهزة المعتمدة للطالب"><header><span><ShieldCheck size={21}/><strong>الجهازان المعتمدان للحساب</strong></span><button type="button" className="button button-soft" disabled={busy} onClick={()=>void load()} aria-label="تحديث الأجهزة المعتمدة"><RefreshCw size={16}/></button></header><p>يبقى الاعتماد بعد تسجيل الخروج. الاستبدال إجراء إداري موثّق للحالات المبررة، ويسجّل خروج الجهاز الملغى ويمنعه من العودة.</p>
    {error&&<p className="form-error" role="alert">{error}</p>}{notice&&<p className={styles.notice} role="status">{notice}</p>}
    {devices===null?<p role="status">جارٍ تحميل الأجهزة…</p>:<><small>{devices.filter(device=>!device.revokedAt).length} من جهازين معتمدين</small><div className={styles.list}>{devices.map(device=><article key={device.id}><i>{device.platform==="mobile"?<Smartphone size={19}/>:<Laptop size={19}/>}</i><div><strong>{device.deviceLabel}</strong><small>أول تسجيل: {date(device.firstSeenAt)}</small><small>آخر استخدام: {date(device.lastSeenAt)}</small>{device.revokedAt&&<small>أُلغي الاعتماد: {date(device.revokedAt)} · {device.revocationReason}</small>}</div><button type="button" className="button button-soft" disabled={busy||Boolean(device.revokedAt)} onClick={()=>{setSelected(device);setReason("");setError("");setStepUp(false);}}>{device.revokedAt?"ملغى":"استبدال الجهاز"}</button></article>)}</div>{devices.length===0&&<p>لم يسجّل الطالب جهازًا بعد.</p>}</>}
    {selected&&<form className={styles.confirm} onSubmit={replace}><strong>إلغاء اعتماد {selected.deviceLabel}</strong><p>سيتم إنهاء جلساته وإتاحة مكان لجهاز بديل. تأكد من طلب الطالب وهويته قبل تنفيذ الاستبدال.</p><label>سبب الاستبدال<textarea disabled={busy} required minLength={4} maxLength={500} value={reason} onChange={event=>setReason(event.target.value)} placeholder="مثال: فقدان الجهاز والتحقق من صاحب الحساب"/></label>{stepUp&&<AdminMfaNotice/>}<div><button type="submit" className="button button-primary" disabled={busy||reason.trim().length<4}>{busy?"جارٍ التنفيذ…":"تأكيد الاستبدال"}</button><button type="button" className="button button-soft" disabled={busy} onClick={()=>setSelected(null)}>إلغاء</button></div></form>}
  </section>;
}
