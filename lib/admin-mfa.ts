import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { adminMfaFactors } from "@/db/schema";
import { SESSION_COOKIE, type SessionUser } from "@/lib/auth";

export const ADMIN_STEP_UP_COOKIE = "meras_admin_stepup";
const STEP_UP_SECONDS = 10 * 60;
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

export class AdminMfaError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "AdminMfaError";
    this.code = code;
    this.status = status;
  }
}

function masterKey() {
  const raw = process.env.ADMIN_MFA_ENCRYPTION_KEY?.trim() || "";
  let material: Buffer | null = null;
  const placeholder = /(?:replace[-_ ]?with|change[-_ ]?me|example[-_ ]?secret)/i.test(raw);

  if (!placeholder && /^[a-f0-9]{64}$/i.test(raw)) {
    material = Buffer.from(raw, "hex");
  } else if (!placeholder && /^[A-Za-z0-9+/_-]+={0,2}$/.test(raw)) {
    try {
      const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64");
      if (decoded.length === 32) material = decoded;
    } catch {
      material = null;
    }
  }

  if (!placeholder && !material && Buffer.byteLength(raw, "utf8") >= 32) material = Buffer.from(raw, "utf8");
  if (!material) {
    throw new AdminMfaError(
      "MFA_NOT_CONFIGURED",
      "المصادقة الإضافية غير مهيأة على الخادم. أضف مفتاح ADMIN_MFA_ENCRYPTION_KEY آمنًا بطول 32 بايت على الأقل.",
      503,
    );
  }
  return material;
}

function derivedKey(purpose: "encryption" | "step-up") {
  return createHmac("sha256", masterKey()).update(`meras-admin-mfa:v1:${purpose}`).digest();
}

function encodeBase32(bytes: Uint8Array) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new AdminMfaError("MFA_FACTOR_INVALID", "تعذر قراءة مفتاح المصادقة المحفوظ.", 500);
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function totpCodeForCounter(secret: string, counter: number, digits = TOTP_DIGITS) {
  if (!Number.isSafeInteger(counter) || counter < 0 || digits < 6 || digits > 8) {
    throw new Error("Invalid TOTP parameters");
  }
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0);
  counterBytes.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % (10 ** digits)).padStart(digits, "0");
}

function matchedTotpCounter(secret: string, code: string, afterCounter: number, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
  for (const counter of [current - 1, current, current + 1]) {
    if (counter <= afterCounter) continue;
    const expected = Buffer.from(totpCodeForCounter(secret, counter));
    const received = Buffer.from(code);
    if (expected.length === received.length && timingSafeEqual(expected, received)) return counter;
  }
  return null;
}

export function encryptAdminMfaSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey("encryption"), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

export function decryptAdminMfaSecret(value: string) {
  const [version, encodedIv, encodedCiphertext, encodedTag] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedCiphertext || !encodedTag) {
    throw new AdminMfaError("MFA_FACTOR_INVALID", "تعذر قراءة إعداد المصادقة المحفوظ.", 500);
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", derivedKey("encryption"), Buffer.from(encodedIv, "base64url"));
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof AdminMfaError) throw error;
    throw new AdminMfaError("MFA_FACTOR_INVALID", "تعذر فك إعداد المصادقة المحفوظ.", 500);
  }
}

function requestCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") || "";
  for (const entry of header.split(";")) {
    const [key, ...parts] = entry.trim().split("=");
    if (key !== name) continue;
    try { return decodeURIComponent(parts.join("=")); } catch { return ""; }
  }
  return "";
}

function requestStepUpCredential(request: Request) {
  const header = request.headers.get("x-meras-admin-stepup")?.trim() || "";
  const bearer = request.headers.get("authorization")?.trim().match(/^Bearer\s+([A-Za-z0-9_-]{32,256})$/i)?.[1];
  if (header && header.length <= 2_000 && bearer && request.headers.get("x-meras-client") === "mobile-v1") return header;
  return requestCookie(request, ADMIN_STEP_UP_COOKIE);
}

function sessionCredential(request: Request) {
  const bearer = request.headers.get("authorization")?.trim().match(/^Bearer\s+([A-Za-z0-9_-]{32,256})$/i)?.[1];
  return bearer || requestCookie(request, SESSION_COOKIE);
}

function sessionFingerprint(request: Request) {
  const credential = sessionCredential(request);
  return credential ? createHash("sha256").update(credential).digest("base64url") : "";
}

type StepUpPayload = {
  uid: number;
  fid: number;
  sid: string;
  exp: number;
  nonce: string;
};

function signStepUp(payload: StepUpPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", derivedKey("step-up")).update(encoded).digest("base64url");
  return `v1.${encoded}.${signature}`;
}

