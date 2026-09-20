import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { accountMfaChallenges, users } from "@/db/schema";
import { checkRateLimit, clientIp, createSession, DeviceLimitError, hashOpaqueToken, sameOriginRequest, sessionUserFromRow } from "@/lib/auth";
import { AdminMfaError } from "@/lib/admin-mfa";
import { auditMfa, challengeCookie, readChallengeCookie } from "@/lib/account-mfa";
import { accountNext } from "@/lib/account-readiness";
import { jsonError } from "@/lib/api";
import { readBoundedJsonObject, RequestBodyTooLargeError } from "@/lib/request-body";

const noStore = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
export async function completeMfaLogin(request: Request, mobile = false) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  if (!await checkRateLimit("mfa-login-ip", clientIp(request), 100, 300)) return jsonError("محاولات كثيرة؛ حاول بعد قليل", 429);
  try {
    const payload = await readBoundedJsonObject(request, 4096);
    const challengeToken = typeof payload.challengeToken === "string" ? payload.challengeToken : readChallengeCookie(request);
    const code = typeof payload.code === "string" ? payload.code.trim() : "";
    if (!/^[A-Za-z0-9_-]{40,128}$/.test(challengeToken) || code.length > 28) return jsonError("محاولة دخول غير صالحة. ابدأ مجددًا", 401);
    const tokenHash = await hashOpaqueToken(challengeToken);
    const db = getDb(); const now = new Date().toISOString();
    const [challenge] = await db.select().from(accountMfaChallenges).where(and(eq(accountMfaChallenges.tokenHash, tokenHash), isNull(accountMfaChallenges.usedAt), gt(accountMfaChallenges.expiresAt, now))).limit(1);
    if (!challenge) return jsonError("انتهت محاولة الدخول أو سبق استخدامها. ابدأ مجددًا", 401);
    if (!await checkRateLimit("mfa-login-challenge", tokenHash, 8, 300) || !await checkRateLimit("mfa-login-account", String(challenge.userId), 12, 300)) return jsonError("محاولات كثيرة؛ حاول بعد خمس دقائق", 429);
    const session = await createSession(challenge.userId, request, challenge.remember, { challengeToken, code });
    const [account] = await db.select().from(users).where(eq(users.id, challenge.userId));
    const user = sessionUserFromRow(account);
    await auditMfa(user, request, "login");
    const headers = new Headers(noStore);
    if (!mobile) { headers.append("set-cookie", session.cookie); headers.append("set-cookie", session.deviceCookie); headers.append("set-cookie", challengeCookie("")); }
    return Response.json({ ok: true, user, next: accountNext(user, mobile), ...(mobile ? { token: session.token, expiresAt: session.expiresAt } : {}) }, { headers });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return jsonError(error.message, 413);
    if (error instanceof SyntaxError || error instanceof TypeError) return jsonError("بيانات التحقق غير صالحة", 400);
    if (error instanceof AdminMfaError) return jsonError(error.message, error.status, error.code);
    if (error instanceof DeviceLimitError) return jsonError(error.userMessage, error.status, error.code);
    return jsonError("تعذر إكمال تسجيل الدخول", 500);
  }
}
