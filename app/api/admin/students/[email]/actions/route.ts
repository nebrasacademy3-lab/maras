import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { adminOperations, aiEntitlements, auditLogs, authSessions, cartItems, courseAccess, courseAccessEvents, courseRequests, courseWaitlist, favorites, learningTrackInterests, notificationsDb, pushDevices, supportReplies, supportTickets, users } from "@/db/schema";
import { adminControlGuard } from "@/lib/admin-control-guard";
import { isUniqueConstraintError, jsonError } from "@/lib/api";
import { clientIp, validEmail } from "@/lib/auth";
import { validAcademicLevel } from "@/lib/academic-levels";
import { getCourseCatalog, getInstitutionsCatalog, getProgramsCatalog, invalidateCatalogCache } from "@/lib/catalog-store";
import { canonicalControlJson, parseStudentControl, StudentControlError } from "@/lib/student-control-contract";
import { readBoundedJsonObject, RequestBodyTooLargeError } from "@/lib/request-body";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
const safeStudent = { id:users.id, email:users.email, role:users.role, status:users.status, fullName:users.fullName, phone:users.phone, phoneVerifiedAt:users.phoneVerifiedAt, universitySlug:users.universitySlug, specialty:users.specialty, academicLevel:users.academicLevel, updatedAt:users.updatedAt };
export async function POST(request: Request, { params }: {params:Promise<{email:string}>}) {
 const guarded = await adminControlGuard(request,true);
 if (guarded.response) return guarded.response;
 if (!guarded.user) return jsonError("غير مصرح",403);
 const actor = guarded.user;
 const email = (await params).email.trim().toLowerCase(); // Next has already decoded route parameters.
 if (!validEmail(email)) return jsonError("البريد غير صالح");
 try {
  const control = parseStudentControl(await readBoundedJsonObject(request,24*1024));
  const f = control.fields;
  const operationId = `${actor.id}:${control.operationKey}`;
  const requestHash = createHash("sha256").update(canonicalControlJson({ email, action:control.action, reason:control.reason, fields:f })).digest("hex");
  const [prior] = await getDb().select().from(adminOperations).where(eq(adminOperations.operationId, operationId)).limit(1);
  if (prior) {
    if (prior.requestHash !== requestHash || prior.actorUserId !== actor.id) throw new StudentControlError("استُخدم معرّف العملية لطلب مختلف",409,"IDEMPOTENCY_CONFLICT");
    return Response.json({...JSON.parse(prior.resultJson), replayed:true}, {headers});
  }
  const course = f.courseSlug ? await getCourseCatalog(String(f.courseSlug),true) : null;
  if (["course.grant","request.status"].includes(control.action) && f.courseSlug && !course) throw new StudentControlError("المادة غير موجودة",404);
  if (control.action === "request.status" && f.status === "available" && (!course || !course.availableForPurchase)) throw new StudentControlError("اختر مادة منشورة ومتاحة للاشتراك قبل إعلان جاهزية الطلب",409);
  if (control.action === "profile.update") {
    if (f.academicLevel && !validAcademicLevel(f.academicLevel)) throw new StudentControlError("المستوى غير صالح");
    if (f.universitySlug && !(await getInstitutionsCatalog(true)).some(x=>x.slug===f.universitySlug)) throw new StudentControlError("الجامعة غير موجودة");
    if (f.specialty && (!f.universitySlug || !(await getProgramsCatalog(String(f.universitySlug))).programs.some(x=>x.name===f.specialty))) throw new StudentControlError("التخصص يجب أن يطابق أحد تخصصات الجامعة المحددة");
  }

  const result = await getDb().transaction(async tx => {
    // One operation key cannot concurrently execute on two different students.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${operationId}, 2901))`);
    const [cached] = await tx.select().from(adminOperations).where(eq(adminOperations.operationId,operationId)).limit(1);
    if (cached) {
      if (cached.requestHash !== requestHash || cached.actorUserId !== actor.id) throw new StudentControlError("استُخدم معرّف العملية لطلب مختلف",409,"IDEMPOTENCY_CONFLICT");
      return {...JSON.parse(cached.resultJson) as {ok:boolean;message:string}, replayed:true};
    }
    const [student] = await tx.select(safeStudent).from(users).where(eq(users.email,email)).limit(1).for("update");
    if (!student || student.role !== "student") throw new StudentControlError("حساب الطالب غير موجود",404);
    const id = Number(f.id);
    const now = new Date().toISOString();
    const expiresAt = () => new Date(Date.now() + Number(f.days)*86_400_000).toISOString();
    let before: unknown = null, after: unknown = null;
    const missing = () => new StudentControlError("السجل غير موجود ضمن ملف هذا الطالب",404,"RECORD_NOT_OWNED");
    const notify = async (title:string, body:string, actionUrl:string|null=null, push=true) => {
      await tx.insert(notificationsDb).values({userEmail:email,audience:"student",title,body,actionUrl,actionLabel:actionUrl?"عرض التفاصيل":null,presentation:"inbox",template:"admin_student",dedupeKey:`student-control:${operationId}`,pushEnabled:push,pushStatus:push?"pending":"disabled",createdAt:now}).onConflictDoNothing({target:notificationsDb.dedupeKey});
    };
    switch(control.action) {
      case "profile.update": {
        if (f.expectedUpdatedAt !== student.updatedAt) throw new StudentControlError("عُدل الملف من جلسة أخرى. حدّث البيانات أولًا",409,"STALE_RECORD");
        before=student;
        const value = {fullName:String(f.fullName),phone:String(f.phone)||null,phoneVerifiedAt:(String(f.phone)||null)===student.phone?student.phoneVerifiedAt:null,universitySlug:String(f.universitySlug)||null,specialty:String(f.specialty)||null,academicLevel:String(f.academicLevel)||null,updatedAt:now};
        await tx.update(users).set(value).where(eq(users.id,student.id)); after=value;
        break;
      }
      case "account.status": {
        before={status:student.status}; after={status:f.status};
        await tx.update(users).set({status:String(f.status),updatedAt:now}).where(eq(users.id,student.id));
        if(f.status==="suspended") {await tx.update(authSessions).set({revokedAt:now}).where(and(eq(authSessions.userId,student.id),isNull(authSessions.revokedAt)));await tx.update(pushDevices).set({status:"revoked"}).where(eq(pushDevices.userId,student.id));}
        break;
      }
      case "course.grant": {
        if(student.status!=="active") throw new StudentControlError("فعّل حساب الطالب قبل منحه مادة",409);
        const [granted] = await tx.insert(courseAccess).values({userEmail:email,courseSlug:String(f.courseSlug),source:"admin",startsAt:now,expiresAt:expiresAt(),updatedAt:now}).onConflictDoNothing({target:[courseAccess.userEmail,courseAccess.courseSlug]}).returning();
        if(!granted) throw new StudentControlError("يوجد سجل وصول لهذه المادة؛ استخدم إدارة الاشتراك بدل إنشاء منحة بديلة",409);
        after=granted;
        await tx.insert(courseAccessEvents).values({eventKey:`student-control:${operationId}`,accessId:granted.id,userEmail:email,courseSlug:granted.courseSlug,action:"grant",actorEmail:actor.email,reason:control.reason,afterJson:JSON.stringify(granted),createdAt:now});
        await tx.update(courseWaitlist).set({status:"converted",convertedAt:now,updatedAt:now}).where(and(eq(courseWaitlist.userEmail,email),eq(courseWaitlist.courseSlug,granted.courseSlug),inArray(courseWaitlist.status,["active","notified"])));
        await notify("أُضيفت مادة إلى حسابك",`أضيفت مادة ${course?.title || granted.courseSlug} إلى موادك.`,`/courses/${encodeURIComponent(granted.courseSlug)}`);
        break;
      }
      case "course.access": {
        const [row]=await tx.select().from(courseAccess).where(and(eq(courseAccess.id,id),eq(courseAccess.userEmail,email))).limit(1).for("update");
        if(!row)throw missing(); if(row.revokedAt)throw new StudentControlError("الاشتراك ملغى. لا تعِد تفعيله من مسار التعديل العادي",409);
        const change: Partial<typeof courseAccess.$inferInsert>={updatedAt:now};
        if(f.operation==="pause"){change.suspendedAt=now;change.suspensionReason=control.reason;}
        if(f.operation==="resume"){change.suspendedAt=null;change.suspensionReason=null;}
        if(f.operation==="revoke"){change.revokedAt=now;change.revocationReason=control.reason;}
        if(f.operation==="extend"){
          if(!row.expiresAt)throw new StudentControlError("هذا الوصول لا يملك تاريخ انتهاء؛ لا يحتاج إلى تمديد",409);
          const date=Date.parse(row.expiresAt); if(!Number.isFinite(date))throw new StudentControlError("تاريخ انتهاء السجل غير صالح",409);
          change.expiresAt=new Date(Math.max(Date.now(),date)+Number(f.days)*86_400_000).toISOString();
        }
        before=row;after={...row,...change};
        await tx.update(courseAccess).set(change).where(and(eq(courseAccess.id,id),eq(courseAccess.userEmail,email)));
        await tx.insert(courseAccessEvents).values({eventKey:`student-control:${operationId}`,accessId:id,userEmail:email,courseSlug:row.courseSlug,action:String(f.operation),actorEmail:actor.email,reason:control.reason,orderNumber:row.orderNumber,beforeJson:JSON.stringify(before),afterJson:JSON.stringify(after),createdAt:now});
        await notify("تحديث اشتراك مادة","حدّثت الإدارة حالة وصول إحدى موادك. راجع تفاصيل الاشتراك أو تواصل مع الدعم.",`/courses/${encodeURIComponent(row.courseSlug)}`);
        break;
      }
      case "ai.grant": {
        if(student.status!=="active")throw new StudentControlError("حساب الطالب موقوف",409);
        const [row]=await tx.insert(aiEntitlements).values({userId:student.id,source:"gift",externalRef:`admin-control:${operationId}`,status:"active",startsAt:now,expiresAt:expiresAt(),createdBy:actor.email,createdAt:now,updatedAt:now}).returning();
        after=row; await notify("هدية أدوات مراس",`أضيف استحقاق أدوات مراس لمدة ${f.days} يومًا إلى حسابك.`,"/study-tools"); break;
      }
      case "ai.status": {
        const [row]=await tx.select().from(aiEntitlements).where(and(eq(aiEntitlements.id,id),eq(aiEntitlements.userId,student.id))).limit(1).for("update");if(!row)throw missing();
        if(f.status==="active"&&row.expiresAt&&(!Number.isFinite(Date.parse(row.expiresAt))||Date.parse(row.expiresAt)<=Date.now()))throw new StudentControlError("الاستحقاق منتهٍ؛ التفعيل لا يغير مدته. استخدم منحة مستقلة عند الحاجة",409);
        before=row;after={status:f.status};await tx.update(aiEntitlements).set({status:String(f.status),updatedAt:now}).where(and(eq(aiEntitlements.id,id),eq(aiEntitlements.userId,student.id)));break;
      }
      case "waitlist.cancel": {
        const [row]=await tx.select().from(courseWaitlist).where(and(eq(courseWaitlist.id,id),eq(courseWaitlist.userEmail,email))).limit(1).for("update");if(!row)throw missing();
        if(!["active","notified"].includes(row.status))throw new StudentControlError("الانتظار ملغى أو تحوّل إلى اشتراك بالفعل",409);
        before=row;after={status:"cancelled"};await tx.update(courseWaitlist).set({status:"cancelled",updatedAt:now}).where(and(eq(courseWaitlist.id,id),eq(courseWaitlist.userEmail,email)));
        await tx.update(notificationsDb).set({pushEnabled:false,pushStatus:"cancelled",expiresAt:now}).where(and(eq(notificationsDb.userEmail,email),eq(notificationsDb.dedupeKey,`waitlist:${row.id}:v${row.activationVersion}:launched`),inArray(notificationsDb.pushStatus,["pending","failed"])));break;
      }
      case "track.cancel": {const [row]=await tx.select().from(learningTrackInterests).where(and(eq(learningTrackInterests.id,id),eq(learningTrackInterests.userId,student.id))).limit(1).for("update");if(!row)throw missing();before=row;after={status:"cancelled"};await tx.update(learningTrackInterests).set({status:"cancelled",updatedAt:now}).where(and(eq(learningTrackInterests.id,id),eq(learningTrackInterests.userId,student.id)));break;}
      case "favorite.remove": {const [row]=await tx.delete(favorites).where(and(eq(favorites.id,id),eq(favorites.userEmail,email))).returning();if(!row)throw missing();before=row;after={removed:true};break;}
      case "cart.remove": {const [row]=await tx.delete(cartItems).where(and(eq(cartItems.id,id),eq(cartItems.userEmail,email))).returning();if(!row)throw missing();before=row;after={removed:true};break;}
      case "support.reply": case "support.status": {
        const [ticket]=await tx.select().from(supportTickets).where(and(eq(supportTickets.id,id),eq(supportTickets.userEmail,email))).limit(1).for("update");if(!ticket)throw missing();before={id:ticket.id,status:ticket.status};
        if(control.action==="support.reply") {
          const internal=f.visibility==="internal";
          const [reply]=await tx.insert(supportReplies).values({ticketId:id,authorEmail:actor.email,authorRole:"admin",body:String(f.body),internal,createdAt:now}).returning({id:supportReplies.id});
          await tx.update(supportTickets).set({updatedAt:now,...(!internal?{firstResponseAt:ticket.firstResponseAt||now,status:"waiting",resolvedAt:null}:{})}).where(and(eq(supportTickets.id,id),eq(supportTickets.userEmail,email)));
          after={replyId:reply.id,internal};if(!internal)await notify("رد جديد من دعم مراس",`وصل رد على تذكرتك ${ticket.ticketNumber}.`,"/support");
        } else { after={status:f.status};await tx.update(supportTickets).set({status:String(f.status),resolvedAt:["resolved","closed"].includes(String(f.status))?now:null,updatedAt:now}).where(and(eq(supportTickets.id,id),eq(supportTickets.userEmail,email))); }
        break;
      }
      case "request.status": {
        const [row]=await tx.select().from(courseRequests).where(and(eq(courseRequests.id,id),eq(courseRequests.userId,student.id))).limit(1).for("update");if(!row)throw missing();before=row;after={status:f.status,preparedCourseSlug:course?.slug||row.preparedCourseSlug};
        await tx.update(courseRequests).set({status:String(f.status),preparedCourseSlug:course?.slug||row.preparedCourseSlug,updatedAt:now}).where(and(eq(courseRequests.id,id),eq(courseRequests.userId,student.id)));
        if(f.status==="available"&&row.notify&&course&& (row.status!=="available"||row.preparedCourseSlug!==course.slug))await notify("المادة التي طلبتها أصبحت متاحة",`يمكنك الآن الاطلاع على مادة ${course.title}.`,`/courses/${encodeURIComponent(course.slug)}`);break;
      }
      case "notification.send": {await notify(String(f.title),String(f.body),String(f.actionUrl)||null,f.channel==="push");after={title:f.title,channel:f.channel,actionUrl:f.actionUrl};break;}
      case "notification.cancel": case "notification.retry": {
        const [row]=await tx.select({id:notificationsDb.id,pushStatus:notificationsDb.pushStatus,pushEnabled:notificationsDb.pushEnabled,expiresAt:notificationsDb.expiresAt}).from(notificationsDb).where(and(eq(notificationsDb.id,id),eq(notificationsDb.userEmail,email))).limit(1).for("update");if(!row)throw missing();before=row;
        if(control.action==="notification.cancel") {if(!["pending","failed","disabled"].includes(row.pushStatus||"disabled"))throw new StudentControlError("الإشعار قيد الإرسال أو أُرسل بالفعل ولا يمكن سحبه",409);after={pushStatus:"cancelled"};await tx.update(notificationsDb).set({pushEnabled:false,pushStatus:"cancelled",expiresAt:now}).where(and(eq(notificationsDb.id,id),eq(notificationsDb.userEmail,email)));}
        else {if(row.pushStatus!=="failed"||!row.pushEnabled||(row.expiresAt&&Date.parse(row.expiresAt)<=Date.now()))throw new StudentControlError("تعاد فقط إشعارات Push الفاشلة وغير المنتهية",409);after={pushStatus:"pending"};await tx.update(notificationsDb).set({pushStatus:"pending",pushAttempts:0,pushClaimedAt:null,pushLastError:null}).where(and(eq(notificationsDb.id,id),eq(notificationsDb.userEmail,email)));}break;
      }
      case "session.revoke": case "session.revokeAll": {
        const filter=and(eq(authSessions.userId,student.id),isNull(authSessions.revokedAt),control.action==="session.revoke"?eq(authSessions.id,id):undefined);
        const rows=await tx.update(authSessions).set({revokedAt:now}).where(filter).returning({id:authSessions.id,deviceId:authSessions.deviceId});
        if(control.action==="session.revoke"&&!rows.length)throw missing();
        const deviceIds=rows.map(x=>x.deviceId).filter((value):value is string=>Boolean(value));
        if(control.action==="session.revokeAll") await tx.update(pushDevices).set({status:"revoked"}).where(eq(pushDevices.userId,student.id));
        else if(deviceIds.length) await tx.update(pushDevices).set({status:"revoked"}).where(and(eq(pushDevices.userId,student.id),inArray(pushDevices.deviceId,deviceIds)));
        after={revokedSessionIds:rows.map(x=>x.id)};break;
      }
      case "push.disable": {const rows=await tx.update(pushDevices).set({status:"revoked"}).where(and(eq(pushDevices.id,id),eq(pushDevices.userId,student.id))).returning({id:pushDevices.id,status:pushDevices.status,platform:pushDevices.platform});if(!rows.length)throw missing();after=rows[0];break;}
      default: throw new StudentControlError("الإجراء غير مدعوم");
    }
    await tx.insert(auditLogs).values({actorEmail:actor.email,action:control.action,entityType:"student_control",entityId:String(student.id),beforeJson:before==null?null:JSON.stringify(before),afterJson:JSON.stringify({studentEmail:email,recordId:Number.isFinite(id)?id:null,reason:control.reason,operationId,result:after}),ipAddress:clientIp(request),createdAt:now});
    const response={ok:true,message:"حُفظ الإجراء وسجل التدقيق. الإشعارات المفعّلة تُرسل من الطابور تلقائيًا.",action:control.action,operationId,replayed:false};
    await tx.insert(adminOperations).values({operationId,actorUserId:actor.id,studentUserId:student.id,action:control.action,requestHash,resultJson:JSON.stringify(response),createdAt:now});return response;
  });
  if(control.action.startsWith("course.")||control.action==="waitlist.cancel")invalidateCatalogCache();
  return Response.json(result,{headers});
 } catch(error) {
  if(error instanceof StudentControlError)return jsonError(error.message,error.status,error.code);
  if(error instanceof RequestBodyTooLargeError)return jsonError("حجم الطلب أكبر من المسموح",413);
  if(error instanceof SyntaxError || error instanceof TypeError)return jsonError("بيانات الطلب غير صالحة",400);
  if(isUniqueConstraintError(error))return jsonError("تعارض في السجل؛ قد يكون رقم الجوال مرتبطًا بحساب آخر",409,"RECORD_CONFLICT");
  return jsonError("تعذر تنفيذ الإجراء. تحقق من اتصال قاعدة البيانات وتطبيق التحديث 0029.",503);
 }
}
