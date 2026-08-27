import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { courseRequestFiles, courseRequests, notificationsDb, supervisorAssignments, users } from "@/db/schema";
import { getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { cleanText, isAdminRequest, jsonError } from "@/lib/api";
import { getInstitutionCatalog } from "@/lib/catalog-store";
import { sendPushNotification } from "@/lib/push";
import { putObject } from "@/lib/storage";

const allowedTypes=new Set(["application/pdf","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","image/png","image/jpeg"]);

async function supervisorFor(institutionSlug:string,specialty:string){
  const db=getDb();
  const assignments=await db.select().from(supervisorAssignments).where(eq(supervisorAssignments.active,true));
  const match=assignments.find((item)=>(!item.institutionSlug||item.institutionSlug===institutionSlug)&&(!item.specialty||item.specialty===specialty));
  if(match)return match.supervisorId;
  const [staff]=await db.select({id:users.id}).from(users).where(inArray(users.role,["supervisor","admin"])).limit(1);
  return staff?.id||null;
}

export async function POST(request:Request){
  if(!sameOriginRequest(request))return jsonError("تعذر التحقق من مصدر الطلب",403);
  const user=await getSessionUser(request);if(!user)return jsonError("سجّل الدخول لطلب مادة",401);if(!user.profileCompleted||!user.phone||!user.universitySlug||!user.specialty)return jsonError("أكمل ملفك الدراسي أولًا",409);
  let form:FormData;try{form=await request.formData();}catch{return jsonError("بيانات الطلب غير صالحة");}
  const courseName=cleanText(form.get("courseName"),160);const courseCode=cleanText(form.get("courseCode"),40);const notes=cleanText(form.get("notes"),1500);if(courseName.length<3)return jsonError("أدخل اسم المادة بصورة صحيحة");
  const files=form.getAll("files").filter((item):item is File=>item instanceof File&&item.size>0);if(files.length>5)return jsonError("الحد الأقصى 5 ملفات",413);for(const file of files){if(file.size>15*1024*1024)return jsonError(`الملف ${file.name} أكبر من 15 ميجابايت`,413);if(!allowedTypes.has(file.type))return jsonError(`نوع الملف ${file.name} غير مدعوم`,413);}
  const institution=await getInstitutionCatalog(user.universitySlug);if(!institution)return jsonError("تعذر مطابقة الجامعة");const db=getDb();const assignedSupervisorId=await supervisorFor(user.universitySlug,user.specialty);const now=new Date().toISOString();
  const [row]=await db.insert(courseRequests).values({userId:user.id,university:institution.name,universitySlug:user.universitySlug,specialty:user.specialty,courseName:courseCode?`${courseName} (${courseCode})`:courseName,name:user.fullName,phone:user.phone,notes,notify:form.get("notify")!==null,status:assignedSupervisorId?"assigned":"new",assignedSupervisorId,attachmentsCount:0,createdAt:now,updatedAt:now}).returning({id:courseRequests.id,status:courseRequests.status});
  if(files.length){for(const file of files){const safe=file.name.replace(/[^a-zA-Z0-9._-]+/g,"-").slice(-120)||"attachment";const objectKey=`course-requests/${user.id}/${row.id}/${crypto.randomUUID()}-${safe}`;await putObject(objectKey,file.stream(),file.type);await db.insert(courseRequestFiles).values({requestId:row.id,userId:user.id,objectKey,originalName:file.name.slice(0,180),contentType:file.type,sizeBytes:file.size});}await db.update(courseRequests).set({attachmentsCount:files.length,updatedAt:new Date().toISOString()}).where(eq(courseRequests.id,row.id));}
  const studentTitle="تم استلام طلب المادة";const studentBody=`استلمنا طلب «${courseName}»${files.length?` مع ${files.length} مرفقات`:""}.`;await db.insert(notificationsDb).values({userEmail:user.email,audience:"student",title:studentTitle,body:studentBody,actionUrl:"/dashboard?view=requests"});await sendPushNotification({userEmail:user.email},studentTitle,studentBody,{route:"/requests"});
  if(assignedSupervisorId){const [supervisor]=await db.select({email:users.email}).from(users).where(eq(users.id,assignedSupervisorId)).limit(1);if(supervisor){const title="طلب مادة جديد";const body=`${institution.name} · ${user.specialty} · ${courseName}`;await db.insert(notificationsDb).values({userEmail:supervisor.email,audience:"supervisor",title,body,actionUrl:"/supervisor?view=requests"});await sendPushNotification({userEmail:supervisor.email},title,body,{route:"/supervisor"});}}
  return Response.json({ok:true,request:{...row,attachmentsCount:files.length}},{status:201});
}

export async function GET(request:Request){const user=await getSessionUser(request);if(!isAdminRequest(request)&&!roleAllowed(user,["admin","supervisor"]))return jsonError("غير مصرح",401);const rows=await getDb().select().from(courseRequests).orderBy(desc(courseRequests.createdAt)).limit(100);return Response.json({ok:true,requests:rows},{headers:{"cache-control":"no-store"}});}
