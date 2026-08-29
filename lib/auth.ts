import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { authRateLimits, authSessions, users } from "@/db/schema";
import { getStudentDeviceLimit } from "@/lib/platform-settings";

export const SESSION_COOKIE = "meras_session";
const PASSWORD_ITERATIONS = 210_000;

export type UserRole = "student" | "supervisor" | "admin";

export class DeviceLimitError extends Error {
  readonly limit: number;
  constructor(limit: number) {
    super(`DEVICE_LIMIT:${limit}`);
    this.name = "DeviceLimitError";
    this.limit = limit;
  }
}

function sanitizeDeviceId(value: string | null) {
  const cleaned = (value || "").trim().replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 128);
  return cleaned.length >= 12 ? cleaned : "";
}

function sanitizeDeviceLabel(value: string | null) {
  return (value || "").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

function platformFromRequest(request: Request) {
  const explicit = (request.headers.get("x-meras-platform") || "").trim().toLowerCase();
  if (["android", "ios", "web"].includes(explicit)) return explicit;
  const client = request.headers.get("x-meras-client") || "";
  if (/mobile/i.test(client)) return "mobile";
  return "web";
}

async function deviceIdentity(request: Request) {
  const supplied = sanitizeDeviceId(request.headers.get("x-meras-device-id"));
  const userAgent = request.headers.get("user-agent")?.slice(0, 300) || "unknown";
  const platform = platformFromRequest(request);
  const deviceId = supplied || `fallback-${(await sha256(`${platform}:${userAgent}`)).slice(0, 48)}`;
  const label = sanitizeDeviceLabel(request.headers.get("x-meras-device-label")) || (platform === "web" ? "متصفح ويب" : platform === "android" ? "جهاز Android" : platform === "ios" ? "جهاز iPhone / iPad" : "تطبيق مراس");
  return { deviceId, deviceLabel: label, platform, userAgent };
}

export type SessionUser = {
  id: number;
  email: string;
  phone: string | null;
  fullName: string;
  universitySlug: string | null;
  specialty: string | null;
  academicLevel: string | null;
  role: UserRole;
  profileCompleted: boolean;
  onboardingCompleted: boolean;
};

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(size = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}

export function createOpaqueToken(size = 32) { return randomToken(size); }
export function hashOpaqueToken(value: string) { return sha256(value); }

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS }, key, 256);
  return `pbkdf2$${PASSWORD_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(new Uint8Array(derived))}`;
}

export async function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  const [algorithm, rawIterations, encodedSalt, encodedHash] = stored.split("$");
  const iterations = Number(rawIterations);
  if (algorithm !== "pbkdf2" || !Number.isInteger(iterations) || iterations < 100_000 || !encodedSalt || !encodedHash) return false;
  try {
    const salt = base64UrlToBytes(encodedSalt);
    const expected = base64UrlToBytes(encodedHash);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, expected.byteLength * 8));
    if (derived.byteLength !== expected.byteLength) return false;
    let difference = 0;
    for (let index = 0; index < derived.byteLength; index += 1) difference |= derived[index] ^ expected[index];
    return difference === 0;
  } catch {
    return false;
  }
}

function effectiveRole(email: string, storedRole: string): UserRole {
  void email;
  return storedRole === "admin" || storedRole === "supervisor" ? storedRole : "student";
}

function parseCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return "";
  for (const item of cookieHeader.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return "";
}

function bearerToken(requestHeaders: Headers) {
  const authorization = requestHeaders.get("authorization")?.trim() || "";
  const match = authorization.match(/^Bearer\s+([A-Za-z0-9_-]{32,256})$/i);
  return match?.[1] || "";
}

export function sessionUserFromRow(row: typeof users.$inferSelect): SessionUser {
  const email = row.email.toLowerCase();
  const role = effectiveRole(email, row.role);
  return {
    id: row.id,
    email,
    phone: row.phone,
    fullName: row.fullName,
    universitySlug: row.universitySlug,
    specialty: row.specialty,
    academicLevel: row.academicLevel,
    role,
    profileCompleted: role !== "student" || Boolean(row.profileCompletedAt && row.phone && row.universitySlug && row.specialty && row.academicLevel),
    onboardingCompleted: Boolean(row.onboardingCompletedAt),
  };
}

export async function getSessionUserFromHeaders(requestHeaders: Headers): Promise<SessionUser | null> {
  const token = bearerToken(requestHeaders) || parseCookie(requestHeaders.get("cookie"), SESSION_COOKIE);
  if (!token) return null;
  try {
    const db = getDb();
    const tokenHash = await sha256(token);
    const now = new Date().toISOString();
    const [row] = await db.select({ user: users, sessionId: authSessions.id, lastSeenAt: authSessions.lastSeenAt }).from(authSessions).innerJoin(users, eq(authSessions.userId, users.id)).where(and(
      eq(authSessions.tokenHash, tokenHash),
      isNull(authSessions.revokedAt),
      gt(authSessions.expiresAt, now),
      eq(users.status, "active"),
    )).limit(1);
    if (!row) return null;
    const lastSeen = new Date(row.lastSeenAt || 0).getTime();
    if (!Number.isFinite(lastSeen) || Date.now() - lastSeen > 5 * 60_000) {
      await db.update(authSessions).set({ lastSeenAt: now }).where(eq(authSessions.id, row.sessionId)).catch(() => undefined);
    }
    return sessionUserFromRow(row.user);
  } catch {
    return null;
  }
}

