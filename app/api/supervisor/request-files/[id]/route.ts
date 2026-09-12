import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { courseRequestFiles, courseRequests, supervisorAssignments } from "@/db/schema";
import { checkRateLimit, getSessionUser, roleAllowed } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { getObject } from "@/lib/storage";
import { fileStorageProvider } from "@/lib/file-security";
import { fileScanService, fileScanBlockedResponse } from "@/lib/file-scan-queue";

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getSessionUser(request);if(!roleAllowed(user,["supervisor","admin"]))return jsonError("غير مصرح",403);const id=Number((await params).id);if(!Number.isSafeInteger(id)||id<=0)return jsonError("ملف غير صالح");
  const db=getDb();const [row]=await db.select({file:courseRequestFiles,request:courseRequests}).from(courseRequestFiles).innerJoin(courseRequests,eq(courseRequestFiles.requestId,courseRequests.id)).where(eq(courseRequestFiles.id,id)).limit(1);if(!row)return jsonError("الملف غير موجود",404);if(user!.role!=="admin"){if(row.request.assignedSupervisorId&&row.request.assignedSupervisorId!==user!.id)return jsonError("غير مصرح",403);if(!row.request.assignedSupervisorId){const scopes=await db.select().from(supervisorAssignments).where(eq(supervisorAssignments.supervisorId,user!.id));const matches=scopes.some((scope)=>scope.active&&(!scope.institutionSlug||scope.institutionSlug===row.request.universitySlug)&&(!scope.specialty||scope.specialty===row.request.specialty));if(!matches)return jsonError("الطلب خارج نطاق إشرافك",403);}}
  if (!await checkRateLimit("protected-file-download", `user:${user!.id}`, 40, 60)) return jsonError("طلبات تنزيل كثيرة؛ حاول بعد دقيقة.", 429);
  const scan = await fileScanService.scanFile("request", row.file.id);
  const blocked = fileScanBlockedResponse(scan);
  if (blocked) return blocked;
  const object=await getObject(row.file.objectKey, undefined, fileStorageProvider(row.file.storageProvider));if(!object)return jsonError("الملف غير موجود في التخزين",404);const headers=new Headers();headers.set("content-type",row.file.contentType);headers.set("content-disposition",`attachment; filename*=UTF-8''${encodeURIComponent(row.file.originalName)}`);headers.set("cache-control","private, no-store");headers.set("x-content-type-options","nosniff");return new Response(object.body,{headers});
}
