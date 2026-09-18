import { readBoundedJsonObject } from "@/lib/request-body";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, courseRequestFiles, courseRequests, users } from "@/db/schema";
import { checkRateLimit, getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { finiteNumber, cleanText, jsonError } from "@/lib/api";
import { createAndSendNotification } from "@/lib/notifications";
import { supervisorScopeId, scopedRequestSql } from "@/lib/supervisor-data-scope";

const allowedStatuses = new Set(["assigned", "reviewing", "planned", "producing", "available", "declined"]);
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!roleAllowed(user, ["supervisor", "admin"])) return jsonError("غير مصرح", 403);
  const db = getDb(), actor = await supervisorScopeId(user);
  const rows = await db.select().from(courseRequests).where(and(
    scopedRequestSql(actor, courseRequests.id),
    actor === null ? undefined : or(eq(courseRequests.assignedSupervisorId, user!.id), eq(courseRequests.status, "new")),
  )).orderBy(desc(courseRequests.createdAt), desc(courseRequests.id)).limit(150);
  const ids = rows.map(row => row.id);
  const files = ids.length ? await db.select({ id: courseRequestFiles.id, requestId: courseRequestFiles.requestId, originalName: courseRequestFiles.originalName, sizeBytes: courseRequestFiles.sizeBytes, contentType: courseRequestFiles.contentType }).from(courseRequestFiles).where(inArray(courseRequestFiles.requestId, ids)) : [];
  return Response.json({ ok: true, requests: rows.map(row => ({ ...row, files: files.filter(file => file.requestId === row.id) })) }, { headers: { "cache-control": "no-store" } });
}
export async function PATCH(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!roleAllowed(user, ["supervisor", "admin"])) return jsonError("غير مصرح", 403);
  if (!await checkRateLimit("supervisor-request-write", `user:${user!.id}`, 120, 60)) return jsonError("تحديثات كثيرة. حاول بعد قليل.", 429);
  let payload: Record<string, unknown>;
  try { payload = await readBoundedJsonObject(request, 32 * 1024); } catch { return jsonError("بيانات غير صالحة"); }
  const id = finiteNumber(payload.id), status = cleanText(payload.status, 30);
  if (!Number.isSafeInteger(id) || id <= 0 || !allowedStatuses.has(status)) return jsonError("الحالة غير صالحة");
  const db = getDb(), actor = await supervisorScopeId(user), now = new Date().toISOString();
  const result = await db.transaction(async tx => {
    const [row] = await tx.select().from(courseRequests).where(and(eq(courseRequests.id, id), scopedRequestSql(actor, courseRequests.id))).limit(1).for("update");
    if (!row) return { error: "الطلب غير موجود ضمن نطاقك", status: 404 } as const;
    if (actor !== null && row.assignedSupervisorId && row.assignedSupervisorId !== user!.id) return { error: "الطلب مسند لمشرف آخر", status: 403 } as const;
    const assignedSupervisorId = row.assignedSupervisorId || user!.id;
    await tx.update(courseRequests).set({ status, assignedSupervisorId, updatedAt: now }).where(eq(courseRequests.id, id));
    await tx.insert(auditLogs).values({ actorEmail: user!.email, action: "update_request", entityType: "course_request", entityId: String(id), beforeJson: JSON.stringify({ status: row.status, assignedSupervisorId: row.assignedSupervisorId }), afterJson: JSON.stringify({ status, assignedSupervisorId }), createdAt: now });
    return { row, assignedSupervisorId };
  });
  if ("error" in result) return jsonError(result.error!, result.status);
  try {
    if (result.row.userId) {
      const [student] = await db.select({ email: users.email }).from(users).where(eq(users.id, result.row.userId)).limit(1);
      if (student) await createAndSendNotification({ values: { userEmail: student.email, audience: "student", title: "تحديث طلب المادة", body: `أصبحت حالة «${result.row.courseName}»: ${statusLabel(status)}.`, actionUrl: "/dashboard?view=requests" }, target: { userEmail: student.email }, data: { route: "/requests" } });
    }
  } catch { /* The saved status remains the source of truth. */ }
  return Response.json({ ok: true, request: { id, status, assignedSupervisorId: result.assignedSupervisorId, updatedAt: now } });
}
function statusLabel(status: string) { return ({ assigned: "مسند لمشرف", reviewing: "قيد المراجعة", planned: "مخطط له", producing: "قيد الإنتاج", available: "متاح", declined: "متعذر حاليًا" } as Record<string, string>)[status] || status; }
