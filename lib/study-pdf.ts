import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiArtifacts, aiConversations, aiFiles, platformSettings, users } from "@/db/schema";
import { studyPdfExports } from "@/db/study-pdf-schema";
import { AiPlatformError } from "@/lib/ai-platform";
import { resolveAiSource } from "@/lib/ai-course-source";
import { readableStudyFileCondition } from "@/lib/study-output-access";
import { PUBLIC_SETTING_DEFAULTS } from "@/lib/platform-settings";
import { normalizedSocialLinks, normalizeWhatsappNumber } from "@/lib/social-links";
import { publicOrigin } from "@/lib/public-origin";
import { renderStudyPdf } from "@/lib/study-pdf-process";
import { MAX_PDF_BYTES, pdfInputDigest, STUDY_PDF_VERSION, StudyPdfError, type StudyPdfInput } from "@/lib/study-pdf-document.mjs";
export { StudyPdfError } from "@/lib/study-pdf-document.mjs";
const MAX_SHARED_BYTES = 128 * 1024 * 1024, MAX_USER_EXPORTS = 8;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type ReadDatabase = Pick<ReturnType<typeof getDb>, "select">;
export type PdfActor = { id: number; email: string; fullName?: string };

export async function loadStudyPdfSource(artifactId: number, user: PdfActor, client: "app" | "web", database: ReadDatabase = getDb(), lock = false) {
  const q = database.select({ artifact: aiArtifacts, file: aiFiles }).from(aiArtifacts).innerJoin(aiFiles, eq(aiArtifacts.fileId, aiFiles.id)).where(and(eq(aiArtifacts.id, artifactId), eq(aiArtifacts.userId, user.id), readableStudyFileCondition(user.id, client))).limit(1);
  const [row] = await (lock ? q.for("share") : q);
  if (!row) throw new AiPlatformError("AI_FILE_MISSING", "الملف غير موجود أو لم يعد متاحًا.", 404);
  const source = await resolveAiSource(row.file, user, client, database, lock);
  const sourceDigest = digest({ artifactId, userId: user.id, title: row.artifact.title, content: row.artifact.content, createdAt: row.artifact.createdAt, file: row.file.id, scope: source.cacheScope, version: source.cacheVersion, objectKey: source.objectKey, storageProvider: source.storageProvider, size: source.sizeBytes });
  return { ...row, sourceName: source.originalName, sourceDigest };
}
async function pdfBranding(): Promise<StudyPdfInput["branding"]> {
  const keys = ["footer_description", "whatsapp_number", "whatsapp_message", "ios_app_url", "android_app_url", ...Object.keys(PUBLIC_SETTING_DEFAULTS).filter(key => key.startsWith("social_"))];
  const rows = await getDb().select({ key: platformSettings.key, value: platformSettings.value }).from(platformSettings).where(inArray(platformSettings.key, keys));
  const settings = { ...PUBLIC_SETTING_DEFAULTS, ...Object.fromEntries(rows.map(row => [row.key, row.value])) };
  return { siteUrl: publicOrigin(), whatsapp: normalizeWhatsappNumber(settings.whatsapp_number), description: settings.footer_description.slice(0, 2000), links: [...normalizedSocialLinks(settings).map(link => ({ label: link.labelAr, url: link.url })), ...[["تطبيق iPhone", settings.ios_app_url], ["تطبيق Android", settings.android_app_url]].flatMap(([label, value]) => { try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.port && /^(?:apps\.apple\.com|play\.google\.com)$/.test(url.hostname) ? [{ label, url: url.href }] : []; } catch { return []; } })] };
}
export class PdfPendingError extends AiPlatformError {
  readonly retryAfterSeconds = 2;
  constructor(code = "PDF_PROCESSING", status = 202) { super(code, "يجري تجهيز ملف PDF المحفوظ. أعد طلب التنزيل بعد قليل دون إعادة التوليد.", status); }
}
function verifyBytes(row: typeof studyPdfExports.$inferSelect) {
  if (!row.data || row.data.length > MAX_PDF_BYTES || !row.data.subarray(0, 5).equals(Buffer.from("%PDF-")) || createHash("sha256").update(row.data).digest("hex") !== row.sha256) throw new StudyPdfError("PDF_CACHE_INVALID");
  return { bytes: row.data, sourceDigest: row.sourceDigest, id: row.id, version: row.rendererVersion, expiresAt: row.expiresAt, cached: true };
}
export async function pruneStudyPdfExports() {
  await getDb().execute(sql`DELETE FROM study_pdf_exports WHERE id IN (SELECT id FROM study_pdf_exports WHERE expires_at < clock_timestamp() AND (lease_until IS NULL OR lease_until < clock_timestamp()) ORDER BY expires_at LIMIT 64)`);
}
export async function exportStudyPdf(input: { artifactId: number; user: PdfActor; client: "app" | "web"; exportId?: string | null; signal?: AbortSignal }) {
  input.signal?.throwIfAborted();
  const initial = await loadStudyPdfSource(input.artifactId, input.user, input.client);
  if (input.exportId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.exportId)) throw new AiPlatformError("PDF_ID_INVALID", "معرّف تصدير غير صالح.", 400);
    const [saved] = await getDb().select().from(studyPdfExports).where(and(eq(studyPdfExports.id, input.exportId), eq(studyPdfExports.userId, input.user.id), eq(studyPdfExports.artifactId, input.artifactId), eq(studyPdfExports.sourceDigest, initial.sourceDigest), eq(studyPdfExports.status, "ready"), eq(studyPdfExports.rendererVersion, STUDY_PDF_VERSION), gt(studyPdfExports.expiresAt, sql`clock_timestamp()`))).limit(1);
    if (!saved) throw new AiPlatformError("PDF_NOT_FOUND", "نسخة PDF غير متاحة. يمكنك إنشاء تصدير جديد من النص المحفوظ.", 404);
    return verifyBytes(saved);
  }
  const document: StudyPdfInput = { recipient: (input.user.fullName?.trim() || `عضو مراس ${input.user.id}`).slice(0, 200), title: initial.artifact.title, content: initial.artifact.content, sourceName: initial.sourceName, createdAt: initial.artifact.createdAt, branding: await pdfBranding() };
  const inputDigest = digest({ document: pdfInputDigest(document), source: initial.sourceDigest });
  const owner = randomUUID();
  const reserved = await getDb().transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('meras-study-pdf-admission'))`);
    await tx.execute(sql`DELETE FROM study_pdf_exports WHERE id IN (SELECT id FROM study_pdf_exports WHERE expires_at < clock_timestamp() AND (lease_until IS NULL OR lease_until < clock_timestamp()) ORDER BY expires_at LIMIT 64)`);
    const matches = await tx.select().from(studyPdfExports).where(and(eq(studyPdfExports.userId, input.user.id), eq(studyPdfExports.artifactId, input.artifactId), eq(studyPdfExports.inputDigest, inputDigest))).limit(1).for("update");
    let existing: typeof studyPdfExports.$inferSelect | undefined = matches[0];
    const timeResult = await tx.execute(sql`SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS millis`);
    const clock = Number(timeResult.rows[0].millis);
    if (existing && Date.parse(existing.expiresAt) <= clock && (!existing.leaseUntil || Date.parse(existing.leaseUntil) <= clock)) {
      await tx.delete(studyPdfExports).where(eq(studyPdfExports.id, existing.id));
      existing = undefined;
    }
    if (existing?.status === "ready") return { row: existing, render: false };
    if (existing?.leaseUntil && Date.parse(existing.leaseUntil) > clock) throw new PdfPendingError();
    if (existing && (existing.attempts >= 3 || Date.parse(existing.updatedAt) > clock - 30_000)) throw new AiPlatformError("PDF_RETRY_LATER", "تعذر التصدير مؤقتًا. النتيجة النصية محفوظة؛ حاول لاحقًا دون إعادة توليدها.", 503);
    const limits = await tx.execute(sql`SELECT coalesce(sum(octet_length(data)),0)::bigint AS bytes,
      count(*) FILTER (WHERE status='rendering' AND lease_until > clock_timestamp()) AS active,
      count(*) FILTER (WHERE user_id=${input.user.id} AND status='rendering' AND lease_until > clock_timestamp()) AS user_active,
      count(*) FILTER (WHERE user_id=${input.user.id}) AS user_total FROM study_pdf_exports`);
    const limit = limits.rows[0];
    if (Number(limit.active) >= 2 || Number(limit.user_active) >= 1 || (!existing && Number(limit.user_total) >= MAX_USER_EXPORTS) || Number(limit.bytes) + (Number(limit.active) + 1) * MAX_PDF_BYTES > MAX_SHARED_BYTES) throw new PdfPendingError("PDF_CAPACITY", 429);
    const now = new Date(clock).toISOString(), until = new Date(clock + 120_000).toISOString();
    if (existing) {
      const [row] = await tx.update(studyPdfExports).set({ status: "rendering", owner, leaseUntil: until, updatedAt: now, errorCode: null, attempts: existing.attempts + 1, data: null, sha256: null }).where(eq(studyPdfExports.id, existing.id)).returning();
      return { row, render: true };
    }
    const [row] = await tx.insert(studyPdfExports).values({ id: randomUUID(), artifactId: input.artifactId, userId: input.user.id, inputDigest, sourceDigest: initial.sourceDigest, rendererVersion: STUDY_PDF_VERSION, status: "rendering", owner, leaseUntil: until, expiresAt: new Date(clock + 24 * 3600_000).toISOString() }).returning();
    return { row, render: true };
  });
  if (!reserved.render) return verifyBytes(reserved.row);
  try {
    const bytes = await renderStudyPdf(document, input.signal);
    input.signal?.throwIfAborted();
    return await getDb().transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('meras-study-pdf-admission'))`);
      const [lease] = await tx.select({ id: studyPdfExports.id }).from(studyPdfExports).where(and(eq(studyPdfExports.id, reserved.row.id), eq(studyPdfExports.owner, owner), eq(studyPdfExports.status, "rendering"), gt(studyPdfExports.leaseUntil, sql`clock_timestamp()`))).for("update");
      if (!lease) throw new StudyPdfError("PDF_LEASE_LOST");
      const [user] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, input.user.id), eq(users.status, "active"))).for("share");
      if (!user) throw new AiPlatformError("AI_ACCOUNT_UNAVAILABLE", "الحساب غير متاح.", 403);
      if (initial.artifact.conversationId) await tx.select({ id: aiConversations.id }).from(aiConversations).where(eq(aiConversations.id, initial.artifact.conversationId)).for("share");
      const current = await loadStudyPdfSource(input.artifactId, input.user, input.client, tx, true);
      if (current.sourceDigest !== initial.sourceDigest) throw new StudyPdfError("PDF_SOURCE_CHANGED");
      const [row] = await tx.update(studyPdfExports).set({ status: "ready", owner: null, leaseUntil: null, data: bytes, sha256: createHash("sha256").update(bytes).digest("hex"), updatedAt: new Date().toISOString() }).where(and(eq(studyPdfExports.id, reserved.row.id), eq(studyPdfExports.owner, owner))).returning();
      return { ...verifyBytes(row), cached: false };
    });
  } catch (error) {
    await getDb().update(studyPdfExports).set({ status: "failed", owner: null, leaseUntil: null, data: null, sha256: null, errorCode: error instanceof StudyPdfError ? error.code : "PDF_ACCESS_REVOKED", updatedAt: new Date().toISOString() }).where(and(eq(studyPdfExports.id, reserved.row.id), eq(studyPdfExports.owner, owner))).catch(() => undefined);
    throw error;
  }
}
