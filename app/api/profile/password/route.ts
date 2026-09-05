import { readBoundedJsonObject } from "@/lib/request-body";
import { and, eq, isNull, ne } from "drizzle-orm";
import { authSessions, emailVerificationCodes, passwordResetTokens, pushDevices, users } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, hashOpaqueToken, hashPassword, requestSessionToken, sameOriginRequest, validPassword } from "@/lib/auth";
import { isNativeAppRequest } from "@/lib/mobile-api";
import { consumeEmailCode, EmailCodeError, requestEmailCode } from "@/lib/email-verification";
import { EmailDeliveryError } from "@/lib/transactional-email";

export async function POST(request: Request) {
  if (!sameOriginRequest(request) && !isNativeAppRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول أولًا", 401);
  if (!await checkRateLimit("change-password", `user:${user.id}`, 6, 15 * 60)) return jsonError("محاولات كثيرة. حاول بعد قليل.", 429);
  let payload: Record<string, unknown>;
  try { payload = await readBoundedJsonObject(request); } catch { return jsonError("بيانات غير صالحة"); }
  if (payload.action === "send") {
    try { return Response.json(await requestEmailCode(user.id, "change_password", request), { headers: { "cache-control": "no-store" } }); }
    catch (error) { return error instanceof EmailCodeError || error instanceof EmailDeliveryError ? jsonError(error.message, error.status, error.code) : jsonError("تعذر إرسال الرمز حاليًا", 503); }
  }
  if (payload.action !== "confirm") return jsonError("أرسل رمز التحقق إلى بريدك أولًا ثم أدخله لتغيير كلمة المرور.", 400, "EMAIL_CODE_REQUIRED");
  const newPassword = typeof payload.newPassword === "string" ? payload.newPassword : "";
  if (!validPassword(newPassword)) return jsonError("كلمة المرور الجديدة يجب أن تكون 10 أحرف مع رقم ورمز خاص");
  const passwordHash = await hashPassword(newPassword);
  const token = requestSessionToken(request);
  const currentTokenHash = token ? await hashOpaqueToken(token) : "";
  try {
  const revokedSessions = await consumeEmailCode(user.id, "change_password", payload.code, request, async (tx, _row, now) => {
    await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, user.id));
    await tx.update(passwordResetTokens).set({ usedAt: now }).where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
    await tx.update(emailVerificationCodes).set({ usedAt: now }).where(and(eq(emailVerificationCodes.userId, user.id), isNull(emailVerificationCodes.usedAt)));
    const revoked = await tx.update(authSessions).set({ revokedAt: now }).where(and(eq(authSessions.userId, user.id), isNull(authSessions.revokedAt), currentTokenHash ? ne(authSessions.tokenHash, currentTokenHash) : undefined)).returning({ deviceId: authSessions.deviceId });
    for (const session of revoked) {
      if (session.deviceId) await tx.update(pushDevices).set({ status: "revoked", lastSeenAt: now }).where(and(eq(pushDevices.userId, user.id), eq(pushDevices.deviceId, session.deviceId)));
    }
    return revoked.length;
  });
  return Response.json({ ok: true, revokedSessions }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof EmailCodeError || error instanceof EmailDeliveryError) return jsonError(error.message, error.status, error.code);
    return jsonError("تعذر تغيير كلمة المرور حاليًا", 503);
  }
}
