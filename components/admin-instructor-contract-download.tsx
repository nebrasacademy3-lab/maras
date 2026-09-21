"use client";
import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { adminFetch } from "@/lib/admin-client";
import { ADMIN_STEP_UP_MESSAGE } from "./admin-mfa-notice";
import { InstructorAdminError } from "./admin-instructors-shared";
export function AdminInstructorContractDownload({id,version}:{id:number;version:number}){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");const active=useRef<AbortController|null>(null),urls=useRef(new Map<string,ReturnType<typeof setTimeout>>());
 useEffect(()=>{const links=urls.current;return()=>{active.current?.abort();for(const [url,timer] of links){clearTimeout(timer);URL.revokeObjectURL(url);}links.clear();};},[]);
 async function download(){if(busy)return;setBusy(true);setError("");const controller=new AbortController();active.current=controller;const timeout=setTimeout(()=>controller.abort(),65000);try{const response=await adminFetch(`/api/admin/instructors/contracts/${id}/download`,{cache:"no-store",credentials:"same-origin",signal:controller.signal});if(response.status===428)throw new Error(ADMIN_STEP_UP_MESSAGE);if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||"تعذر تنزيل العقد");}if(!response.headers.get("content-type")?.startsWith("application/pdf"))throw new Error("استجابة التنزيل ليست ملف PDF");const blob=await response.blob();if(controller.signal.aborted)return;const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`maras-employment-${id}-v${version}.pdf`;link.click();urls.current.set(url,setTimeout(()=>{URL.revokeObjectURL(url);urls.current.delete(url);},30000));}catch(e){if(active.current===controller)setError(controller.signal.aborted?"استغرق تجهيز العقد وقتًا طويلًا. أعد المحاولة.":e instanceof Error?e.message:"تعذر تنزيل العقد");}finally{clearTimeout(timeout);if(active.current===controller)setBusy(false);}}
 return <div><button type="button" className="button button-ghost" disabled={busy} onClick={()=>void download()}><Download size={16}/>{busy?"جارٍ تجهيز PDF…":"تنزيل PDF"}</button><InstructorAdminError message={error}/></div>;
}
