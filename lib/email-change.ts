import "server-only";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { isUniqueConstraintError } from "@/lib/api";
import { accountMfaChallenges, auditLogs, authSessions, emailChangeRequests, emailVerificationCodes, oauthExchanges, passwordResetTokens, pushDevices, users } from "@/db/schema";
import { checkRateLimit, clientIp, hashOpaqueToken, requestSessionToken, validEmail, verifyPassword } from "@/lib/auth";
import { EmailDeliveryError, emailDeliveryConfigured, sendTransactionalEmail } from "@/lib/transactional-email";

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type EmailChangeTarget = "current" | "new";

export const EMAIL_CHANGE_TTL_SECONDS = 10 * 60;
export const EMAIL_CHANGE_MAX_ATTEMPTS = 5;

/** Enable only after legacy ownership migration and ID acceptance are verified. */
export function emailChangeEnabled() {
  return process.env.EMAIL_CHANGE_ENABLED === "true";
}

function requireEmailChangeEnabled() {
  if (!emailChangeEnabled()) throw new EmailChangeError("تغيير البريد غير متاح حاليًا. تواصل مع الدعم لتصحيح بيانات الحساب.", "EMAIL_CHANGE_NOT_ENABLED", 503);
}

async function sessionHash(request: Request) {
  const token = requestSessionToken(request);
  return token ? hashOpaqueToken(token) : "";
}

async function requireCurrentSession(tx: Transaction, userId: number, tokenHash: string) {
  if (!tokenHash) throw new EmailChangeError("انتهت الجلسة. سجّل الدخول مجددًا.", "SESSION_EXPIRED", 401);
  const [session] = await tx.select({ id: authSessions.id }).from(authSessions).where(and(
    eq(authSessions.userId, userId), eq(authSessions.tokenHash, tokenHash),
    isNull(authSessions.revokedAt), gt(authSessions.expiresAt, new Date().toISOString()),
  )).limit(1).for("update");
  if (!session) throw new EmailChangeError("انتهت الجلسة. سجّل الدخول مجددًا.", "SESSION_EXPIRED", 401);
}

export class EmailChangeError extends Error {
  constructor(message: string, readonly code = "EMAIL_CHANGE_INVALID", readonly status = 400) {
    super(message);
    this.name = "EmailChangeError";
  }
}

