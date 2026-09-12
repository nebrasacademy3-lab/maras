import { createHash } from "node:crypto";
import { count, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, platformSettings } from "@/db/schema";
import { checkRateLimit, clientIp, getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { readBoundedJsonObject, RequestBodyTooLargeError } from "@/lib/request-body";
import { getPublicSeoPages } from "@/lib/seo-catalog";
import { googleSiteVerification, bingSiteVerification, publicPageMetadata, searchIndexingEnabled, seoSiteOrigin } from "@/lib/seo";
import { parseSeoOverride, seoOverrideKey } from "@/lib/seo-settings";
import { validateSeoOverride } from "@/lib/seo-pages";
import { dispatchSeoIndexNow, enqueuePublicSeoUrls, indexNowConfig } from "@/lib/seo-indexnow";
import { AdminMfaError, requireAdminStepUp } from "@/lib/admin-mfa";

export const dynamic = "force-dynamic";
const CATEGORY = "seo_metadata";
function revision(row?: { value: string; updatedAt: string }) { return row ? createHash("sha256").update(row.value + "\0" + row.updatedAt).digest("hex") : null; }
function response(value: unknown, status = 200) { return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } }); }
async function authorize(request: Request, write = false) {
  const user = await getSessionUser(request);
  if (!roleAllowed(user, ["admin"])) return null;
  if (write && !sameOriginRequest(request)) return null;
  if (!await checkRateLimit(write ? "seo-write" : "seo-read", `user:${user!.id}`, write ? 20 : 60, 60)) return false;
  return user!;
}
export async function GET(request: Request) {
  const user = await authorize(request);
  if (user === false) return jsonError("طلبات كثيرة، حاول بعد دقيقة.", 429);
  if (!user) return jsonError("غير مصرح", 403);
  try {
    const params = new URL(request.url).searchParams;
    const query = (params.get("q") || "").trim().slice(0, 120).toLocaleLowerCase("ar");
    const pageNumber = Math.max(1, Math.min(100000, Math.floor(Number(params.get("page"))) || 1));
    const pages = await getPublicSeoPages();
    const [rows, queue] = await Promise.all([
      getDb().select({ key: platformSettings.key, value: platformSettings.value, updatedAt: platformSettings.updatedAt }).from(platformSettings).where(eq(platformSettings.category, CATEGORY)),
      getDb().select({ total: count() }).from(platformSettings).where(eq(platformSettings.category, "seo_indexnow")),
    ]);
    const byKey = new Map(rows.map((row) => [row.key, row]));
    const output = pages.map((page) => {
      const row = byKey.get(seoOverrideKey(page.path)), override = parseSeoOverride(row?.value);
      const metadata = publicPageMetadata(page.path, override?.title || page.title, override?.description || page.description, { image: page.image });
      return { ...page, defaultTitle: page.title, defaultDescription: page.description, title: metadata.title, description: metadata.description, canonical: metadata.alternates?.canonical, override: override || { title: "", description: "" }, version: revision(row), eligible: searchIndexingEnabled() };
    });
    const titles = new Map<string, number>();
    for (const page of output) titles.set(String(page.title), (titles.get(String(page.title)) || 0) + 1);
    const filtered = output.filter((page) => `${page.path} ${page.title} ${page.kind}`.toLocaleLowerCase("ar").includes(query));
    return response({ pages: filtered.slice((pageNumber - 1) * 30, pageNumber * 30).map((page) => ({ ...page, duplicateTitle: (titles.get(String(page.title)) || 0) > 1 })), total: filtered.length, publicTotal: output.length, page: pageNumber, pageSize: 30, health: { origin: seoSiteOrigin(), indexingEnabled: searchIndexingEnabled(), googleVerifiedMetaConfigured: Boolean(googleSiteVerification()), bingVerifiedMetaConfigured: Boolean(bingSiteVerification()), indexNowEnabled: indexNowConfig().enabled, indexNowQueued: queue[0]?.total || 0, searchBots: ["Googlebot", "Bingbot", "OAI-SearchBot", "PerplexityBot"] } });
  } catch { return jsonError("تعذر تحميل فحص SEO. تحقق من اتصال قاعدة البيانات.", 503); }
}
export async function POST(request: Request) {
  const user = await authorize(request, true);
  if (user === false) return jsonError("طلبات كثيرة، حاول بعد دقيقة.", 429);
  if (!user) return jsonError("غير مصرح", 403);
  let input: Record<string, unknown>;
  try { input = await readBoundedJsonObject(request, 8192); }
  catch (error) { return jsonError(error instanceof RequestBodyTooLargeError ? "حجم الطلب أكبر من المسموح" : "بيانات الطلب غير صالحة", error instanceof RequestBodyTooLargeError ? 413 : 400); }
  try {
    if (input.action === "dispatch") {
      await requireAdminStepUp(request, user);
      return response(await dispatchSeoIndexNow());
    }
    if (input.action !== "save" || Object.keys(input).some((key) => !["action", "path", "title", "description", "version"].includes(key))) return jsonError("عملية SEO غير صالحة");
    if (typeof input.path !== "string" || !(input.version === null || typeof input.version === "string")) return jsonError("معرّف الصفحة أو إصدارها غير صالح");
    const override = validateSeoOverride({ title: input.title, description: input.description });
    const path = input.path;
    const page = (await getPublicSeoPages()).find((item) => item.path === path);
    if (!page) return jsonError("الصفحة غير منشورة أو غير مؤهلة للتحرير هنا", 404);
    const key = seoOverrideKey(path), value = JSON.stringify(override), now = new Date().toISOString();
    const result = await getDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
      const [before] = await tx.select().from(platformSettings).where(eq(platformSettings.key, key)).limit(1);
      if (revision(before) !== input.version) return null;
      await tx.insert(platformSettings).values({ key, value, category: CATEGORY, isPublic: false, updatedBy: user.email, updatedAt: now }).onConflictDoUpdate({ target: platformSettings.key, set: { value, category: CATEGORY, isPublic: false, updatedBy: user.email, updatedAt: now } });
      await tx.insert(auditLogs).values({ actorEmail: user.email, action: "update", entityType: "seo_metadata", entityId: path, beforeJson: before?.value || null, afterJson: value, ipAddress: clientIp(request).slice(0, 80) });
      return { version: revision({ value, updatedAt: now }) };
    });
    if (!result) return jsonError("تم تعديل بيانات الصفحة من جلسة أخرى. حدّث القائمة قبل الحفظ.", 409);
    let queued = false;
    try { queued = (await enqueuePublicSeoUrls([path])).queued > 0; } catch { console.error("[seo] Metadata saved; discovery queue unavailable"); }
    return response({ ok: true, ...result, queued });
  } catch (error) {
    if (error instanceof AdminMfaError) return response({ error: error.message, code: error.code }, error.status);
    if (error instanceof TypeError) return jsonError(error.message);
    console.error("[seo] Administrative metadata operation failed");
    return jsonError("تعذر حفظ بيانات SEO. حاول مرة أخرى.", 503);
  }
}
