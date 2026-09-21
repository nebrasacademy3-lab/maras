import { and, eq, ne } from "drizzle-orm";
import { getDb, getPool } from "@/db";
import { instructorContracts } from "@/db/instructor-schema";
import { auditLogs } from "@/db/schema";
import { contractView } from "@/lib/instructor-contracts";
import { instructorActor, instructorOwner, InstructorError } from "@/lib/instructor-security";
import { checkRateLimit, clientIp } from "@/lib/auth";
import { renderInstructorContractPdf } from "@/lib/study-pdf-process";
import { StudyPdfError } from "@/lib/study-pdf-document.mjs";
import { instructorApiError, INSTRUCTOR_PRIVATE_HEADERS } from "@/lib/instructor-onboarding";
import type { InstructorContractPdfInput } from "@/lib/instructor-contract-document.mjs";

export async function downloadInstructorContract(request: Request, id: number, admin: boolean) {
 try {
  if (!Number.isSafeInteger(id) || id < 1) throw new InstructorError("العقد غير موجود",404);
  const actor = admin ? await instructorOwner(request,true) : await instructorActor(request);
  if (!await checkRateLimit("instructor-contract-pdf",String(actor.id),6,60)) throw new InstructorError("انتظر قليلاً قبل تنزيل نسخة أخرى",429);
  const read = async () => {
   const [row] = await getDb().select().from(instructorContracts).where(and(eq(instructorContracts.id,id),admin ? undefined : and(eq(instructorContracts.userId,actor.id),ne(instructorContracts.status,"draft")))).limit(1);
   if (!row) throw new InstructorError("العقد غير موجود",404);
   return row;
  };
  const row = await read(), c = contractView(row);
  const organization = Object.fromEntries(["legal_name","legal_address","commercial_registration_number","vat_number","employment_authorization_number"].map(key=>[key,String(c.organization[key]||"")])) as InstructorContractPdfInput["organization"];
  const input: InstructorContractPdfInput = { id:c.id,version:c.version,status:c.status,title:c.title,termsAr:c.termsAr,termsEn:c.termsEn,compensationModel:c.compensationModel,rateHalalas:c.rateHalalas,trialDays:c.trialDays,trialTermsAr:c.trialTermsAr,trialTermsEn:c.trialTermsEn,contentHash:c.contentHash||"",signedAt:c.signedAt||"",instructor:c.instructor,organization,employment:c.employment,signature:c.signature };
  // Shared database slots bound expensive browser processes across all replicas.
  const connection=await getPool().connect();let slot:number|null=null;let pdf:Buffer;
  try{
   for(const candidate of [5819021,5819022]) { const result=await connection.query<{locked:boolean}>("SELECT pg_try_advisory_lock($1) AS locked",[candidate]);if(result.rows[0]?.locked){slot=candidate;break;} }
   if(slot===null)throw new InstructorError("تجهيز العقود مشغول الآن؛ أعد المحاولة بعد قليل",503,"CONTRACT_PDF_BUSY");
   pdf=await renderInstructorContractPdf(input,request.signal);
  }finally{
   let destroy=false;
   if(slot!==null){try{await connection.query("SELECT pg_advisory_unlock($1)",[slot]);}catch{destroy=true;}}
   connection.release(destroy);
  }
  const currentActor=admin?await instructorOwner(request,true):await instructorActor(request);
  if(currentActor.id!==actor.id)throw new InstructorError("تغيرت الجلسة؛ أعد فتح العقد",403);
  const current=await read();
  if(current.revision!==row.revision)throw new InstructorError("تغير العقد أثناء التصدير؛ افتحه مجدداً",409);
  await getDb().insert(auditLogs).values({actorEmail:actor.email,action:"instructor.contract.downloaded",entityType:"instructor_contract",entityId:String(id),afterJson:JSON.stringify({version:row.version,status:row.status}),ipAddress:clientIp(request)});
  return new Response(new Uint8Array(pdf),{headers:{...INSTRUCTOR_PRIVATE_HEADERS,"content-type":"application/pdf","content-length":String(pdf.length),"content-disposition":`attachment; filename="maras-employment-${id}-v${row.version}.pdf"`}});
 }catch(error){
  if(error instanceof StudyPdfError)return Response.json({ok:false,error:"تعذر تجهيز نسخة PDF الآن. العقد محفوظ؛ حاول التنزيل لاحقاً.",code:error.code},{status:503,headers:INSTRUCTOR_PRIVATE_HEADERS});
  return instructorApiError(error);
 }
}
