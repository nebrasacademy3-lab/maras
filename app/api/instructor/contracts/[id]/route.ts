import { checkRateLimit } from "@/lib/auth";
import { instructorActor, InstructorError } from "@/lib/instructor-security";
import { listInstructorContracts, signInstructorContract } from "@/lib/instructor-contracts";
import { instructorApiError, instructorWriteRequest, INSTRUCTOR_PRIVATE_HEADERS } from "@/lib/instructor-onboarding";
import { readBoundedJsonObject } from "@/lib/request-body";
import { jsonError } from "@/lib/api";
export const dynamic = "force-dynamic";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context) {
 try { const user=await instructorActor(request);const id=Number((await context.params).id);
  if(!Number.isSafeInteger(id)||id<1) throw new InstructorError("العقد غير موجود",404);
  if(!await checkRateLimit("instructor-contract-read",String(user.id),60,60))return jsonError("طلبات كثيرة",429);
  const contract=(await listInstructorContracts(user.id,false)).find(row=>row.id===id);if(!contract)throw new InstructorError("العقد غير موجود",404);
  return Response.json({ok:true,contract},{headers:INSTRUCTOR_PRIVATE_HEADERS});
 }catch(error){return instructorApiError(error);}
}
export async function POST(request:Request,context:Context) {
 try { instructorWriteRequest(request);
  const user=await instructorActor(request),id=Number((await context.params).id);
  if(!Number.isSafeInteger(id)||id<1)throw new InstructorError("العقد غير موجود",404);
  if(!await checkRateLimit("instructor-contract-sign",String(user.id),5,900))return jsonError("محاولات كثيرة؛ حاول بعد 15 دقيقة",429);
  const body=await readBoundedJsonObject(request,192*1024);
  return Response.json({ok:true,contract:await signInstructorContract(user,request,id,body)},{headers:INSTRUCTOR_PRIVATE_HEADERS});
 }catch(error){return instructorApiError(error);}
}
