import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser, sameOriginRequest, checkRateLimit, verifyPassword } from "@/lib/auth";
import { AdminMfaError, adminMfaConfigured, beginAdminTotpSetup } from "@/lib/admin-mfa";
import { accountMfaStatus, auditMfa, changeAccountMfa } from "@/lib/account-mfa";
import { readBoundedJsonObject, RequestBodyTooLargeError } from "@/lib/request-body";
import { jsonError } from "@/lib/api";
const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجل الدخول أولًا", 401);
  return Response.json({ ...await accountMfaStatus(user.id), available: adminMfaConfigured() }, { headers });
}
export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجل الدخول أولًا", 401);
  if (!await checkRateLimit("account-mfa-manage", String(user.id), 8, 300)) return jsonError("محاولات كثيرة؛ حاول بعد خمس دقائق", 429);
  try {
    const payload = await readBoundedJsonObject(request, 4096);
    const password = typeof payload.password === "string" ? payload.password : "";
    const code = typeof payload.code === "string" ? payload.code.trim() : "";
    const [account] = await getDb().select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id));
    if (!account?.passwordHash) return jsonError("عيّن كلمة مرور للحساب من إعدادات الأمان أو استعادة كلمة المرور أولًا", 409, "PASSWORD_REQUIRED");
    if (password.length > 128 || !await verifyPassword(password, account.passwordHash)) return jsonError("كلمة المرور الحالية غير صحيحة", 403);
    if (payload.action === "setup") {
      const setup = await beginAdminTotpSetup(user);
      await auditMfa(user, request, "setup");
      return Response.json({ ok: true, ...setup }, { headers });
    }
    if (!/^\d{6}$/.test(code)) return jsonError("أدخل الرمز المكوّن من ستة أرقام");
    if (payload.action === "verify" || payload.action === "recovery" || payload.action === "disable") {
      return Response.json(await changeAccountMfa(user, request, code, payload.action), { headers });
    }
    return jsonError("إجراء غير معروف");
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return jsonError(error.message, 413);
    if (error instanceof SyntaxError || error instanceof TypeError) return jsonError("بيانات الطلب غير صالحة", 400);
    if (error instanceof AdminMfaError) return jsonError(error.message, error.status, error.code);
    return jsonError("تعذر تعديل إعداد الأمان. لم تتغير بيانات النموذج", 500);
  }
}
