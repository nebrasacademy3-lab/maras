import { supervisorScopeId, scopedStudentSql } from "@/lib/supervisor-data-scope";
import { hasPermission, ADMIN_PERMISSIONS } from "@/lib/permissions";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { supportReplyFiles, supportReplies, supportTickets } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { getObject } from "@/lib/storage";
import { jsonError } from "@/lib/api";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getSessionUser(request);
  if (!current || !Number.isSafeInteger(current.id) || current.id <= 0) return jsonError("سجّل الدخول أولًا", 401);
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return jsonError("المرفق غير صالح", 400);
  const db = getDb();
  const [file] = await db.select().from(supportReplyFiles).where(eq(supportReplyFiles.id, id)).limit(1);
  if (!file) return jsonError("المرفق غير موجود", 404);
  const manager = await hasPermission(current, ADMIN_PERMISSIONS.SUPPORT_MANAGE);
  const scopeId = manager ? await supervisorScopeId(current) : null;
  const [ticket] = await db.select({ userId: supportTickets.userId }).from(supportTickets).where(and(
    eq(supportTickets.id, file.ticketId),
    manager ? scopedStudentSql(scopeId, supportTickets.userId, "id") : eq(supportTickets.userId, current.id),
  )).limit(1);
  // A missing/unresolved owner never falls back to a reused historical email.
  if (!ticket || (!manager && ticket.userId !== current.id)) return jsonError("غير مصرح", 403);
  const [reply] = await db.select({ internal: supportReplies.internal, ticketId: supportReplies.ticketId }).from(supportReplies).where(eq(supportReplies.id, file.replyId)).limit(1);
  if (!reply || reply.ticketId !== file.ticketId || (!manager && reply.internal)) return jsonError("المرفق غير موجود", 404);
  if (file.scanStatus === "quarantined") return jsonError("المرفق غير متاح لأسباب أمنية", 404);
  if (file.scanStatus !== "clean") return jsonError("المرفق قيد الفحص الأمني", 423);
  const object = await getObject(file.objectKey, undefined, undefined, request.signal);
  if (!object) return jsonError("الملف غير موجود في التخزين", 404);
  const inline = new URL(request.url).searchParams.get("inline") === "1" && (file.contentType.startsWith("image/") || file.contentType.startsWith("audio/"));
  const headers = new Headers({
    "content-type": file.contentType,
    "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-robots-tag": "noindex, nofollow",
  });
  return new Response(object.body, { headers });
}
