import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { courseRequestFiles, courseRequests } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول أولًا", 401);
  const id = Math.floor(Number((await params).id));
  if (!id) return jsonError("الطلب غير صالح", 400);
  const db = getDb();
  const [row] = await db.select({ id: courseRequests.id, userId: courseRequests.userId, status: courseRequests.status }).from(courseRequests).where(eq(courseRequests.id, id)).limit(1);
  if (!row || (row.userId !== user.id && user.role === "student")) return jsonError("الطلب غير موجود", 404);
  const files = await db.select({ id: courseRequestFiles.id, originalName: courseRequestFiles.originalName, contentType: courseRequestFiles.contentType, sizeBytes: courseRequestFiles.sizeBytes, scanStatus: courseRequestFiles.scanStatus, createdAt: courseRequestFiles.createdAt })
    .from(courseRequestFiles).where(and(eq(courseRequestFiles.requestId, id))).orderBy(asc(courseRequestFiles.createdAt)).limit(200);
  return Response.json({ ok: true, requestId: id, status: row.status, files }, { headers: { "cache-control": "private, no-store" } });
}
