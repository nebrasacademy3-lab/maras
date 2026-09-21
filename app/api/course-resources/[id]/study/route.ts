import { studentWorkspaceRequirementResponse } from "@/lib/student-workspace-policy";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiFiles } from "@/db/schema";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { aiError, aiJson, filePayload } from "@/lib/ai-api";
import { AI_FILE_TYPES } from "@/lib/ai-files";
import { activeStudyResource } from "@/lib/ai-course-source";
import { isNativeAppRequest } from "@/lib/mobile-api";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (user?.role === "instructor") return studentWorkspaceRequirementResponse(user)!;
  if (!user) return jsonError("سجّل الدخول لاستخدام ملف الدرس", 401);
  if (!await checkRateLimit("ai-source-link", `user:${user.id}`, 60, 60)) return jsonError("طلبات كثيرة. حاول بعد قليل.", 429);
  const resourceId = Number((await params).id);
  if (!Number.isSafeInteger(resourceId) || resourceId <= 0) return jsonError("معرّف الملف غير صالح");
  try {
    const source = await activeStudyResource(resourceId, user, isNativeAppRequest(request) ? "app" : "web");
    if (!AI_FILE_TYPES.has(source.contentType)) return jsonError("هذا النوع متاح للتنزيل فقط. اربط بالدرس PDF أو DOCX أو PPTX أو ملفًا نصيًا لاستخدام الأدوات.", 422);
    const file = await getDb().transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`ai-source:${user.id}:${source.id}`}))`);
      const [existing] = await tx.select().from(aiFiles).where(and(eq(aiFiles.userId, user.id), eq(aiFiles.sourceResourceId, source.id))).limit(1);
      const now = new Date().toISOString();
      const values = { originalName: source.originalName, contentType: source.contentType, sizeBytes: source.sizeBytes, scanSha256: source.scanSha256, scanStatus: "clean", status: "ready", scannedAt: source.scannedAt, updatedAt: now };
      if (existing) return (await tx.update(aiFiles).set(values).where(eq(aiFiles.id, existing.id)).returning())[0];
      return (await tx.insert(aiFiles).values({ ...values, userId: user.id, sourceResourceId: source.id, objectKey: `ai-linked/${user.id}/${source.id}`, storageProvider: "course-resource", createdAt: now }).returning())[0];
    });
    return aiJson({ ok: true, file: filePayload(file), source: { id: source.id, title: source.title, lessonId: source.lessonId } });
  } catch (error) { return aiError(error); }
}
