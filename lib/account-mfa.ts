import { createHash, randomBytes } from "node:crypto";
import { and, count, desc, eq, gt, isNull, lt, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accountMfaChallenges, accountMfaRecoveryCodes, adminMfaFactors, auditLogs, authSessions } from "@/db/schema";
import { browserDeviceCookie, checkRateLimit, clientIp, createOpaqueToken, hashOpaqueToken, requestSessionToken, sessionDeviceIdentity, type SessionUser } from "@/lib/auth";
import { AdminMfaError, consumeTotp, decryptAdminMfaSecret, matchedTotpCounter } from "@/lib/admin-mfa";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
export type LoginMfaProof = { challengeToken: string; code: string };
export const MFA_CHALLENGE_COOKIE = "meras_mfa_challenge";
const MAX_AGE = 5 * 60;
export function recoveryHash(code: string) {
  return createHash("sha256").update(code.replace(/[-\s]/g, "").toUpperCase()).digest("hex");
}
export async function accountMfaStatus(userId: number) {
  const [factors, remaining] = await Promise.all([
    getDb().select({ id: adminMfaFactors.id, verifiedAt: adminMfaFactors.verifiedAt }).from(adminMfaFactors).where(and(eq(adminMfaFactors.userId, userId), eq(adminMfaFactors.type, "totp"), isNull(adminMfaFactors.disabledAt))).orderBy(desc(adminMfaFactors.id)),
    getDb().select({ total: count() }).from(accountMfaRecoveryCodes).where(and(eq(accountMfaRecoveryCodes.userId, userId), isNull(accountMfaRecoveryCodes.usedAt))),
  ]);
  return { enabled: factors.some(factor => Boolean(factor.verifiedAt)), pendingSetup: factors.some(factor => !factor.verifiedAt), recoveryCodesRemaining: Number(remaining[0]?.total || 0) };
}
export function challengeCookie(token: string) {
  const secure = process.env.NODE_ENV === "production" || process.env.SESSION_COOKIE_SECURE === "true";
  return `${MFA_CHALLENGE_COOKIE}=${encodeURIComponent(token)}; Path=/api/auth/mfa; HttpOnly;${secure ? " Secure;" : ""} SameSite=Lax; Max-Age=${token ? MAX_AGE : 0}`;
}
export function readChallengeCookie(request: Request) {
  for (const entry of (request.headers.get("cookie") || "").split(";")) {
    const [key, ...parts] = entry.trim().split("=");
    if (key === MFA_CHALLENGE_COOKIE) { try { return decodeURIComponent(parts.join("=")); } catch { return ""; } }
  }
  return "";
}
/** Must be called only after password or OAuth primary authentication succeeds. */
export async function beginLoginMfa(userId: number, request: Request, remember = true) {
  const status = await accountMfaStatus(userId);
  if (!status.enabled) return null;
  if (!await checkRateLimit("mfa-challenge-start", String(userId), 10, 300)) throw new AdminMfaError("MFA_RATE_LIMITED", "محاولات كثيرة؛ حاول بعد قليل", 429);
  const token = createOpaqueToken();
  const device = await sessionDeviceIdentity(request);
  const expiresAt = new Date(Date.now() + MAX_AGE * 1000).toISOString();
  await getDb().delete(accountMfaChallenges).where(and(eq(accountMfaChallenges.userId, userId), lt(accountMfaChallenges.expiresAt, new Date().toISOString())));
  await getDb().insert(accountMfaChallenges).values({ tokenHash: await hashOpaqueToken(token), userId, deviceId: device.deviceId, remember, expiresAt });
  return { mfaRequired: true as const, challengeToken: token, expiresAt, deviceCookie: browserDeviceCookie(request, device.deviceId), cookie: challengeCookie(token) };
}
/** Executed inside createSession's per-account lock. Challenge, factor/code and session commit together. */
export async function verifyLoginMfaTx(tx: Tx, userId: number, deviceId: string, proof: LoginMfaProof | undefined, remember: boolean) {
  const [factor] = await tx.select().from(adminMfaFactors).where(and(eq(adminMfaFactors.userId, userId), eq(adminMfaFactors.type, "totp"), isNull(adminMfaFactors.disabledAt), sql`${adminMfaFactors.verifiedAt} IS NOT NULL`)).orderBy(desc(adminMfaFactors.id)).limit(1);
  if (!factor) {
    if (proof) throw new AdminMfaError("MFA_CHALLENGE_INVALID", "تغيّر إعداد الأمان. ابدأ تسجيل الدخول مجددًا", 401);
    return false;
  }
  if (!proof || !/^[A-Za-z0-9_-]{40,128}$/.test(proof.challengeToken)) throw new AdminMfaError("MFA_LOGIN_REQUIRED", "يجب إكمال المصادقة الإضافية قبل تسجيل الدخول", 401);
  const now = new Date().toISOString();
  const tokenHash = await hashOpaqueToken(proof.challengeToken);
  const [challenge] = await tx.select().from(accountMfaChallenges).where(and(eq(accountMfaChallenges.tokenHash, tokenHash), eq(accountMfaChallenges.userId, userId), eq(accountMfaChallenges.deviceId, deviceId), eq(accountMfaChallenges.remember, remember), isNull(accountMfaChallenges.usedAt), gt(accountMfaChallenges.expiresAt, now))).for("update");
  if (!challenge) throw new AdminMfaError("MFA_CHALLENGE_INVALID", "انتهت محاولة الدخول أو سبق استخدامها. ابدأ مجددًا", 401);
  const code = proof.code.trim();
  if (/^\d{6}$/.test(code)) {
    if (!factor.secretEncrypted) throw new AdminMfaError("MFA_FACTOR_INVALID", "تعذر قراءة إعداد الأمان؛ تواصل مع الدعم", 503);
    const counter = matchedTotpCounter(decryptAdminMfaSecret(factor.secretEncrypted), code, factor.counter);
    if (counter === null) throw new AdminMfaError("MFA_CODE_INVALID", "رمز المصادقة غير صحيح أو سبق استخدامه. استخدم الرمز التالي", 400);
    await tx.update(adminMfaFactors).set({ counter, updatedAt: now }).where(eq(adminMfaFactors.id, factor.id));
  } else {
    if (!/^[a-fA-F0-9\s-]{20,28}$/.test(code) || code.replace(/[-\s]/g, "").length !== 20) throw new AdminMfaError("MFA_CODE_INVALID", "رمز الاستعادة غير صالح", 400);
    const consumed = await tx.update(accountMfaRecoveryCodes).set({ usedAt: now }).where(and(eq(accountMfaRecoveryCodes.userId, userId), eq(accountMfaRecoveryCodes.codeHash, recoveryHash(code)), isNull(accountMfaRecoveryCodes.usedAt))).returning({ id: accountMfaRecoveryCodes.id });
    if (!consumed.length) throw new AdminMfaError("MFA_CODE_INVALID", "رمز الاستعادة غير صحيح أو سبق استخدامه", 400);
  }
  await tx.update(accountMfaChallenges).set({ usedAt: now }).where(eq(accountMfaChallenges.tokenHash, tokenHash));
  return true;
}
export async function issueRecoveryCodes(user: SessionUser) {
  const codes = Array.from({ length: 10 }, () => randomBytes(10).toString("hex").toUpperCase().match(/.{1,5}/g)!.join("-"));
  await getDb().transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${user.id})`);
    await tx.delete(accountMfaRecoveryCodes).where(eq(accountMfaRecoveryCodes.userId, user.id));
    await tx.insert(accountMfaRecoveryCodes).values(codes.map(code => ({ userId: user.id, codeHash: recoveryHash(code) })));
  });
  return codes;
}
/** Preserve the session that enrolled MFA and invalidate all other existing credentials. */
export async function secureEnrolledSession(user: SessionUser, request: Request) {
  const tokenHash = await hashOpaqueToken(requestSessionToken(request));
  const now = new Date().toISOString();
  await getDb().transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${user.id})`);
    await tx.update(authSessions).set({ mfaVerifiedAt: now }).where(and(eq(authSessions.userId, user.id), eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt)));
    await tx.update(authSessions).set({ revokedAt: now }).where(and(eq(authSessions.userId, user.id), ne(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt)));
    await tx.update(accountMfaChallenges).set({ usedAt: now }).where(and(eq(accountMfaChallenges.userId, user.id), isNull(accountMfaChallenges.usedAt)));
  });
}
export async function auditMfa(user: SessionUser, request: Request, action: string) {
  await getDb().insert(auditLogs).values({ actorEmail: user.email, action: `account.mfa.${action}`, entityType: "account_security", entityId: String(user.id), ipAddress: clientIp(request), afterJson: JSON.stringify({ action }) });
}

