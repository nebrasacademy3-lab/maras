import { checkRateLimit, sameOriginRequest } from "@/lib/auth";
import { instructorOwner, InstructorError } from "@/lib/instructor-security";
import { listInstructorContracts, mutateInstructorContract } from "@/lib/instructor-contracts";
import { instructorApiError, INSTRUCTOR_PRIVATE_HEADERS } from "@/lib/instructor-onboarding";
import { INSTRUCTOR_CONTRACT_TEMPLATE } from "@/lib/instructor-contract-template";
import { readBoundedJsonObject } from "@/lib/request-body";
import { jsonError } from "@/lib/api";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 try{const owner=await instructorOwner(request,true);const userId=Number(new URL(request.url).searchParams.get("userId"));
  if(!Number.isSafeInteger(userId)||userId<1)throw new InstructorError("حدد الشارح");
  if(!await checkRateLimit("instructor-admin-contract-read",String(owner.id),60,60))return jsonError("طلبات كثيرة",429);
  return Response.json({ok:true,contracts:await listInstructorContracts(userId,true),template:INSTRUCTOR_CONTRACT_TEMPLATE},{headers:INSTRUCTOR_PRIVATE_HEADERS});
 }catch(error){return instructorApiError(error);}
}
export async function POST(request:Request){
 try{if(!sameOriginRequest(request))return jsonError("تعذر التحقق من مصدر الطلب",403);const owner=await instructorOwner(request,true);
  if(!await checkRateLimit("instructor-admin-contract-write",String(owner.id),30,60))return jsonError("طلبات كثيرة",429);
  const body=await readBoundedJsonObject(request,160*1024);
  return Response.json({ok:true,contract:await mutateInstructorContract(owner,request,body)},{headers:INSTRUCTOR_PRIVATE_HEADERS});
 }catch(error){return instructorApiError(error);}
}