function parseStepUp(request: Request, user: SessionUser): StepUpPayload | null {
  const raw = requestStepUpCredential(request);
  if (!raw || raw.length > 2_000) return null;
  const [version, encoded, signature] = raw.split(".");
  if (version !== "v1" || !encoded || !signature) return null;
  try {
    const expected = Buffer.from(createHmac("sha256", derivedKey("step-up")).update(encoded).digest("base64url"));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<StepUpPayload>;
    const fingerprint = sessionFingerprint(request);
    if (!fingerprint || payload.uid !== user.id || payload.sid !== fingerprint) return null;
    if (!Number.isInteger(payload.fid) || !Number.isInteger(payload.exp) || payload.exp! <= Math.floor(Date.now() / 1000)) return null;
    if (typeof payload.nonce !== "string" || payload.nonce.length < 16) return null;
    return payload as StepUpPayload;
  } catch (error) {
    if (error instanceof AdminMfaError) throw error;
    return null;
  }
}

function secureRequest(request: Request) {
  return new URL(request.url).protocol === "https:"
    || request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https";
}

function stepUpCookie(request: Request, value: string, maxAge: number) {
  return `${ADMIN_STEP_UP_COOKIE}=${encodeURIComponent(value)}; Path=/api/admin; HttpOnly;${secureRequest(request) ? " Secure;" : ""} SameSite=Strict; Max-Age=${maxAge}`;
}

export function clearAdminStepUpCookie(request: Request) {
  return stepUpCookie(request, "", 0);
}

async function activeFactor(userId: number, verified: boolean) {
  const conditions = [
    eq(adminMfaFactors.userId, userId),
    eq(adminMfaFactors.type, "totp"),
    isNull(adminMfaFactors.disabledAt),
    verified ? sql`${adminMfaFactors.verifiedAt} IS NOT NULL` : isNull(adminMfaFactors.verifiedAt),
  ];
  const [factor] = await getDb().select({
    id: adminMfaFactors.id,
    label: adminMfaFactors.label,
    secretEncrypted: adminMfaFactors.secretEncrypted,
    counter: adminMfaFactors.counter,
    verifiedAt: adminMfaFactors.verifiedAt,
    createdAt: adminMfaFactors.createdAt,
  }).from(adminMfaFactors).where(and(...conditions)).orderBy(desc(adminMfaFactors.id)).limit(1);
  return factor || null;
}

export async function adminMfaStatus(user: SessionUser, request?: Request) {
  const [enabledFactor, pendingFactor] = await Promise.all([activeFactor(user.id, true), activeFactor(user.id, false)]);
  const stepUp = request ? await validAdminStepUp(request, user) : null;
  return {
    enabled: Boolean(enabledFactor),
    pendingSetup: Boolean(pendingFactor),
    factor: enabledFactor ? {
      id: enabledFactor.id,
      label: enabledFactor.label,
      verifiedAt: enabledFactor.verifiedAt,
      createdAt: enabledFactor.createdAt,
    } : null,
    stepUpValid: Boolean(stepUp),
    stepUpExpiresAt: stepUp ? new Date(stepUp.exp * 1000).toISOString() : null,
  };
}

export async function beginAdminTotpSetup(user: SessionUser, label = "تطبيق المصادقة") {
  if (await activeFactor(user.id, true)) {
    throw new AdminMfaError("MFA_ALREADY_ENABLED", "المصادقة الإضافية مفعلة بالفعل.", 409);
  }
  const secret = encodeBase32(randomBytes(20));
  const encrypted = encryptAdminMfaSecret(secret);
  const safeLabel = label.trim().replace(/[\r\n\t]/g, " ").slice(0, 80) || "تطبيق المصادقة";
  const now = new Date().toISOString();
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${user.id})`);
    const [enabled] = await tx.select({ id: adminMfaFactors.id }).from(adminMfaFactors).where(and(
      eq(adminMfaFactors.userId, user.id),
      eq(adminMfaFactors.type, "totp"),
      isNull(adminMfaFactors.disabledAt),
      sql`${adminMfaFactors.verifiedAt} IS NOT NULL`,
    )).limit(1);
    if (enabled) throw new AdminMfaError("MFA_ALREADY_ENABLED", "المصادقة الإضافية مفعلة بالفعل.", 409);
    await tx.update(adminMfaFactors).set({ disabledAt: now, updatedAt: now }).where(and(
      eq(adminMfaFactors.userId, user.id),
      eq(adminMfaFactors.type, "totp"),
      isNull(adminMfaFactors.verifiedAt),
      isNull(adminMfaFactors.disabledAt),
    ));
    await tx.insert(adminMfaFactors).values({
      userId: user.id,
      type: "totp",
      label: safeLabel,
      secretEncrypted: encrypted,
      counter: 0,
      createdAt: now,
      updatedAt: now,
    });
  });
  const issuer = "مراس العلم";
  const account = user.email.toLowerCase();
  const otpauthUri = `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
  return { secret, otpauthUri };
}

