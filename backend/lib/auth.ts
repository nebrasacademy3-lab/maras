import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { authRateLimits, authSessions, users } from "@/db/schema";

export const SESSION_COOKIE = "meras_session";
const PASSWORD_ITERATIONS = 210_000;

export type UserRole = "student" | "supervisor" | "admin";

export type SessionUser = {
  id: number;
  email: string;
  phone: string | null;
  fullName: string;
  universitySlug: string | null;
  specialty: string | null;
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
  const salt = base64UrlToBytes(encodedSalt);
  const expected = base64UrlToBytes(encodedHash);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, expected.byteLength * 8));
  if (derived.byteLength !== expected.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < derived.byteLength; index += 1) difference |= derived[index] ^ expected[index];
  return difference === 0;
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
  return {
    id: row.id,
    email,
    phone: row.phone,
    fullName: row.fullName,
    universitySlug: row.universitySlug,
    specialty: row.specialty,
    role: effectiveRole(email, row.role),
    profileCompleted: Boolean(row.profileCompletedAt && row.phone && row.universitySlug && row.specialty),
    onboardingCompleted: Boolean(row.onboardingCompletedAt),
  };
}

export async function getSessionUserFromHeaders(requestHeaders: Headers): Promise<SessionUser | null> {
  const db = getDb();
  const token = bearerToken(requestHeaders) || parseCookie(requestHeaders.get("cookie"), SESSION_COOKIE);
  if (token) {
    const tokenHash = await sha256(token);
    const now = new Date().toISOString();
    const [row] = await db.select({ user: users }).from(authSessions).innerJoin(users, eq(authSessions.userId, users.id)).where(and(
      eq(authSessions.tokenHash, tokenHash),
      isNull(authSessions.revokedAt),
      gt(authSessions.expiresAt, now),
      eq(users.status, "active"),
    )).limit(1);
    if (row) return sessionUserFromRow(row.user);
  }

  const trustChatGptHeaders = process.env.TRUST_CHATGPT_AUTH_HEADERS === "true";
  const trustedEmail = trustChatGptHeaders ? requestHeaders.get("oai-authenticated-user-email")?.trim().toLowerCase() : "";
  if (!trustedEmail) return null;
  const [trustedUser] = await db.select().from(users).where(and(eq(users.email, trustedEmail), eq(users.status, "active"))).limit(1);
  return trustedUser ? sessionUserFromRow(trustedUser) : null;
}

export function getSessionUser(request: Request) {
  return getSessionUserFromHeaders(request.headers);
}

export async function createSession(userId: number, request: Request, remember = true) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const maxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 12;
  const expiresAt = new Date(Date.now() + maxAge * 1000).toISOString();
  await getDb().insert(authSessions).values({
    userId,
    tokenHash,
    ipAddress: clientIp(request),
    userAgent: request.headers.get("user-agent")?.slice(0, 300) || null,
    expiresAt,
  });
  const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https";
  return {
    token,
    expiresAt,
    cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly;${secure ? " Secure;" : ""} SameSite=Lax; Max-Age=${maxAge}`,
  };
}

export async function revokeSession(request: Request) {
  const token = bearerToken(request.headers) || parseCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (token) await getDb().update(authSessions).set({ revokedAt: new Date().toISOString() }).where(eq(authSessions.tokenHash, await sha256(token)));
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
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  const accepted = new Set([new URL(request.url).origin]);
  for (const configured of [process.env.APP_URL, process.env.NEXT_PUBLIC_SITE_URL]) {
    if (!configured) continue;
    try { accepted.add(new URL(configured).origin); } catch { /* Ignore malformed optional URLs. */ }
  }
  return accepted.has(origin);
}

async function rateLimitKey(scope: string, identity: string) {
  return sha256(`${scope}:${identity.trim().toLowerCase()}`);
}

export async function checkRateLimit(scope: string, identity: string, limit: number, windowSeconds: number) {
  const db = getDb();
  const key = await rateLimitKey(scope, identity);
  const [row] = await db.select().from(authRateLimits).where(eq(authRateLimits.key, key)).limit(1);
  const now = Date.now();
  if (!row || Date.parse(row.windowExpiresAt) <= now) {
    await db.insert(authRateLimits).values({ key, attempts: 1, windowExpiresAt: new Date(now + windowSeconds * 1000).toISOString(), updatedAt: new Date(now).toISOString() }).onConflictDoUpdate({
      target: authRateLimits.key,
      set: { attempts: 1, windowExpiresAt: new Date(now + windowSeconds * 1000).toISOString(), updatedAt: new Date(now).toISOString() },
    });
    return true;
  }
  if (row.attempts >= limit) return false;
  await db.update(authRateLimits).set({ attempts: row.attempts + 1, updatedAt: new Date(now).toISOString() }).where(eq(authRateLimits.key, key));
  return true;
}

export async function clearRateLimit(scope: string, identity: string) {
  await getDb().delete(authRateLimits).where(eq(authRateLimits.key, await rateLimitKey(scope, identity)));
}

export function roleAllowed(user: SessionUser | null, roles: UserRole[]) {
  return Boolean(user && roles.includes(user.role));
}
