import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiConversations, aiFiles } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { aiError, aiJson, clientAiRequestId } from "@/lib/ai-api";
import { tryAcquireAiFileAction } from "@/lib/ai-files";
import { fileActionOptions, runAiFileAction } from "@/lib/ai-file-actions";
import { enqueueAiFileJob, fileJobPayload } from "@/lib/ai-file-jobs";
import { scanColumns, scanStoredFile } from "@/lib/file-security";
import { isNativeAppRequest } from "@/lib/mobile-api";
import { observeRequest } from "@/lib/observability";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return observeRequest(request, "ai.files.action", async requestId => {
    if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
    const user = await getSessionUser(request);
    if (!user) return jsonError("سجّل الدخول لاستخدام أدوات مراس", 401);
    if (!await checkRateLimit("ai-file-action", `user:${user.id}`, 60, 60 * 60)) return jsonError("طلبات معالجة كثيرة. حاول لاحقًا.", 429);
    const fileId = Number((await params).id);
    if (!Number.isSafeInteger(fileId) || fileId <= 0) return jsonError("الملف غير صالح");
    let payload: Record<string, unknown>;
    try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات العملية غير صالحة"); }
    if (!payload || !["summary", "translation", "quiz"].includes(String(payload.action))) return jsonError("اختر تلخيصًا أو ترجمة أو اختبارًا");
    const action = payload.action as "summary" | "translation" | "quiz";
    const [original] = await getDb().select().from(aiFiles).where(and(eq(aiFiles.id, fileId), eq(aiFiles.userId, user.id))).limit(1);
    if (!original) return jsonError("الملف غير موجود", 404);
    let file = original;
    try {
      if (file.sourceResourceId === null && file.scanStatus !== "clean") {
        const scan = await scanStoredFile(file);
        [file] = await getDb().update(aiFiles).set({ ...scanColumns(scan), status: scan.status === "clean" ? "ready" : scan.status === "quarantined" ? "quarantined" : "pending_scan", updatedAt: new Date().toISOString() }).where(eq(aiFiles.id, file.id)).returning();
        if (scan.status !== "clean") return jsonError(scan.status === "quarantined" ? "الملف محجور لأسباب أمنية" : "الملف قيد الفحص الأمني. حاول بعد قليل.", scan.status === "quarantined" ? 422 : 423);
      }
      const conversation = await getDb().transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`ai-file-conversation:${file.id}`}))`);
        const [currentFile] = await tx.select().from(aiFiles).where(eq(aiFiles.id, file.id)).limit(1);
        const requestedId = Number(payload.conversationId) || currentFile?.conversationId || 0;
        if (requestedId) {
          const [existing] = await tx.select().from(aiConversations).where(and(eq(aiConversations.id, requestedId), eq(aiConversations.userId, user.id), eq(aiConversations.status, "active"))).limit(1);
          if (existing) return existing;
          if (payload.conversationId) return null;
        }
        const now = new Date().toISOString();
        const [created] = await tx.insert(aiConversations).values({ userId: user.id, title: file.originalName.slice(0, 100), kind: action, status: "active", createdAt: now, updatedAt: now }).returning();
        await tx.update(aiFiles).set({ conversationId: created.id, updatedAt: now }).where(eq(aiFiles.id, file.id));
        return created;
      });
      if (!conversation) return jsonError("المحادثة غير موجودة", 404);
      const input = { user, file, conversationId: conversation.id, action, options: fileActionOptions(payload), requestId: clientAiRequestId(user.id, requestId, payload.requestId), client: isNativeAppRequest(request) ? "app" as const : "web" as const };
      // Explicit opt-in preserves the synchronous response contract for previously installed apps.
      if (payload.async === true) {
        const job = await enqueueAiFileJob(input);
        return aiJson({ ok: true, job: fileJobPayload(job) }, { status: job.status === "succeeded" ? 200 : 202, headers: { "retry-after": "5" } });
      }
      const release = tryAcquireAiFileAction(user.id);
      if (!release) return jsonError("توجد معالجة أخرى قيد التنفيذ. حاول بعد قليل.", 429);
      try { return aiJson(await runAiFileAction({ ...input, fileId })); }
      finally { release(); }
    } catch (error) { return aiError(error); }
  });
}
