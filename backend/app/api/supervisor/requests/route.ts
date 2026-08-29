import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { courseRequestFiles, courseRequests, notificationsDb, supervisorAssignments, users } from "@/db/schema";
import { checkRateLimit, getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";
import { sendPushNotification } from "@/lib/push";
import { specialtiesEquivalent, specialtyNameVariants } from "@/lib/academic-data";

const allowedStatuses=new Set(["assigned","reviewing","planned","producing","available","declined"]);

export async function GET(request:Request){
  const user=await getSessionUser(request);if(!roleAllowed(user,["supervisor","admin"]))return jsonError("غير مصرح",403);
  if(!await checkRateLimit("supervisor-request-read",`user:${user!.id}`,120,60))return jsonError("طلبات كثيرة. حاول بعد قليل.",429);
  const db=getDb();let rows:Array<typeof courseRequests.$inferSelect>;
  if(user!.role==="admin")rows=await db.select().from(courseRequests).orderBy(desc(courseRequests.createdAt)).limit(150);
  else{
    const assignments=await db.select().from(supervisorAssignments).where(and(eq(supervisorAssignments.supervisorId,user!.id),eq(supervisorAssignments.active,true)));
    const scopeFilters=assignments.map((scope)=>and(
      scope.institutionSlug?eq(courseRequests.universitySlug,scope.institutionSlug):undefined,
      scope.specialty?inArray(courseRequests.specialty,[...specialtyNameVariants(scope.institutionSlug||"",scope.specialty)]):undefined,
    ));
    const visibility=scopeFilters.length
      ? or(eq(courseRequests.assignedSupervisorId,user!.id),and(eq(courseRequests.status,"new"),or(...scopeFilters)))
      : eq(courseRequests.assignedSupervisorId,user!.id);
    rows=await db.select().from(courseRequests).where(visibility).orderBy(desc(courseRequests.createdAt)).limit(100);
  }
  const ids=rows.map((row)=>row.id);const files=ids.length?await db.select({id:courseRequestFiles.id,requestId:courseRequestFiles.requestId,originalName:courseRequestFiles.originalName,sizeBytes:courseRequestFiles.sizeBytes,contentType:courseRequestFiles.contentType}).from(courseRequestFiles).where(inArray(courseRequestFiles.requestId,ids)):[];
  return Response.json({ok:true,requests:rows.map((row)=>({...row,files:files.filter((file)=>file.requestId===row.id)}))},{headers:{"cache-control":"no-store"}});
}

export async function PATCH(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!roleAllowed(user, ["supervisor", "admin"])) return jsonError("غير مصرح", 403);
  if (!await checkRateLimit("supervisor-request-write", `user:${user!.id}`, 120, 60)) return jsonError("تحديثات كثيرة. حاول بعد قليل.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات غير صالحة"); }
  const id = Math.floor(Number(payload.id));
  const status = cleanText(payload.status, 30);
  if (!id || !allowedStatuses.has(status)) return jsonError("الحالة غير صالحة");

  const db = getDb();
  const [row] = await db.select().from(courseRequests).where(eq(courseRequests.id, id)).limit(1);
  if (!row) return jsonError("الطلب غير موجود", 404);
  if (user!.role !== "admin" && row.assignedSupervisorId && row.assignedSupervisorId !== user!.id) return jsonError("الطلب مسند لمشرف آخر", 403);
  if (user!.role !== "admin" && !row.assignedSupervisorId) {
    const scopes = await db.select().from(supervisorAssignments).where(and(eq(supervisorAssignments.supervisorId, user!.id), eq(supervisorAssignments.active, true)));
    if (!scopes.some((scope) => (!scope.institutionSlug || scope.institutionSlug === row.universitySlug) && (!scope.specialty || specialtiesEquivalent(scope.institutionSlug || row.universitySlug || "", scope.specialty, row.universitySlug || scope.institutionSlug || "", row.specialty)))) return jsonError("هذا الطلب خارج نطاق إشرافك", 403);
  }

  const now = new Date().toISOString();
  const assignedSupervisorId = user!.role === "admin" ? row.assignedSupervisorId : row.assignedSupervisorId || user!.id;
  const predicate = user!.role === "admin"
    ? eq(courseRequests.id, id)
    : and(eq(courseRequests.id, id), row.assignedSupervisorId ? eq(courseRequests.assignedSupervisorId, user!.id) : isNull(courseRequests.assignedSupervisorId));
  const [changed] = await db.update(courseRequests).set({ status, assignedSupervisorId, updatedAt: now }).where(predicate).returning({ id: courseRequests.id });
  if (!changed) return jsonError("سبق أن استلم مشرف آخر هذا الطلب. حدّث القائمة وحاول مجددًا.", 409);

  try {
    if (row.userId) {
      const [student] = await db.select({ email: users.email }).from(users).where(eq(users.id, row.userId)).limit(1);
      if (student) {
        const title = "تحديث طلب المادة";
        const body = `أصبحت حالة «${row.courseName}»: ${statusLabel(status)}.`;
        await db.insert(notificationsDb).values({ userEmail: student.email, audience: "student", title, body, actionUrl: "/dashboard?view=requests" }).catch(() => undefined);
        if (row.notify) await sendPushNotification({ userEmail: student.email }, title, body, { route: "/requests" });
      }
    }
  } catch { /* The saved status remains the source of truth. */ }
  return Response.json({ ok: true, request: { id, status, assignedSupervisorId, updatedAt: now } });
}

function statusLabel(status:string){return ({assigned:"مسند لمشرف",reviewing:"قيد المراجعة",planned:"مخطط له",producing:"قيد الإنتاج",available:"متاح",declined:"متعذر حاليًا"} as Record<string,string>)[status]||"حالة غير معروفة";}
