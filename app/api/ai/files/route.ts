import { and, count, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiConversations, aiFiles } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { aiDeepLinks, aiJson, filePayload } from "@/lib/ai-api";
import { AI_FILE_TYPES, validAiFileSignature } from "@/lib/ai-files";
import { scanColumns, scanStoredFile } from "@/lib/file-security";
import { deleteStoredMultipartFiles, parseStoredMultipart } from "@/lib/multipart-upload";
import { getAiUsageStatuses } from "@/lib/ai-platform";
import { observeRequest } from "@/lib/observability";
import { activeStorageProvider } from "@/lib/storage";

class AiFileQuotaError extends Error {}
type Database = ReturnType<typeof getDb>;
type AiFileTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function boundedStorageLimit(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.floor(parsed))) : fallback;
}

async function storedUsage(userId: number, tx?: AiFileTransaction) {
  const selection = { fileCount: count(), totalBytes: sql<string>`COALESCE(SUM(${aiFiles.sizeBytes}), 0)::text` };
  const rows = tx
    ? await tx.select(selection).from(aiFiles).where(eq(aiFiles.userId, userId))
    : await getDb().select(selection).from(aiFiles).where(eq(aiFiles.userId, userId));
  const [row] = rows;
  return { fileCount: Number(row?.fileCount || 0), totalBytes: Number(row?.totalBytes || 0) };
}

export async function POST(request: Request) {
  return observeRequest(request, "ai.files.upload", async () => {
    if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
    const user = await getSessionUser(request);
    if (!user) return jsonError("سجّل الدخول لاستخدام مراس AI", 401);
    if (!await checkRateLimit("ai-file-upload", `user:${user.id}`, 12, 60 * 60)) return jsonError("تم رفع ملفات كثيرة. حاول لاحقًا.", 429);
    const { statuses } = await getAiUsageStatuses(user);
    const fileServices = [statuses.summary, statuses.translation, statuses.quiz].filter((status) => status.enabled);
    if (!fileServices.length) return jsonError("خدمات الملفات معطلة حاليًا من الإدارة", 403);
    const availableServices = fileServices.filter((status) => status.remaining > 0);
    if (!availableServices.length) return jsonError("اكتمل حد خدمات الملفات لهذا الشهر. يمكنك الترقية أو الانتظار حتى تجدد الفترة.", 429);
    const maxFileBytes = Math.max(...availableServices.map((status) => status.maxFileBytes), 256 * 1024);
    const maxStoredFiles = boundedStorageLimit(process.env.AI_MAX_STORED_FILES_PER_USER, 30, 1, 200);
    const maxStoredBytes = boundedStorageLimit(process.env.AI_MAX_STORED_BYTES_PER_USER, Math.max(200 * 1024 * 1024, maxFileBytes), maxFileBytes, 2_000_000_000);
    const beforeUpload = await storedUsage(user.id);
    if (beforeUpload.fileCount >= maxStoredFiles || beforeUpload.totalBytes >= maxStoredBytes) return jsonError("وصلت إلى حصة ملفات مراس AI. احذف المحادثات والملفات القديمة أو تواصل مع الدعم.", 409);
    let parsed: Awaited<ReturnType<typeof parseStoredMultipart>>;
    try {
      parsed = await parseStoredMultipart(request, {
        fieldName: "file",
        maxFiles: 1,
        maxFileBytes,
        maxTotalBytes: maxFileBytes,
        objectPrefix: `ai/${user.id}/files`,
        allowedTypes: AI_FILE_TYPES,
        validSignature: validAiFileSignature,
      });
    } catch (error) { return jsonError(error instanceof Error ? error.message : "تعذر رفع الملف", 413); }
    const file = parsed.files[0];
    if (!file) return jsonError("اختر ملفًا واحدًا للرفع");
    const conversationId = Math.floor(Number(parsed.fields.conversationId));
    let conversation: typeof aiConversations.$inferSelect | null = null;
    if (conversationId > 0) {
      [conversation] = await getDb().select().from(aiConversations).where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, user.id), eq(aiConversations.status, "active"))).limit(1);
      if (!conversation) { await deleteStoredMultipartFiles(parsed.files); return jsonError("المحادثة غير موجودة", 404); }
    }
    const storageProvider = activeStorageProvider();
    const scan = await scanStoredFile({ ...file, storageProvider });
    if (scan.status === "quarantined") { await deleteStoredMultipartFiles(parsed.files); return jsonError("رُفض الملف بعد الفحص الأمني", 422); }
    const now = new Date().toISOString();
    try {
      const [row] = await getDb().transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`ai-file-quota:${user.id}`}))`);
        const usage = await storedUsage(user.id, tx);
        if (usage.fileCount >= maxStoredFiles || usage.totalBytes + file.sizeBytes > maxStoredBytes) throw new AiFileQuotaError();
        return tx.insert(aiFiles).values({
          userId: user.id,
          conversationId: conversation?.id || null,
          objectKey: file.objectKey,
          storageProvider,
          originalName: file.originalName,
          contentType: file.contentType,
          sizeBytes: file.sizeBytes,
          status: scan.status === "clean" ? "ready" : "pending_scan",
          ...scanColumns(scan),
          createdAt: now,
          updatedAt: now,
        }).returning();
      });
      return aiJson({ ok: true, file: filePayload(row), availableActions: ["summary", "translation", "quiz"], deepLink: aiDeepLinks({ conversationId: row.conversationId }).conversation }, { status: 201 });
    } catch (error) {
      await deleteStoredMultipartFiles(parsed.files);
      if (error instanceof AiFileQuotaError) return jsonError("تجاوز الملف حصة التخزين المتاحة لحسابك.", 409);
      return jsonError("تعذر حفظ الملف", 500);
    }
  });
}