async function consumeTotp(
  user: SessionUser,
  code: string,
  requireVerified: boolean,
  mutation: "verify" | "disable" | null = null,
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${user.id})`);
    const verifiedCondition = requireVerified
      ? sql`${adminMfaFactors.verifiedAt} IS NOT NULL`
      : isNull(adminMfaFactors.verifiedAt);
    const [factor] = await tx.select({
      id: adminMfaFactors.id,
      secretEncrypted: adminMfaFactors.secretEncrypted,
      counter: adminMfaFactors.counter,
    }).from(adminMfaFactors).where(and(
      eq(adminMfaFactors.userId, user.id),
      eq(adminMfaFactors.type, "totp"),
      isNull(adminMfaFactors.disabledAt),
      verifiedCondition,
    )).orderBy(desc(adminMfaFactors.id)).limit(1);
    if (!factor) {
      throw new AdminMfaError(
        requireVerified ? "MFA_SETUP_REQUIRED" : "MFA_SETUP_NOT_STARTED",
        requireVerified ? "فعّل المصادقة الإضافية أولًا." : "ابدأ إعداد المصادقة الإضافية أولًا.",
        428,
      );
    }
    if (!factor.secretEncrypted) throw new AdminMfaError("MFA_FACTOR_INVALID", "إعداد المصادقة غير مكتمل.", 500);
    const counter = matchedTotpCounter(decryptAdminMfaSecret(factor.secretEncrypted), code.trim(), factor.counter);
    if (counter == null) throw new AdminMfaError("MFA_CODE_INVALID", "رمز المصادقة غير صحيح أو سبق استخدامه.", 400);
    const now = new Date().toISOString();
    await tx.update(adminMfaFactors).set({
      counter,
      updatedAt: now,
      ...(mutation === "verify" ? { verifiedAt: now } : {}),
      ...(mutation === "disable" ? { disabledAt: now } : {}),
    }).where(eq(adminMfaFactors.id, factor.id));
    return { factorId: factor.id, counter };
  });
}

export async function verifyAdminTotpSetup(user: SessionUser, code: string) {
  await consumeTotp(user, code, false, "verify");
  return adminMfaStatus(user);
}

export async function createAdminStepUp(user: SessionUser, request: Request, code: string) {
  const credentialFingerprint = sessionFingerprint(request);
  if (!credentialFingerprint) throw new AdminMfaError("SESSION_REQUIRED", "انتهت جلسة الإدارة. سجّل الدخول مجددًا.", 401);
  const consumed = await consumeTotp(user, code, true);
  const expiresAt = Math.floor(Date.now() / 1000) + STEP_UP_SECONDS;
  const token = signStepUp({
    uid: user.id,
    fid: consumed.factorId,
    sid: credentialFingerprint,
    exp: expiresAt,
    nonce: randomBytes(12).toString("base64url"),
  });
  return {
    cookie: stepUpCookie(request, token, STEP_UP_SECONDS),
    token,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}

export async function validAdminStepUp(request: Request, user: SessionUser) {
  const payload = parseStepUp(request, user);
  if (!payload) return null;
  const [factor] = await getDb().select({ id: adminMfaFactors.id }).from(adminMfaFactors).where(and(
    eq(adminMfaFactors.id, payload.fid),
    eq(adminMfaFactors.userId, user.id),
    eq(adminMfaFactors.type, "totp"),
    isNull(adminMfaFactors.disabledAt),
    sql`${adminMfaFactors.verifiedAt} IS NOT NULL`,
  )).limit(1);
  return factor ? payload : null;
}

export async function requireAdminStepUp(request: Request, user: SessionUser) {
  const factor = await activeFactor(user.id, true);
  if (!factor) {
    throw new AdminMfaError("MFA_SETUP_REQUIRED", "فعّل المصادقة الإضافية قبل تنفيذ هذه العملية الحساسة.", 428);
  }
  if (!await validAdminStepUp(request, user)) {
    throw new AdminMfaError("MFA_STEP_UP_REQUIRED", "أدخل رمز المصادقة من صفحة الأمان لتأكيد العملية الحساسة.", 428);
  }
}

export async function disableAdminTotp(user: SessionUser, request: Request, code: string) {
  await consumeTotp(user, code, true, "disable");
  return { cookie: clearAdminStepUpCookie(request) };
}
