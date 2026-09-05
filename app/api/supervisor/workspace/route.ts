import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, catalogCourses, courseUnitsDb, lessonsDb, supervisorAssignments, videoAssets } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { getCoursesCatalog, invalidateCatalogCache } from "@/lib/catalog-store";
import { lessonId as makeLessonId } from "@/lib/catalog-templates";

async function scopeFor(request: Request) {
  const user = await getSessionUser(request);
  if (!roleAllowed(user, ["supervisor", "admin"])) return null;
  const assignments = user!.role === "admin" ? [] : await getDb().select().from(supervisorAssignments).where(and(eq(supervisorAssignments.supervisorId, user!.id), eq(supervisorAssignments.active, true)));
  return { user: user!, assignments };
}

function assigned(course: { universitySlug:string; specialty:string; audienceScope?:"specialty"|"institution" }, scope: Awaited<ReturnType<typeof scopeFor>>) {
  if (!scope) return false;
  return scope.user.role === "admin" || scope.assignments.some((item) => (!item.institutionSlug || item.institutionSlug === course.universitySlug) && (course.audienceScope === "institution" ? !item.specialty : !item.specialty || item.specialty === course.specialty));
}

export async function GET(request: Request) {
  const scope = await scopeFor(request);
  if (!scope) return jsonError("غير مصرح", 403);
  if (!await checkRateLimit("supervisor-workspace-write", `user:${scope.user.id}:${clientIp(request)}`, 60, 60)) return jsonError("طلبات كثيرة. حاول بعد دقيقة.", 429);
  const db = getDb();
  const [allCourses, units, lessons, videos] = await Promise.all([
    getCoursesCatalog(true),
    db.select().from(courseUnitsDb).orderBy(asc(courseUnitsDb.position)),
    db.select().from(lessonsDb).orderBy(asc(lessonsDb.position)),
    db.select().from(videoAssets).orderBy(desc(videoAssets.createdAt)).limit(400),
  ]);
  const courses = allCourses.filter((course) => assigned(course, scope));
  const slugs = new Set(courses.map((course) => course.slug));
  return Response.json({ ok:true, assignments:scope.assignments, courses, units:units.filter((row)=>slugs.has(row.courseSlug)), lessons:lessons.filter((row)=>slugs.has(row.courseSlug)), videos:videos.filter((row)=>slugs.has(row.courseSlug)) }, { headers:{"cache-control":"no-store"} });
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const scope = await scopeFor(request);
  if (!scope) return jsonError("غير مصرح", 403);
  let payload:Record<string,unknown>;
  try { payload=await request.json() as Record<string,unknown>; } catch { return jsonError("بيانات غير صالحة"); }
  const action=cleanText(payload.action,40); const courseSlug=cleanText(payload.courseSlug,80); const courses=await getCoursesCatalog(true); const course=courses.find((item)=>item.slug===courseSlug);
  if(!course||!assigned(course,scope))return jsonError("هذه المادة خارج نطاق إشرافك",403);
  const db=getDb(); const [managed]=await db.select().from(catalogCourses).where(eq(catalogCourses.slug,courseSlug)).limit(1); if(!managed)return jsonError("اطلب من الإدارة تحويل المادة إلى كتالوج قابل للتحرير أولًا",409);
  const now=new Date().toISOString();
  if(action==="saveUnit"){
    const title=cleanText(payload.title,160);const description=cleanText(payload.description,1000);if(title.length<2)return jsonError("اسم الوحدة قصير");
    const [created]=await db.insert(courseUnitsDb).values({courseSlug,title,description,position:Math.max(0,Math.floor(Number(payload.position)||0)),status:"published",createdAt:now,updatedAt:now}).returning({id:courseUnitsDb.id});
    await db.insert(auditLogs).values({actorEmail:scope.user.email,action:"create",entityType:"unit",entityId:String(created.id),afterJson:JSON.stringify({courseSlug,title,description})});invalidateCatalogCache();return Response.json({ok:true,id:created.id},{status:201,headers:{"cache-control":"no-store"}});
  }
  if(action==="saveLesson"){
    const unitId=Math.floor(Number(payload.unitId));const title=cleanText(payload.title,160);const position=Math.max(0,Math.floor(Number(payload.position)||0));const suppliedId=cleanText(payload.id,100);const id=suppliedId||makeLessonId(courseSlug,position+1,title);const description=cleanText(payload.description,1000);if(!/^[a-z0-9._-]{2,100}$/i.test(id)||!unitId||title.length<2)return jsonError("تحقق من بيانات الدرس");
    const [unit]=await db.select().from(courseUnitsDb).where(and(eq(courseUnitsDb.id,unitId),eq(courseUnitsDb.courseSlug,courseSlug))).limit(1);if(!unit)return jsonError("الوحدة لا تتبع المادة");
    const [existing]=await db.select().from(lessonsDb).where(eq(lessonsDb.id,id)).limit(1);if(existing&&existing.courseSlug!==courseSlug)return jsonError("معرّف الدرس مستخدم");
    const values={id,courseSlug,unitId,title,description,position,durationSeconds:Math.max(0,Math.floor(Number(payload.durationSeconds)||0)),freePreview:payload.freePreview===true,status:"published",videoAssetId:existing?.videoAssetId||null,updatedAt:now};
    await db.insert(lessonsDb).values({...values,createdAt:existing?.createdAt||now}).onConflictDoUpdate({target:lessonsDb.id,set:values});await db.insert(auditLogs).values({actorEmail:scope.user.email,action:existing?"update":"create",entityType:"lesson",entityId:id,afterJson:JSON.stringify(values)});invalidateCatalogCache();return Response.json({ok:true,id},{headers:{"cache-control":"no-store"}});
  }
  return jsonError("الإجراء غير معروف",404);
}
