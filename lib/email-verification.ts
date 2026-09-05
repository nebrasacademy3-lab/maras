import "server-only";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { emailVerificationCodes, users } from "@/db/schema";
import { checkRateLimit, clientIp } from "@/lib/auth";
import { EmailDeliveryError, emailDeliveryConfigured, sendTransactionalEmail } from "@/lib/transactional-email";

export type EmailCodePurpose = "verify_email" | "change_password";
type UserRow = typeof users.$inferSelect;
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type CodeIdentity = { userId: number; email: string; purpose: EmailCodePurpose };
export const EMAIL_CODE_TTL_SECONDS = 10 * 60;
export const EMAIL_CODE_RESEND_SECONDS = 60;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;

export class EmailCodeError extends Error {
  constructor(message: string, readonly code = "EMAIL_CODE_INVALID", readonly status = 400, readonly retryAfterSeconds = 0) { super(message); this.name = "EmailCodeError"; }
}

function verificationSecret() {
  const secret = process.env.SESSION_SECRET?.trim() || "";
  if (secret.length < 32 || /(?:replace[-_ ]?with|change[-_ ]?me|example[-_ ]?secret)/i.test(secret)) throw new EmailCodeError("التحقق بالبريد غير مهيأ بأمان على الخادم.", "EMAIL_VERIFICATION_NOT_CONFIGURED", 503);
  return secret;
}

export function normalizeEmailCode(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[٠-٩]/g, value => String(value.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, value => String(value.charCodeAt(0) - 0x6f0));
}

export function hashEmailCode(identity: CodeIdentity, code: string, salt = randomBytes(16).toString("hex")) {
  const digest = createHmac("sha256", verificationSecret()).update(JSON.stringify([identity.userId, identity.email, identity.purpose, salt, code])).digest("hex");
  return `${salt}.${digest}`;
}

export function matchesEmailCode(identity: CodeIdentity, code: string, stored: string) {
  const [salt, digest] = stored.split(".");
  if (!/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{64}$/.test(digest || "")) return false;
  const actual = hashEmailCode(identity, code, salt);
  return actual.length === stored.length && timingSafeEqual(Buffer.from(actual), Buffer.from(stored));
}

async function latestCode(db: ReturnType<typeof getDb> | Transaction, identity: CodeIdentity) {
  const [row] = await db.select().from(emailVerificationCodes).where(and(eq(emailVerificationCodes.userId, identity.userId), eq(emailVerificationCodes.email, identity.email), eq(emailVerificationCodes.purpose, identity.purpose))).orderBy(desc(emailVerificationCodes.id)).limit(1);
  return row;
}

export async function emailCodeStatus(userId: number, email: string, purpose: EmailCodePurpose = "verify_email") {
  const row = await latestCode(getDb(), { userId, email, purpose });
  const active = Boolean(row && !row.usedAt && Date.parse(row.expiresAt) > Date.now() && row.attempts < EMAIL_CODE_MAX_ATTEMPTS);
  return {
    deliveryConfigured: emailDeliveryConfigured(),
    cooldownSeconds: active ? Math.max(0, Math.ceil((Date.parse(row.createdAt) + EMAIL_CODE_RESEND_SECONDS * 1000 - Date.now()) / 1000)) : 0,
    expiresInSeconds: active ? Math.max(0, Math.ceil((Date.parse(row.expiresAt) - Date.now()) / 1000)) : 0,
    codeSent: active && Boolean(row.sentAt),
  };
}

