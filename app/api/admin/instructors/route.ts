import { and, count, desc, eq, gt, ilike, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { users, auditLogs, authDevices, authSessions, notificationsDb, pushDevices } from "@/db/schema";
import { instructorProfiles, instructorDocuments, instructorContracts } from "@/db/instructor-schema";
import { instructorOwner, InstructorError, decryptInstructorData, instructorIdentityCollectionPolicy } from "@/lib/instructor-security";
import { instructorApiError, instructorRevision, INSTRUCTOR_PRIVATE_HEADERS } from "@/lib/instructor-onboarding";
import { checkRateLimit, clientIp, sameOriginRequest } from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";
import { readBoundedJsonObject } from "@/lib/request-body";
import { manageRegisteredDeviceTx, DeviceManagementError } from "@/lib/auth-devices";
import { parseDeviceCommand } from "@/lib/device-access-policy";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 try{const owner=await instructorOwner(request);if(!await checkRateLimit("instructor-admin-read",String(owner.id),90,60))return jsonError("طلبات كثيرة",429);
  const params=new URL(request.url).searchParams,userId=Number(params.get("userId")),db=getDb();
  if(userId){
   await instructorOwner(request,true);
   if(!Number.isSafeInteger(userId)||userId<1)throw new InstructorError("الشارح غير موجود",404);
   const [result]=await db.select({user:users,profile:instructorProfiles}).from(instructorProfiles).innerJoin(users,eq(users.id,instructorProfiles.userId)).where(eq(users.id,userId));
   if(!result)throw new InstructorError("الشارح غير موجود",404);
   const [documents,devices,sessions,contracts]=await Promise.all([
    db.select({id:instructorDocuments.id,kind:instructorDocuments.kind,originalName:instructorDocuments.originalName,contentType:instructorDocuments.contentType,sizeBytes:instructorDocuments.sizeBytes,scanStatus:instructorDocuments.scanStatus,createdAt:instructorDocuments.createdAt,expiresAt:instructorDocuments.expiresAt}).from(instructorDocuments).where(eq(instructorDocuments.userId,userId)).limit(30),
    db.select().from(authDevices).where(eq(authDevices.userId,userId)).orderBy(desc(sql`${authDevices.revokedAt} IS NULL`),desc(authDevices.lastSeenAt)).limit(30),
    db.select({id:authSessions.id,deviceLabel:authSessions.deviceLabel,platform:authSessions.platform,lastSeenAt:authSessions.lastSeenAt,revokedAt:authSessions.revokedAt,expiresAt:authSessions.expiresAt}).from(authSessions).where(and(eq(authSessions.userId,userId),isNull(authSessions.revokedAt),gt(authSessions.expiresAt,new Date().toISOString()))).orderBy(desc(authSessions.lastSeenAt)).limit(20),
    db.select({id:instructorContracts.id,status:instructorContracts.status,version:instructorContracts.version,signedAt:instructorContracts.signedAt}).from(instructorContracts).where(eq(instructorContracts.userId,userId)).orderBy(desc(instructorContracts.version)).limit(100)
   ]);
   const {addressEncrypted,bankEncrypted,...profile}=result.profile;
   return Response.json({ok:true,user:{id:result.user.id,fullName:result.user.fullName,email:result.user.email,phone:result.user.phone,status:result.user.status,emailVerified:Boolean(result.user.emailVerifiedAt)},profile:{...profile,address:addressEncrypted?decryptInstructorData(addressEncrypted,`address:${userId}`):"",bank:bankEncrypted?JSON.parse(decryptInstructorData(bankEncrypted,`bank:${userId}`)):null},documents,devices,sessions,contracts,identityCollection:await instructorIdentityCollectionPolicy()},{headers:INSTRUCTOR_PRIVATE_HEADERS});
  }
  const page=Math.min(10000,Math.max(1,Math.floor(Number(params.get("page"))||1))),q=cleanText(params.get("q"),120).replace(/[\\%_]/g,"\\$&"),status=cleanText(params.get("status"),30);
  const filter=and(q?or(ilike(users.fullName,`%${q}%`),ilike(users.email,`%${q}%`)):undefined,status?eq(instructorProfiles.status,status):undefined);
  const [rows,total]=await Promise.all([db.select({id:users.id,fullName:users.fullName,email:users.email,phone:users.phone,accountStatus:users.status,status:instructorProfiles.status,specialty:instructorProfiles.specialty,country:instructorProfiles.country,compensationModel:instructorProfiles.compensationModel,submittedAt:instructorProfiles.submittedAt,revision:instructorProfiles.revision,createdAt:instructorProfiles.createdAt}).from(instructorProfiles).innerJoin(users,eq(users.id,instructorProfiles.userId)).where(filter).orderBy(desc(instructorProfiles.createdAt)).limit(30).offset((page-1)*30),db.select({total:count()}).from(instructorProfiles).innerJoin(users,eq(users.id,instructorProfiles.userId)).where(filter)]);
  return Response.json({ok:true,instructors:rows,page,pageSize:30,total:Number(total[0]?.total||0)},{headers:INSTRUCTOR_PRIVATE_HEADERS});
 }catch(error){if(error instanceof DeviceManagementError)return jsonError(error.message,error.status,error.code);return instructorApiError(error);}
}
export async function POST(request:Request){
 try{if(!sameOriginRequest(request))return jsonError("تعذر التحقق من مصدر الطلب",403);const owner=await instructorOwner(request,true);
  if(!await checkRateLimit("instructor-admin-write",String(owner.id),30,60))return jsonError("طلبات كثيرة",429);
  const body=await readBoundedJsonObject(request,16384),userId=Number(body.userId),expectedRevision=instructorRevision(body.expectedRevision),action=cleanText(body.action,25),reason=cleanText(body.reason,1500);
  if(!Number.isSafeInteger(userId)||userId<1||!["approve","reject","request_changes","suspend","resume","device"].includes(action)||reason.length<5)throw new InstructorError("حدد الشارح والإجراء واكتب سبباً واضحاً");
  const result=await getDb().transaction(async tx=>{
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"instructor:"+userId}))`);
   await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId})`);
   const [profile]=await tx.select().from(instructorProfiles).where(eq(instructorProfiles.userId,userId)).for("update");
   const [account]=await tx.select().from(users).where(and(eq(users.id,userId),eq(users.role,"instructor"))).for("update");
   if(!profile||!account)throw new InstructorError("الشارح غير موجود",404);
   if(account.status==="deleted")throw new InstructorError("هذا الحساب محذوف ولا يمكن إعادة تفعيله أو تعديل ملفه",409);
   if(profile.revision!==expectedRevision)throw new InstructorError("تغير الملف؛ حدّث البيانات قبل الإجراء",409,"INSTRUCTOR_CONFLICT");
   const now=new Date().toISOString();let status=profile.status;
   if(action==="approve"||action==="reject"){
    if(profile.status!=="submitted")throw new InstructorError("يمكن اتخاذ قرار في الطلبات المقدمة فقط",409);
    if(action==="approve"){
     if(!account.emailVerifiedAt||account.status!=="active")throw new InstructorError("تحقق من تفعيل الحساب والبريد قبل الاعتماد");
     const docs=await tx.select().from(instructorDocuments).where(and(eq(instructorDocuments.userId,userId),eq(instructorDocuments.scanStatus,"clean")));
     const kinds=new Set(docs.filter(d=>d.expiresAt&&Date.parse(d.expiresAt)>Date.now()).map(d=>d.kind));
     if(!kinds.has("selfie")||!(kinds.has("passport")||kinds.has("identity_front")&&kinds.has("identity_back")))throw new InstructorError("تحتاج وثيقة هوية وصورة شخصية سليمتين وغير منتهيتين قبل الاعتماد");
    }
    status=action==="approve"?"approved":"rejected";
   }else if(action==="request_changes"){
    if(!["submitted","rejected"].includes(profile.status))throw new InstructorError("لا يمكن طلب استكمال بهذه الحالة",409);status="changes_requested";
   }else if(action==="suspend")status="suspended";
   else if(action==="resume"){
    if(profile.status!=="suspended")throw new InstructorError("الحساب غير موقوف",409);status="changes_requested";
   }else{
    const command=parseDeviceCommand({...body,action:body.deviceAction,expectedRevision:body.expectedDeviceRevision,reason});
    const managed=await manageRegisteredDeviceTx(tx,{...command,userId,actorEmail:owner.email,ipAddress:clientIp(request),now});
    if(!managed.found)throw new InstructorError("الجهاز غير موجود لهذا الشارح",404);
   }
   if(action==="suspend"||action==="resume"){
    await tx.update(users).set({status:action==="suspend"?"suspended":"active",updatedAt:now}).where(eq(users.id,userId));
    await tx.update(authSessions).set({revokedAt:now}).where(and(eq(authSessions.userId,userId),isNull(authSessions.revokedAt)));
    await tx.update(pushDevices).set({status:"revoked",lastSeenAt:now}).where(eq(pushDevices.userId,userId));
   }
   await tx.update(instructorProfiles).set({status,reviewNotes:action==="device"?profile.reviewNotes:reason,reviewedBy:action==="device"?profile.reviewedBy:owner.id,reviewedAt:action==="device"?profile.reviewedAt:now,revision:profile.revision+1,updatedAt:now}).where(eq(instructorProfiles.userId,userId));
   await tx.insert(auditLogs).values({actorEmail:owner.email,action:`instructor.${action}`,entityType:"instructor_profile",entityId:String(userId),beforeJson:JSON.stringify({status:profile.status,revision:profile.revision}),afterJson:JSON.stringify({status,reason,revision:profile.revision+1}),ipAddress:clientIp(request)});
   await tx.insert(notificationsDb).values({targetUserId:userId,audience:"user",title:"تحديث طلب الانضمام لفريق مراس",body:reason,actionUrl:"/instructor",actionLabel:"فتح ملف الشارح",dedupeKey:`instructor-profile:${userId}:${profile.revision+1}`}).onConflictDoNothing();
   return {revision:profile.revision+1,status};
  });
  return Response.json({ok:true,...result},{headers:INSTRUCTOR_PRIVATE_HEADERS});
 }catch(error){if(error instanceof DeviceManagementError)return jsonError(error.message,error.status,error.code);return instructorApiError(error);}
}
