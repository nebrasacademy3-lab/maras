import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { supportReplyFiles, supportTickets } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { getObject } from "@/lib/storage";
import { jsonError } from "@/lib/api";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getSessionUser(request);
  if (!current) return jsonError("سجّل الدخول أولًا", 401);
  const id = Math.floor(Number((await params).id));
  if (!id) return jsonError("المرفق غير صالح", 400);
  const db = getDb();
  const [file] = await db.select().from(supportReplyFiles).where(eq(supportReplyFiles.id, id)).limit(1);
  if (!file) return jsonError("المرفق غير موجود", 404);
  if (file.scanStatus === "quarantined") return jsonError("المرفق غير متاح لأسباب أمنية", 404);
  if (file.scanStatus !== "clean") return jsonError("المرفق قيد الفحص الأمني", 423);
  const [ticket] = await db.select({ userEmail: supportTickets.userEmail }).from(supportTickets).where(eq(supportTickets.id, file.ticketId)).limit(1);
  const manager = current.role === "admin" || current.role === "supervisor";
  if (!ticket || (!manager && ticket.userEmail !== current.email)) return jsonError("غير مصرح", 403);
  const object = await getObject(file.objectKey);
  if (!object) return jsonError("الملف غير موجود في التخزين", 404);
  const inline = new URL(request.url).searchParams.get("inline") === "1" && (file.contentType.startsWith("image/") || file.contentType.startsWith("audio/"));
  const headers = new Headers({
    "content-type": file.contentType,
    "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  });
  return new Response(object.body, { headers });
}
