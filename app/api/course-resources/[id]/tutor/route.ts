import { randomUUID, createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiConversations, aiFiles, aiMessages, lessonsDb, users } from "@/db/schema";
import { getSessionUser, sameOriginRequest, checkRateLimit } from "@/lib/auth";
import { activeStudyResource, resolveAiSource } from "@/lib/ai-course-source";
import { AI_FILE_TYPES, readAiFileBytes } from "@/lib/ai-files";
import { aiJson, aiError, clientAiRequestId } from "@/lib/ai-api";
import { AiPlatformError, beginAiUsage, finishAiUsage } from "@/lib/ai-platform";
import { generateLessonTutor } from "@/lib/ai-generation";
import { acquireAiWorkLease, AiBusyError } from "@/lib/ai-work-control";
import { GeminiProviderError } from "@/lib/gemini-errors";
import { readBoundedJsonObject } from "@/lib/request-body";
import { isNativeAppRequest } from "@/lib/mobile-api";
import { activeStorageProvider } from "@/lib/storage";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
type Context = { params: Promise<{ id: string }> };
const fingerprint = (source: { id: number; lessonId: string | null; courseSlug: string; objectKey: string; scanSha256: string | null; updatedAt: string }) => createHash("sha256").update(JSON.stringify(source)).digest("hex");
const message = (row: typeof aiMessages.$inferSelect) => ({ id: row.id, role: row.role, content: row.content, createdAt: row.createdAt });
async function handle(request: Request, context: Context, write: boolean) {
  let release: (() => Promise<void>) | null = null;
  let reservation: Awaited<ReturnType<typeof beginAiUsage>> | null = null;
  let providerStarted = false, settled = false;
  try {
    if (write && !sameOriginRequest(request)) throw new AiPlatformError("AI_ORIGIN", "تعذر التحقق من مصدر الطلب", 403);
    const user = await getSessionUser(request);
    if (!user) throw new AiPlatformError("AI_LOGIN", "سجّل الدخول لاستخدام المعلم الذكي", 401);
    if (user.role === "instructor") throw new AiPlatformError("AI_ROLE", "هذه الأداة لحساب الطالب", 403);
    const id = Number((await context.params).id), lessonId = new URL(request.url).searchParams.get("lesson") || "";
    if (!Number.isSafeInteger(id) || id < 1 || !lessonId || lessonId.length > 120) throw new AiPlatformError("AI_SOURCE_INVALID", "ملف الدرس غير صالح", 400);
    if (!await checkRateLimit("lesson-tutor", String(user.id), write ? 30 : 120, 60)) throw new AiBusyError(10);
    const client = isNativeAppRequest(request) ? "app" : "web";
    const resource = await activeStudyResource(id, user, client);
    const [lesson] = await getDb().select({ id: lessonsDb.id }).from(lessonsDb).where(and(eq(lessonsDb.id, lessonId), eq(lessonsDb.courseSlug, resource.courseSlug), eq(lessonsDb.status, "published"))).limit(1);
    if (!lesson || resource.lessonId !== null && resource.lessonId !== lessonId || !AI_FILE_TYPES.has(resource.contentType)) throw new AiPlatformError("AI_SOURCE_INVALID", "هذا الملف غير مرتبط بالدرس أو غير مدعوم", 404);
    const version = fingerprint(resource), kind = `lesson_tutor:${id}:${lessonId}:${version}`;
    const source = { id, title: resource.title, lessonId, version };
    const where = and(eq(aiConversations.userId, user.id), eq(aiConversations.kind, kind), eq(aiConversations.status, "active"));
    if (!write) {
      return await getDb().transaction(async tx => {
        const current = await activeStudyResource(id, user, client, tx, true);
        const [liveLesson] = await tx.select({id: lessonsDb.id}).from(lessonsDb).where(and(eq(lessonsDb.id, lessonId), eq(lessonsDb.courseSlug, current.courseSlug), eq(lessonsDb.status, "published"))).for("share");
        if (!liveLesson || fingerprint(current) !== version) throw new AiPlatformError("AI_SOURCE_CHANGED", "تغيّر مرجع الدرس؛ حدّث الصفحة", 409);
        const [thread] = await tx.select().from(aiConversations).where(where).orderBy(desc(aiConversations.id)).limit(1).for("share");
        const rows = thread ? await tx.select().from(aiMessages).where(and(eq(aiMessages.conversationId, thread.id), eq(aiMessages.userId, user.id))).orderBy(desc(aiMessages.id)).limit(100) : [];
        return aiJson({ source, conversationId: thread?.id || null, messages: rows.reverse().map(message) });
      });
    }
    const body = await readBoundedJsonObject(request, 32 * 1024);
    const text = typeof body.text === "string" ? body.text.replace(/\u0000/g, "").trim() : "";
    if (text.length < 2 || text.length > 8000) throw new AiPlatformError("AI_MESSAGE", "اكتب سؤالًا بين حرفين و8000 حرف", 400);
    release = await acquireAiWorkLease(`lesson-tutor:${user.id}:${id}:${lessonId}`, 240);
    if (!release) throw new AiBusyError(5, "AI_CONVERSATION_BUSY");
    const { thread, file } = await getDb().transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`ai-source:${user.id}:${id}`}))`);
      const now = new Date().toISOString();
      let [file] = await tx.select().from(aiFiles).where(and(eq(aiFiles.userId, user.id), eq(aiFiles.sourceResourceId, id))).limit(1);
      const values = { originalName: resource.originalName, contentType: resource.contentType, sizeBytes: resource.sizeBytes, scanSha256: resource.scanSha256, scanStatus: "clean", status: "ready", scannedAt: resource.scannedAt, updatedAt: now };
      if (!file) [file] = await tx.insert(aiFiles).values({ ...values, userId: user.id, sourceResourceId: id, objectKey: `ai-linked/${user.id}/${id}`, storageProvider: "course-resource" }).returning();
      else [file] = await tx.update(aiFiles).set(values).where(eq(aiFiles.id, file.id)).returning();
      let [thread] = await tx.select().from(aiConversations).where(where).orderBy(desc(aiConversations.id)).limit(1);
      if (!thread) [thread] = await tx.insert(aiConversations).values({ userId: user.id, kind, title: `المعلم الذكي · ${resource.title}`.slice(0,180) }).returning();
      return { thread, file };
    });
    reservation = await beginAiUsage({ requestId: clientAiRequestId(user.id, randomUUID(), body.requestId), user, service: "chat", conversationId: thread.id, fileId: file.id });
    const bytes = await readAiFileBytes({ ...resource, storageProvider: activeStorageProvider() }, reservation.config.maxFileBytes);
    request.signal.throwIfAborted();
    const history = await getDb().select().from(aiMessages).where(and(eq(aiMessages.conversationId, thread.id), eq(aiMessages.userId, user.id))).orderBy(desc(aiMessages.id)).limit(8);
    providerStarted = true;
    const generated = await generateLessonTutor({ config: reservation.config, bytes, contentType: resource.contentType, originalName: resource.originalName, history: history.reverse().map(row => ({ role: row.role === "assistant" ? "assistant" : "user", content: row.content })), question: text });
    await finishAiUsage({ eventId: reservation.eventId, status: "succeeded", keyId: generated.keyId, model: generated.model, inputTokens: generated.inputTokens, outputTokens: generated.outputTokens, providerTier: generated.providerTier }); settled = true;
    request.signal.throwIfAborted();
    const currentUser = await getSessionUser(request);
    if (currentUser?.id !== user.id || currentUser.role === "instructor") throw new AiPlatformError("AI_SESSION_CHANGED", "انتهت الجلسة؛ لم تُعرض الإجابة", 403);
    const result = await getDb().transaction(async tx => {
      const [activeUser] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, user.id), eq(users.status, "active"))).for("share");
      const current = await activeStudyResource(id, user, client, tx, true);
      const [currentLesson] = await tx.select({ id: lessonsDb.id }).from(lessonsDb).where(and(eq(lessonsDb.id, lessonId), eq(lessonsDb.courseSlug, current.courseSlug), eq(lessonsDb.status, "published"))).for("share");
      const [activeThread] = await tx.select().from(aiConversations).where(and(where, eq(aiConversations.id, thread.id))).for("update");
      const [activeFile] = await tx.select().from(aiFiles).where(and(eq(aiFiles.id, file.id), eq(aiFiles.userId, user.id))).for("share");
      if (!activeUser || !currentLesson || !activeThread || !activeFile || fingerprint(current) !== version) throw new AiPlatformError("AI_SOURCE_CHANGED", "تغيّر الملف أو الوصول أثناء الإجابة؛ حدّث الدرس", 409);
      await resolveAiSource(activeFile, user, client, tx, true);
      const rows = await tx.insert(aiMessages).values([
        { userId: user.id, conversationId: thread.id, fileId: file.id, role: "user", service: "lesson_tutor", content: text },
        { userId: user.id, conversationId: thread.id, fileId: file.id, role: "assistant", service: "lesson_tutor", content: generated.text, model: generated.model },
      ]).returning();
      await tx.update(aiConversations).set({ updatedAt: new Date().toISOString() }).where(eq(aiConversations.id, thread.id));
      return rows.sort((a,b) => a.id-b.id).map(message);
    });
    return aiJson({ source, conversationId: thread.id, messages: result });
  } catch (error) {
    if (reservation && !settled) await finishAiUsage({ eventId: reservation.eventId, status: "failed", billable: providerStarted && !(error instanceof AiBusyError) && !(error instanceof GeminiProviderError && [400,401,403,404,429].includes(error.providerStatus)), errorCode: error instanceof AiPlatformError ? error.code : "AI_TUTOR_FAILED" }).catch(() => undefined);
    return aiError(error);
  } finally { await release?.().catch(() => undefined); }
}
export async function GET(request: Request, context: Context) { return handle(request, context, false); }
export async function POST(request: Request, context: Context) { return handle(request, context, true); }