export function getSessionUser(request: Request) {
  return getSessionUserFromHeaders(request.headers);
}

export async function createSession(userId: number, request: Request, remember = true) {
  const db = getDb();
  const now = new Date().toISOString();
  const device = await deviceIdentity(request);
  const token = randomToken();
  const tokenHash = await sha256(token);
  const maxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 12;
  const expiresAt = new Date(Date.now() + maxAge * 1000).toISOString();
  const studentLimit = await getStudentDeviceLimit();

  // Lock per account while counting/inserting sessions so concurrent logins cannot exceed the device limit.
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId})`);
    const [account] = await tx.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (!account) throw new Error("account_not_found");

    // A fresh login from the same physical browser/app replaces the old session instead of consuming another slot.
    await tx.update(authSessions).set({ revokedAt: now }).where(and(eq(authSessions.userId, userId), eq(authSessions.deviceId, device.deviceId), isNull(authSessions.revokedAt)));

    if (account.role === "student") {
      const active = await tx.select({ id: authSessions.id, deviceId: authSessions.deviceId }).from(authSessions).where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, now)));
      const devices = new Set(active.map((row) => row.deviceId || `legacy:${row.id}`));
      if (devices.size >= studentLimit) throw new DeviceLimitError(studentLimit);
    }

    await tx.insert(authSessions).values({
      userId,
      tokenHash,
      ipAddress: clientIp(request),
      userAgent: device.userAgent,
      deviceId: device.deviceId,
      deviceLabel: device.deviceLabel,
      platform: device.platform,
      lastSeenAt: now,
      expiresAt,
    });
  });

  const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https";
  return {
    token,
    expiresAt,
    deviceId: device.deviceId,
    cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly;${secure ? " Secure;" : ""} SameSite=Lax; Max-Age=${maxAge}`,
  };
}
export async function revokeSession(request: Request) {
  const token = bearerToken(request.headers) || parseCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (token) {
    try {
      await getDb().update(authSessions).set({ revokedAt: new Date().toISOString() }).where(eq(authSessions.tokenHash, await sha256(token)));
    } catch {
      // Always clear the browser/device session locally, even when the database is temporarily unavailable.
    }
  }
  const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly;${secure ? " Secure;" : ""} SameSite=Lax; Max-Age=0`;
}

export function clientIp(request: Request) {
  return (request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim().slice(0, 80);
}

export function validPassword(password: string) {
  return password.length >= 10 && password.length <= 128 && /\d/.test(password) && /[^\p{L}\p{N}\s]/u.test(password);
}

export function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value) && value.length <= 180;
}

export function validSaudiPhone(value: string) {
  return /^(?:\+?966|0)?5\d{8}$/.test(value.replace(/\D/g, ""));
}

export function sameOriginRequest(request: Request) {
  const origin = request.headers.get("origin")?.trim();
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  const accepted = new Set<string>();
  try { accepted.add(new URL(request.url).origin); } catch { /* Invalid request URL is rejected below. */ }
  for (const configured of [process.env.APP_URL, process.env.NEXT_PUBLIC_SITE_URL, process.env.MOBILE_APP_URL, process.env.EXPO_WEB_ORIGIN]) {
    if (!configured) continue;
    try { accepted.add(new URL(configured).origin); } catch { /* Ignore malformed optional URLs. */ }
  }
  const host = request.headers.get("host")?.trim();
  if (host && /^[a-zA-Z0-9.-]+(?::\d{1,5})?$/.test(host)) {
    accepted.add(`https://${host}`);
    if (process.env.NODE_ENV !== "production") accepted.add(`http://${host}`);
  }
  return accepted.has(origin);
}

async function rateLimitKey(scope: string, identity: string) {
  return sha256(`${scope}:${identity.trim().toLowerCase()}`);
}

export async function checkRateLimit(scope: string, identity: string, limit: number, windowSeconds: number) {
  const db = getDb();
  const key = await rateLimitKey(scope, identity);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const expiryIso = new Date(now + windowSeconds * 1000).toISOString();
  const [row] = await db.insert(authRateLimits).values({ key, attempts: 1, windowExpiresAt: expiryIso, updatedAt: nowIso }).onConflictDoUpdate({
    target: authRateLimits.key,
    set: {
      attempts: sql`CASE WHEN ${authRateLimits.windowExpiresAt} <= ${nowIso} THEN 1 ELSE ${authRateLimits.attempts} + 1 END`,
      windowExpiresAt: sql`CASE WHEN ${authRateLimits.windowExpiresAt} <= ${nowIso} THEN ${expiryIso} ELSE ${authRateLimits.windowExpiresAt} END`,
      updatedAt: nowIso,
    },
  }).returning({ attempts: authRateLimits.attempts });
  return Boolean(row && row.attempts <= limit);
}

export async function clearRateLimit(scope: string, identity: string) {
  await getDb().delete(authRateLimits).where(eq(authRateLimits.key, await rateLimitKey(scope, identity)));
}

export function roleAllowed(user: SessionUser | null, roles: UserRole[]) {
  return Boolean(user && roles.includes(user.role));
}
