import "server-only";

import { getDb } from "@/db";
import { courseAccess } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { getSessionUser, sameOriginRequest, type SessionUser } from "@/lib/auth";
import { activeCourseAccessWhere } from "@/lib/course-access";
import { isNativeAppRequest } from "@/lib/mobile-api";
import { contentViewModeError, getContentViewMode } from "@/lib/platform-settings";

type AuthorizedCourseResourceRequest = { ok: true; user: SessionUser; client: "app" | "web" };
type RejectedCourseResourceRequest = { ok: false; response: Response };

export async function authorizeCourseResourceRequest(request: Request, courseSlug: string): Promise<AuthorizedCourseResourceRequest | RejectedCourseResourceRequest> {
  const nativeApp = isNativeAppRequest(request);
  if (!nativeApp && !sameOriginRequest(request)) return { ok: false, response: jsonError("تعذر التحقق من مصدر الطلب", 403) };
  const user = await getSessionUser(request);
  if (!user) return { ok: false, response: jsonError("سجّل الدخول للوصول إلى ملفات المادة", 401) };
  const client = nativeApp ? "app" : "web";
  try {
    const policyError = contentViewModeError(await getContentViewMode(), client);
    if (policyError) return { ok: false, response: jsonError(policyError, 403) };
  } catch {
    return { ok: false, response: jsonError("تعذر التحقق من سياسة مشاهدة المحتوى حاليًا. حاول لاحقًا.", 503) };
  }
  const [access] = await getDb().select({ id: courseAccess.id }).from(courseAccess).where(activeCourseAccessWhere(user.email, courseSlug)).limit(1);
  if (!access) return { ok: false, response: jsonError("لا توجد صلاحية نشطة لهذه المادة", 403) };
  return { ok: true, user, client };
}

export function safeAttachmentDisposition(originalName: string) {
  const normalized = originalName.replace(/[\r\n]/g, " ").replace(/[\\/]/g, "_").trim().slice(0, 180) || "course-file";
  const ascii = normalized.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/[\"\\]/g, "_") || "course-file";
  const encoded = encodeURIComponent(normalized).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
