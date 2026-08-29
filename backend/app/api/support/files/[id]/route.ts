import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { supportReplies, supportReplyFiles, supportTickets } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { getObject } from "@/lib/storage";
import { jsonError } from "@/lib/api";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getSessionUser(request);
  if (!current) return jsonError("سجّل الدخول أولًا", 401);
  const id = Math.floor(Number((await params).id));
  if (!id) return jsonError("المرفق غير صالح", 400);
  const db = getDb();
  const [row] = await db.select({ file: supportReplyFiles, internal: supportReplies.internal }).from(supportReplyFiles).innerJoin(supportReplies, eq(supportReplyFiles.replyId, supportReplies.id)).where(eq(supportReplyFiles.id, id)).limit(1);
  if (!row) return jsonError("المرفق غير موجود", 404);
  const { file } = row;
  const [ticket] = await db.select({ userEmail: supportTickets.userEmail, assignedTo: supportTickets.assignedTo }).from(supportTickets).where(eq(supportTickets.id, file.ticketId)).limit(1);
  const manager = current.role === "admin" || current.role === "supervisor";
  const supervisorAllowed = current.role === "supervisor" && (!ticket?.assignedTo || ticket.assignedTo === current.email);
  if (!ticket || (!manager && ticket.userEmail !== current.email) || (current.role === "supervisor" && !supervisorAllowed) || (!manager && row.internal)) return jsonError("غير مصرح", 403);
  const object = await getObject(file.objectKey);
  if (!object) return jsonError("الملف غير موجود في التخزين", 404);
  const headers = new Headers({
    "content-type": file.contentType,
    "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  });
  return new Response(object.body, { headers });
}
