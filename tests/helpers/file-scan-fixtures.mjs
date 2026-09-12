import { randomUUID } from "node:crypto";
import { isolatedSource } from "./isolated-source.mjs";
export const queueModule=await isolatedSource("lib/file-scan-queue.ts",{ randomUUID, getPool:()=>{throw new Error("unexpected production database");}, scanStoredFile:()=>{throw new Error("unexpected production scanner");}, scannerConfig:()=>({mode:"clamd"}) });
export const initialScanRow=(extra={})=>({ id:1, object_key:"requests/test/file.pdf", original_name:"test.pdf", content_type:"application/pdf", storage_provider:"local", scan_status:"pending", scan_attempts:0, scan_next_attempt_at:null, scan_lease_token:null, scan_lease_until:null, scan_error:null, scan_provider:null, scanned_at:null, quarantine_reason:null, ...extra });
export function scanDatabase(input={request:[initialScanRow()]}) {
 const state=Object.fromEntries(Object.entries(queueModule.FILE_SCAN_TABLES).map(([kind,name])=>[name,structuredClone(input[kind]||[])]));
 const calls=[];
 const query=async(text,values=[])=>{
  calls.push({text,values});
  const table=Object.keys(state).find(name=>new RegExp(`\\b${name}\\b`).test(text));
  if(!table)throw new Error("unrecognized scan table");
  const rows=state[table]; const item=rows.find(row=>row.id===values[0]);
  const result=rows=>({rows:structuredClone(rows)});
  if(text.includes("scan:read"))return result(item?[item]:[]);
  if(text.includes("scan:claim")){
   if(!item||item.scan_status!=="pending"||(item.scan_next_attempt_at&&item.scan_next_attempt_at>values[3])||(item.scan_lease_until&&item.scan_lease_until>values[3]))return result([]);
   Object.assign(item,{scan_lease_token:values[1],scan_lease_until:values[2],scan_attempts:item.scan_attempts+1});return result([item]);
  }
  if(text.includes("scan:complete")){
   if(!item||item.scan_lease_token!==values[1]||item.object_key!==values[2]||item.scan_status!=="pending")return result([]);
   Object.assign(item,{scan_status:values[3],scan_provider:values[4],scanned_at:values[5],scan_error:values[6],quarantine_reason:values[7],scan_next_attempt_at:values[8],scan_lease_token:null,scan_lease_until:null});
   if(table==="ai_files")item.status=item.scan_status==="clean"?"ready":item.scan_status==="quarantined"?"quarantined":"pending_scan";
   if(table==="course_resources"&&item.scan_status!=="clean"){item.student_visible=false;if(item.scan_status==="quarantined")item.status="archived";}
   return result([item]);
  }
  if(text.includes("scan:due"))return result(rows.filter(row=>row.scan_status==="pending"&&(!row.scan_next_attempt_at||row.scan_next_attempt_at<=values[0])&&(!row.scan_lease_until||row.scan_lease_until<=values[0])).sort((a,b)=>(a.scan_next_attempt_at||"").localeCompare(b.scan_next_attempt_at||"")||a.id-b.id).slice(0,values[1]).map(row=>({id:row.id})));
  if(text.includes("scan:wake")){for(const row of rows)if(row.scan_status==="pending"&&(!row.scan_lease_until||row.scan_lease_until<=values[0]))row.scan_next_attempt_at=null;return result([]);}
  throw new Error("unexpected SQL command");
 };
 return {state,calls,query};
}