function verificationSecret() {
  const secret = process.env.SESSION_SECRET?.trim() || "";
  if (secret.length < 32 || /(?:replace[-_ ]?with|change[-_ ]?me|example[-_ ]?secret)/i.test(secret)) {
    throw new EmailChangeError("التحقق من تغيير البريد غير مهيأ بأمان على الخادم.", "EMAIL_CHANGE_NOT_CONFIGURED", 503);
  }
  return secret;
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeCode(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim()
    .replace(/[٠-٩]/g, (character) => String(character.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (character) => String(character.charCodeAt(0) - 0x6f0));
}

function hashCode(userId: number, email: string, target: EmailChangeTarget, nonce: string, code: string, salt = randomBytes(16).toString("hex")) {
  const digest = createHmac("sha256", verificationSecret())
    .update([String(userId), email, target, nonce, salt, code].join("|"))
    .digest("hex");
  return salt + "." + digest;
}

function matchesCode(userId: number, email: string, target: EmailChangeTarget, nonce: string, code: string, stored: string) {
  const [salt, digest] = stored.split(".");
  if (!/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{64}$/.test(digest || "")) return false;
  const actual = hashCode(userId, email, target, nonce, code, salt);
  return actual.length === stored.length && timingSafeEqual(Buffer.from(actual), Buffer.from(stored));
}

async function latestRequest(db: ReturnType<typeof getDb> | Transaction, userId: number) {
  const [row] = await db.select()
    .from(emailChangeRequests)
    .where(and(eq(emailChangeRequests.userId, userId), isNull(emailChangeRequests.usedAt)))
    .orderBy(desc(emailChangeRequests.id))
    .limit(1);
  return row;
}

export async function emailChangeStatus(userId: number, currentEmail = "") {
  if (!emailChangeEnabled()) return { enabled: false, active: false, currentEmail: normalizeEmail(currentEmail), newEmail: "", currentVerified: false, newVerified: false, expiresInSeconds: 0 };
  const row = await latestRequest(getDb(), userId);
  const active = Boolean(row && !row.usedAt && Number.isFinite(Date.parse(row.expiresAt)) && Date.parse(row.expiresAt) > Date.now());
  if (!active || !row) return { enabled: true, active: false, currentEmail: normalizeEmail(currentEmail), newEmail: "", currentVerified: false, newVerified: false, expiresInSeconds: 0 };
  return {
    enabled: true,
    active: true,
    deliveryPending: !row.currentSentAt || !row.newSentAt,
    currentEmail: row.currentEmail,
    newEmail: row.newEmail,
    currentVerified: Boolean(row.currentVerifiedAt),
    newVerified: Boolean(row.newVerifiedAt),
    expiresInSeconds: Math.max(0, Math.ceil((Date.parse(row.expiresAt) - Date.now()) / 1000)),
  };
}

export async function requestEmailChange(userId: number, requestedEmail: unknown, currentPassword: unknown, request: Request) {
  requireEmailChangeEnabled();
  const tokenHash = await sessionHash(request);
  if (!emailDeliveryConfigured()) throw new EmailDeliveryError(false);
  verificationSecret();
  const newEmail = normalizeEmail(requestedEmail);
  if (!validEmail(newEmail)) throw new EmailChangeError("أدخل بريدًا إلكترونيًا صالحًا.", "EMAIL_CHANGE_EMAIL_INVALID", 400);
  if (!await checkRateLimit("email-change-request", "user:" + userId, 3, 60 * 60) || !await checkRateLimit("email-change-request-ip", clientIp(request), 20, 60 * 60)) {
    throw new EmailChangeError("وصلت إلى حد طلبات تغيير البريد. حاول لاحقًا.", "EMAIL_CHANGE_RATE_LIMIT", 429);
  }
  const password = typeof currentPassword === "string" ? currentPassword : "";
  const now = new Date().toISOString();
  const db = getDb();
  const issued = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId})`);
    await requireCurrentSession(tx, userId, tokenHash);
    const [user] = await tx.select().from(users).where(and(eq(users.id, userId), eq(users.status, "active"))).limit(1).for("update");
    if (!user) throw new EmailChangeError("الحساب غير متاح.", "ACCOUNT_UNAVAILABLE", 401);
    const currentEmail = normalizeEmail(user.email);
    if (!user.emailVerifiedAt) throw new EmailChangeError("أكد بريدك الحالي قبل طلب تغييره.", "CURRENT_EMAIL_UNVERIFIED", 403);
    if (user.passwordHash && !await verifyPassword(password, user.passwordHash)) throw new EmailChangeError("كلمة المرور الحالية غير صحيحة.", "CURRENT_PASSWORD_INVALID", 403);
    if (newEmail === currentEmail) throw new EmailChangeError("استخدم بريدًا مختلفًا عن بريدك الحالي.", "EMAIL_CHANGE_SAME_EMAIL", 400);
    const [taken] = await tx.select({ id: users.id }).from(users).where(and(
      ne(users.id, userId),
      sql`lower(${users.email}) = lower(${newEmail})`,
    )).limit(1);
    if (taken) throw new EmailChangeError("هذا البريد مستخدم في حساب آخر.", "EMAIL_CHANGE_EMAIL_TAKEN", 409);
    await tx.update(emailChangeRequests).set({ usedAt: now }).where(and(eq(emailChangeRequests.userId, userId), isNull(emailChangeRequests.usedAt)));
    const nonce = randomBytes(24).toString("hex");
    const currentCode = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const newCode = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TTL_SECONDS * 1000).toISOString();
    const [challenge] = await tx.insert(emailChangeRequests).values({
      userId,
      currentEmail,
      newEmail,
      challengeNonce: nonce,
      currentCodeHash: hashCode(userId, currentEmail, "current", nonce, currentCode),
      newCodeHash: hashCode(userId, newEmail, "new", nonce, newCode),
      expiresAt,
      createdAt: now,
    }).returning({ id: emailChangeRequests.id });
    return { id: challenge.id, currentEmail, newEmail, currentCode, newCode, expiresAt };
  });
  try {
    await Promise.all([
      sendTransactionalEmail({
        to: issued.currentEmail,
        subject: "تأكيد طلب تغيير بريدك — مراس العلم",
        text: "تم طلب تغيير بريد حسابك. رمز تأكيد ملكية البريد الحالي هو: " + issued.currentCode + ". صالح لمدة 10 دقائق ولمرة واحدة.",
        security: { kind: "verify-email", code: issued.currentCode },
        idempotencyKey: "email-change-current-" + issued.id,
      }),
      sendTransactionalEmail({
        to: issued.newEmail,
        subject: "تأكيد بريدك الجديد — مراس العلم",
        text: "تم طلب استخدام هذا البريد في حساب مراس العلم. رمز تأكيد البريد الجديد هو: " + issued.newCode + ". صالح لمدة 10 دقائق ولمرة واحدة.",
        security: { kind: "verify-email", code: issued.newCode },
        idempotencyKey: "email-change-new-" + issued.id,
      }),
    ]);
  } catch (error) {
    await db.update(emailChangeRequests).set({ usedAt: new Date().toISOString() }).where(and(eq(emailChangeRequests.id, issued.id), isNull(emailChangeRequests.usedAt)));
    throw error;
  }
  const sentAt = new Date().toISOString();
  const sent = await db.update(emailChangeRequests).set({ currentSentAt: sentAt, newSentAt: sentAt })
    .where(and(eq(emailChangeRequests.id, issued.id), isNull(emailChangeRequests.usedAt), gt(emailChangeRequests.expiresAt, sentAt)))
    .returning({ id: emailChangeRequests.id });
  if (!sent.length) throw new EmailChangeError("أُلغي الطلب أو انتهت مدته أثناء الإرسال. ابدأ طلبًا جديدًا.", "EMAIL_CHANGE_STALE", 409);
  return { ok: true, active: true, currentEmail: issued.currentEmail, newEmail: issued.newEmail, currentVerified: false, newVerified: false, expiresInSeconds: Math.max(0, Math.ceil((Date.parse(issued.expiresAt) - Date.now()) / 1000)) };
}

export async function verifyEmailChange(userId: number, target: EmailChangeTarget, supplied: unknown, request: Request) {
  requireEmailChangeEnabled();
  if (target !== "current" && target !== "new") throw new EmailChangeError("جهة الرمز غير صالحة.", "EMAIL_CHANGE_TARGET_INVALID", 400);
  const code = normalizeCode(supplied);
  if (!await checkRateLimit("email-change-verify-" + target, "user:" + userId, 15, 15 * 60) || !await checkRateLimit("email-change-verify-ip", clientIp(request), 100, 15 * 60)) {
    throw new EmailChangeError("محاولات كثيرة. حاول لاحقًا.", "EMAIL_CHANGE_RATE_LIMIT", 429);
  }
  const tokenHash = await sessionHash(request);
  const result = await getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId})`);
    await requireCurrentSession(tx, userId, tokenHash);
    const [user] = await tx.select().from(users).where(and(eq(users.id, userId), eq(users.status, "active"))).limit(1).for("update");
    const challenge = await latestRequest(tx, userId);
    const now = new Date().toISOString();
    if (!user || !challenge || !challenge.currentSentAt || !challenge.newSentAt || challenge.usedAt || !Number.isFinite(Date.parse(challenge.expiresAt)) || Date.parse(challenge.expiresAt) <= Date.now()) return { kind: "invalid" as const };
    if (normalizeEmail(user.email) !== challenge.currentEmail) {
      await tx.update(emailChangeRequests).set({ usedAt: now }).where(eq(emailChangeRequests.id, challenge.id));
      return { kind: "stale" as const };
    }
    if (target === "current" ? challenge.currentVerifiedAt : challenge.newVerifiedAt) {
      return { kind: "verified" as const, currentVerified: Boolean(challenge.currentVerifiedAt), newVerified: Boolean(challenge.newVerifiedAt) };
    }
    const attempts = target === "current" ? challenge.currentAttempts : challenge.newAttempts;
    const sentAt = target === "current" ? challenge.currentSentAt : challenge.newSentAt;
    const stored = target === "current" ? challenge.currentCodeHash : challenge.newCodeHash;
    const valid = Boolean(sentAt) && attempts < EMAIL_CHANGE_MAX_ATTEMPTS && /^[0-9]{6}$/.test(code) && matchesCode(userId, target === "current" ? challenge.currentEmail : challenge.newEmail, target, challenge.challengeNonce, code, stored);
    if (!valid) {
      const nextAttempts = Math.min(EMAIL_CHANGE_MAX_ATTEMPTS, attempts + 1);
      const values = target === "current"
        ? { currentAttempts: nextAttempts, usedAt: nextAttempts >= EMAIL_CHANGE_MAX_ATTEMPTS ? now : null }
        : { newAttempts: nextAttempts, usedAt: nextAttempts >= EMAIL_CHANGE_MAX_ATTEMPTS ? now : null };
      await tx.update(emailChangeRequests).set(values).where(eq(emailChangeRequests.id, challenge.id));
      return { kind: "invalid" as const };
    }
    const verifiedValues = target === "current" ? { currentVerifiedAt: now } : { newVerifiedAt: now };
    await tx.update(emailChangeRequests).set(verifiedValues).where(eq(emailChangeRequests.id, challenge.id));
    const currentVerified = target === "current" || Boolean(challenge.currentVerifiedAt);
    const newVerified = target === "new" || Boolean(challenge.newVerifiedAt);
    if (!currentVerified || !newVerified) return { kind: "verified" as const, currentVerified, newVerified };
    const [fresh] = await tx.select().from(users).where(and(eq(users.id, userId), eq(users.status, "active"))).limit(1).for("update");
    if (!fresh || normalizeEmail(fresh.email) !== challenge.currentEmail) {
      await tx.update(emailChangeRequests).set({ usedAt: now }).where(eq(emailChangeRequests.id, challenge.id));
      return { kind: "stale" as const };
    }
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1296388673, hashtext(${challenge.newEmail}))`);
    const [taken] = await tx.select({ id: users.id }).from(users).where(and(
      ne(users.id, userId),
      sql`lower(${users.email}) = lower(${challenge.newEmail})`,
    )).limit(1);
    if (taken) {
      await tx.update(emailChangeRequests).set({ usedAt: now }).where(eq(emailChangeRequests.id, challenge.id));
      return { kind: "taken" as const };
    }
    await tx.update(users).set({ email: challenge.newEmail, emailVerifiedAt: now, updatedAt: now }).where(eq(users.id, userId));
    await tx.update(emailVerificationCodes).set({ usedAt: now }).where(and(eq(emailVerificationCodes.userId, userId), isNull(emailVerificationCodes.usedAt)));
    await tx.update(passwordResetTokens).set({ usedAt: now }).where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
    await tx.update(accountMfaChallenges).set({ usedAt: now }).where(and(eq(accountMfaChallenges.userId, userId), isNull(accountMfaChallenges.usedAt)));
    await tx.update(oauthExchanges).set({ usedAt: now }).where(and(eq(oauthExchanges.userId, userId), isNull(oauthExchanges.usedAt)));
    await tx.update(emailChangeRequests).set({ currentVerifiedAt: now, newVerifiedAt: now, usedAt: now }).where(eq(emailChangeRequests.id, challenge.id));
    const revoked = await tx.update(authSessions).set({ revokedAt: now }).where(and(
      eq(authSessions.userId, userId),
      isNull(authSessions.revokedAt),
    )).returning({ deviceId: authSessions.deviceId });
    await tx.update(pushDevices).set({ status: "revoked", lastSeenAt: now }).where(eq(pushDevices.userId, userId));
    await tx.insert(auditLogs).values({
      actorEmail: challenge.newEmail,
      action: "change_email",
      entityType: "user",
      entityId: String(userId),
      beforeJson: JSON.stringify({ email: challenge.currentEmail }),
      afterJson: JSON.stringify({ email: challenge.newEmail }),
      ipAddress: clientIp(request),
      createdAt: now,
    });
    return { kind: "complete" as const, email: challenge.newEmail, revokedSessions: revoked.length };
  }).catch(error => {
    if (isUniqueConstraintError(error)) throw new EmailChangeError("تعذر اعتماد البريد لتعارض بيانات الحساب. تواصل مع الدعم.", "EMAIL_CHANGE_EMAIL_TAKEN", 409);
    throw error;
  });
  if (result.kind === "invalid") throw new EmailChangeError("الرمز غير صحيح أو منتهي. أعد إدخاله أو اطلب رمزًا جديدًا.", "EMAIL_CHANGE_CODE_INVALID", 400);
  if (result.kind === "stale") throw new EmailChangeError("تغيّر البريد قبل إكمال الطلب. ابدأ طلبًا جديدًا.", "EMAIL_CHANGE_STALE", 409);
  if (result.kind === "taken") throw new EmailChangeError("البريد الجديد مستخدم الآن في حساب آخر. ابدأ طلبًا جديدًا.", "EMAIL_CHANGE_EMAIL_TAKEN", 409);
  if (result.kind === "complete") return { ok: true, completed: true, requiresReauthentication: true, email: result.email, currentVerified: true, newVerified: true, revokedSessions: result.revokedSessions };
  return { ok: true, completed: false, currentVerified: result.currentVerified, newVerified: result.newVerified };
}

export async function cancelEmailChange(userId: number, request: Request) {
  const tokenHash = await sessionHash(request);
  return getDb().transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId})`);
    await requireCurrentSession(tx, userId, tokenHash);
    const result = await tx.update(emailChangeRequests)
      .set({ usedAt: new Date().toISOString() })
      .where(and(eq(emailChangeRequests.userId, userId), isNull(emailChangeRequests.usedAt)))
      .returning({ id: emailChangeRequests.id });
    return { ok: true, cancelled: result.length > 0 };
  });
}
