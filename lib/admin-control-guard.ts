import { jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { AdminMfaError, requireAdminStepUp } from "@/lib/admin-mfa";

/** Human administrative operations never accept the machine/admin API token. */
export async function adminControlGuard(request: Request, mutation = false) {
  const user = await getSessionUser(request);
  if (!roleAllowed(user, ["admin"]) || !user) return { user: null, response: jsonError("غير مصرح بإدارة هذه البيانات", 403) };
  if (mutation && !sameOriginRequest(request)) return { user: null, response: jsonError("تعذر التحقق من مصدر الطلب", 403) };
  if (!await checkRateLimit(mutation ? "admin-control-write" : "admin-control-read", `user:${user.id}`, mutation ? 50 : 120, 60)) return { user: null, response: jsonError("طلبات كثيرة. حاول بعد دقيقة.", 429) };
  if (mutation) {
    try { await requireAdminStepUp(request, user); }
    catch (error) { return { user: null, response: error instanceof AdminMfaError ? jsonError(error.message, error.status, error.code) : jsonError("مطلوب تحقق إداري إضافي", 403) }; }
  }
  return { user, response: null };
}
