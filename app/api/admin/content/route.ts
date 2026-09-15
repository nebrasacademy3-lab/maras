import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { auditLogs, platformSettings } from "@/db/schema";
import { checkRateLimit, clientIp, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { AdminMfaError, requireAdminStepUp } from "@/lib/admin-mfa";
import { INFORMATION_KEY, getInformationContent } from "@/lib/information-content";
import { validateInformation } from "@/lib/information-contract";
import { readBoundedJsonObject, RequestBodyTooLargeError } from "@/lib/request-body";
import { jsonError } from "@/lib/api";
import { enqueuePublicSeoUrls } from "@/lib/seo-indexnow";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await getSessionUser(request); if (!user || !["admin", "supervisor"].includes(user.role)) return jsonError("غير مصرح", 403);
  return Response.json(await getInformationContent(), { headers: { "cache-control": "private, no-store" } });
}
export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("مصدر غير موثوق", 403);
  const user = await getSessionUser(request); if (!user || !["admin", "supervisor"].includes(user.role)) return jsonError("غير مصرح", 403);
  if (!await checkRateLimit("public-content-write", String(user.id), 12, 60)) return jsonError("حاول بعد دقيقة", 429);
  try {
    await requireAdminStepUp(request, user);
    const payload = await readBoundedJsonObject(request, 256 * 1024);
    const content = validateInformation(payload.content);
    const now = new Date().toISOString();
    const result = await getDb().transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${INFORMATION_KEY}))`);
      const [row] = await tx.select().from(platformSettings).where(eq(platformSettings.key, INFORMATION_KEY)).limit(1);
      if ((row?.updatedAt || null) !== (payload.version || null)) return false;
      await tx.insert(platformSettings).values({ key: INFORMATION_KEY, value: JSON.stringify(content), category: "public_content", isPublic: false, updatedAt: now }).onConflictDoUpdate({ target: platformSettings.key, set: { value: JSON.stringify(content), updatedAt: now } });
      await tx.insert(auditLogs).values({ actorEmail: user.email, action: "public_content.publish", entityType: "public_information", entityId: INFORMATION_KEY, beforeJson: row?.value || null, afterJson: JSON.stringify(content), ipAddress: clientIp(request), createdAt: now });
      return true;
    });
    if (!result) return jsonError("نشر مستخدم آخر تحديثًا؛ حدّث المحتوى قبل الحفظ لحماية التغييرات", 409);
    for (const path of ["/about", "/why-maras", "/faq", "/sitemap.xml", "/llms.txt"]) revalidatePath(path);
    try { await enqueuePublicSeoUrls(["/about", "/why-maras", "/faq"]); } catch { console.error("[public-information] discovery queue delayed"); }
    return Response.json({ ok: true, version: now }, { headers: { "cache-control": "private, no-store" } });
  } catch (e) { if (e instanceof RequestBodyTooLargeError) return jsonError(e.message, 413); if (e instanceof SyntaxError) return jsonError("بيانات الطلب غير صالحة", 400); if (e instanceof AdminMfaError) return jsonError(e.message, e.status, e.code); if (e instanceof TypeError) return jsonError(e.message, 400); return jsonError("تعذر نشر المحتوى", 500); }
}
