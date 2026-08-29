import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { courseRequestFiles, courseRequests } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { getSessionUser, roleAllowed } from "@/lib/auth";
import { getObject } from "@/lib/storage";
import { createStoredZip } from "@/lib/zip";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser(request);
  if (!roleAllowed(user, ["admin"])) return jsonError("غير مصرح", 403);
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return jsonError("الطلب غير صالح");
  const db = getDb();
  const [courseRequest] = await db.select({ id: courseRequests.id, courseName: courseRequests.courseName }).from(courseRequests).where(eq(courseRequests.id, id)).limit(1);
  if (!courseRequest) return jsonError("الطلب غير موجود", 404);
  const files = await db.select().from(courseRequestFiles).where(eq(courseRequestFiles.requestId, id));
  if (!files.length) return jsonError("لا توجد مرفقات لهذا الطلب", 404);
  const entries: Array<{ name: string; data: Uint8Array }> = [];
  for (const file of files) {
    const object = await getObject(file.objectKey);
    if (!object) continue;
    const data = new Uint8Array(await new Response(object.body).arrayBuffer());
    entries.push({ name: file.originalName, data });
  }
  if (!entries.length) return jsonError("ملفات الطلب غير متاحة في التخزين", 404);
  const zip = createStoredZip(entries);
  const safeCourse = courseRequest.courseName.replace(/[^\p{L}\p{N}._ -]+/gu, "_").slice(0, 80) || `request-${id}`;
  return new Response(zip, { headers: {
    "content-type": "application/zip",
    "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${safeCourse}-files.zip`)}`,
    "content-length": String(zip.length),
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  } });
}
