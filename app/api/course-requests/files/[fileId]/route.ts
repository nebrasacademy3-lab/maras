import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { courseRequestFiles } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { getObject } from "@/lib/storage";

export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول أولًا", 401);
  const id = Math.floor(Number((await params).fileId));
  if (!id) return jsonError("المرفق غير صالح", 400);
  const [file] = await getDb().select().from(courseRequestFiles).where(eq(courseRequestFiles.id, id)).limit(1);
  if (!file || (file.userId !== user.id && user.role === "student")) return jsonError("المرفق غير موجود", 404);
  if (file.scanStatus === "quarantined") return jsonError("المرفق غير متاح لأسباب أمنية", 404);
  if (file.scanStatus !== "clean") return jsonError("المرفق قيد الفحص الأمني", 423);
  const object = await getObject(file.objectKey);
  if (!object) return jsonError("الملف غير موجود في التخزين", 404);
  return new Response(object.body, {
    headers: {
      "content-type": file.contentType,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