/** User verification, recovery rotation and session invalidation are one transaction. */
export async function changeAccountMfa(user: SessionUser, request: Request, code: string, action: "verify" | "recovery" | "disable") {
  const tokenHash = await hashOpaqueToken(requestSessionToken(request));
  const codes = action === "disable" ? [] : Array.from({ length: 10 }, () => randomBytes(10).toString("hex").toUpperCase().match(/.{1,5}/g)!.join("-"));
  await consumeTotp(user, code, action !== "verify", action === "recovery" ? null : action, async (tx, now) => {
    const current = await tx.select({ id: authSessions.id }).from(authSessions).where(and(eq(authSessions.userId, user.id), eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, now))).limit(1);
    if (!current.length) throw new AdminMfaError("SESSION_REQUIRED", "انتهت جلسة الحساب؛ سجّل الدخول مجددًا", 401);
    await tx.delete(accountMfaRecoveryCodes).where(eq(accountMfaRecoveryCodes.userId, user.id));
    if (codes.length) await tx.insert(accountMfaRecoveryCodes).values(codes.map(value => ({ userId: user.id, codeHash: recoveryHash(value), createdAt: now })));
    if (action !== "recovery") {
      await tx.update(authSessions).set({ mfaVerifiedAt: now }).where(eq(authSessions.id, current[0].id));
      await tx.update(authSessions).set({ revokedAt: now }).where(and(eq(authSessions.userId, user.id), ne(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt)));
    }
    await tx.update(accountMfaChallenges).set({ usedAt: now }).where(and(eq(accountMfaChallenges.userId, user.id), isNull(accountMfaChallenges.usedAt)));
    await tx.insert(auditLogs).values({ actorEmail: user.email, action: `account.mfa.${action === "verify" ? "enabled" : action === "disable" ? "disabled" : "recovery-regenerated"}`, entityType: "account_security", entityId: String(user.id), ipAddress: clientIp(request), afterJson: JSON.stringify({ action }), createdAt: now });
  });
  return { ok: true, ...(action === "disable" ? { enabled: false } : { enabled: true, recoveryCodes: codes }) };
}