export async function requestEmailCode(userId: number, purpose: EmailCodePurpose, request: Request, reuseActive = false) {
  if (!emailDeliveryConfigured()) throw new EmailDeliveryError(false);
  verificationSecret();
  if (!await checkRateLimit(`email-code-send:${purpose}`, `user:${userId}`, 8, 60 * 60) || !await checkRateLimit("email-code-send-ip", clientIp(request), 40, 60 * 60)) throw new EmailCodeError("وصلت إلى حد إرسال الرموز. حاول لاحقًا.", "EMAIL_CODE_RATE_LIMIT", 429);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_SECONDS * 1000).toISOString();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const db = getDb();
  const issued = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId})`);
    const [user] = await tx.select().from(users).where(and(eq(users.id, userId), eq(users.status, "active"))).limit(1);
    if (!user) throw new EmailCodeError("الحساب غير متاح.", "ACCOUNT_UNAVAILABLE", 401);
    if (purpose === "verify_email" && user.emailVerifiedAt) return { kind: "verified" as const };
    const identity = { userId, email: user.email, purpose };
    const latest = await latestCode(tx, identity);
    if (latest && !latest.usedAt && Date.parse(latest.expiresAt) > Date.now() && latest.attempts < EMAIL_CODE_MAX_ATTEMPTS) {
      const remaining = Math.max(0, Math.ceil((Date.parse(latest.createdAt) + EMAIL_CODE_RESEND_SECONDS * 1000 - Date.now()) / 1000));
      if (remaining || reuseActive) return { kind: "existing" as const, retryAfterSeconds: remaining, expiresInSeconds: Math.max(0, Math.ceil((Date.parse(latest.expiresAt) - Date.now()) / 1000)) };
    }
    await tx.update(emailVerificationCodes).set({ usedAt: now }).where(and(eq(emailVerificationCodes.userId, userId), eq(emailVerificationCodes.purpose, purpose), isNull(emailVerificationCodes.usedAt)));
    const [challenge] = await tx.insert(emailVerificationCodes).values({ userId, email: user.email, purpose, codeHash: hashEmailCode(identity, code), expiresAt, createdAt: now }).returning({ id: emailVerificationCodes.id });
    return { kind: "created" as const, user, id: challenge.id };
  });
  if (issued.kind === "verified") return { ok: true, alreadyVerified: true, retryAfterSeconds: 0, expiresInSeconds: 0 };
  if (issued.kind === "existing") return { ok: true, retryAfterSeconds: issued.retryAfterSeconds, expiresInSeconds: issued.expiresInSeconds, reused: true };
  try {
    await sendTransactionalEmail({
      to: issued.user.email,
      subject: purpose === "verify_email" ? "رمز تأكيد بريدك — مراس العلم" : "رمز تغيير كلمة المرور — مراس العلم",
      text: `مرحبًا ${issued.user.fullName}،\n\nرمز ${purpose === "verify_email" ? "تأكيد بريدك الإلكتروني" : "تغيير كلمة مرورك"} في مراس العلم:\n\n${code}\n\nصالح لمدة 10 دقائق ولمرة واحدة فقط. لا تشارك هذا الرمز مع أي شخص.\n${purpose === "verify_email" ? "تأكيد البريد مرة واحدة للحساب، وليس قبل كل عملية شراء." : "إذا لم تطلب تغيير كلمة المرور، تجاهل الرسالة وراجع أمان حسابك."}`,
      idempotencyKey: `email-code-${issued.id}`,
    });
    await db.update(emailVerificationCodes).set({ sentAt: new Date().toISOString() }).where(and(eq(emailVerificationCodes.id, issued.id), isNull(emailVerificationCodes.usedAt)));
  } catch (error) {
    await db.update(emailVerificationCodes).set({ usedAt: new Date().toISOString() }).where(eq(emailVerificationCodes.id, issued.id));
    throw error;
  }
  return { ok: true, retryAfterSeconds: EMAIL_CODE_RESEND_SECONDS, expiresInSeconds: EMAIL_CODE_TTL_SECONDS };
}

export async function ensureVerificationEmail(userId: number, request: Request) {
  try { return await requestEmailCode(userId, "verify_email", request, true); }
  catch { return { ok: false, deliveryConfigured: emailDeliveryConfigured() }; }
}

export async function consumeEmailCode<T>(userId: number, purpose: EmailCodePurpose, supplied: unknown, request: Request, operation: (tx: Transaction, user: UserRow, now: string) => Promise<T>): Promise<T> {
  const code = normalizeEmailCode(supplied);
  if (!await checkRateLimit(`email-code-verify:${purpose}`, `user:${userId}`, 15, 15 * 60) || !await checkRateLimit("email-code-verify-ip", clientIp(request), 100, 15 * 60)) throw new EmailCodeError("محاولات كثيرة. حاول لاحقًا.", "EMAIL_CODE_RATE_LIMIT", 429);
  const result = await getDb().transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId})`);
    const [user] = await tx.select().from(users).where(and(eq(users.id, userId), eq(users.status, "active"))).limit(1);
    if (!user) return { ok: false as const };
    const identity = { userId, email: user.email, purpose };
    const challenge = await latestCode(tx, identity);
    const now = new Date().toISOString();
    if (!challenge || challenge.usedAt || !challenge.sentAt || !Number.isFinite(Date.parse(challenge.expiresAt)) || Date.parse(challenge.expiresAt) <= Date.now() || challenge.attempts >= EMAIL_CODE_MAX_ATTEMPTS) return { ok: false as const };
    const valid = /^[0-9]{6}$/.test(code) && matchesEmailCode(identity, code, challenge.codeHash);
    if (!valid) {
      const attempts = challenge.attempts + 1;
      await tx.update(emailVerificationCodes).set({ attempts, usedAt: attempts >= EMAIL_CODE_MAX_ATTEMPTS ? now : null }).where(eq(emailVerificationCodes.id, challenge.id));
      return { ok: false as const };
    }
    await tx.update(emailVerificationCodes).set({ usedAt: now }).where(and(eq(emailVerificationCodes.userId, userId), eq(emailVerificationCodes.purpose, purpose), isNull(emailVerificationCodes.usedAt)));
    return { ok: true as const, value: await operation(tx, user, now) };
  });
  // Throw only after the transaction commits so failed attempts cannot roll back.
  if (!result.ok) throw new EmailCodeError("الرمز غير صحيح أو منتهي. أعد إدخاله أو اطلب رمزًا جديدًا.");
  return result.value;
}
