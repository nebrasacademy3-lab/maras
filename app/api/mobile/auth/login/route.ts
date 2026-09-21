import { loginPhoneCandidate } from "@/lib/login-identifier";
import { AdminMfaError } from "@/lib/admin-mfa";
import { beginLoginMfa } from "@/lib/account-mfa";
import { readBoundedJsonObject } from "@/lib/request-body";
import { eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { checkRateLimit, clearRateLimit, clientIp, createSession, DeviceLimitError, sessionUserFromRow, verifyPassword } from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";
import { isMobileRequest, mobileNoStoreHeaders } from "@/lib/mobile-api";
import { accountNext } from "@/lib/account-readiness";
import { ensureVerificationEmail } from "@/lib/email-verification";


export async function POST(request: Request) {
  if (!isMobileRequest(request)) return jsonError("طلب تطبيق غير صالح", 403);
  let payload: Record<string, unknown>;
  try { payload = await readBoundedJsonObject(request); } catch { return jsonError("بيانات الدخول غير صالحة"); }
  const identifier = cleanText(payload.identifier, 180).toLowerCase();
  const password = typeof payload.password === "string" ? payload.password : "";
  const ipIdentity = clientIp(request);
  if (!identifier || !password) return jsonError("أدخل البريد أو الجوال وكلمة المرور");
  if (!await checkRateLimit("mobile-login-ip", ipIdentity, 300, 15 * 60) || !await checkRateLimit("mobile-login-account", identifier, 8, 15 * 60)) return jsonError("تم إيقاف المحاولات مؤقتًا. حاول بعد 15 دقيقة.", 429);
  const db = getDb();
  const [row] = await db.select().from(users).where(or(eq(users.email, identifier), eq(users.phone, loginPhoneCandidate(identifier)))).limit(1);
  const valid = row?.status === "active" && await verifyPassword(password, row.passwordHash);
  if (!row || !valid) return jsonError("بيانات الدخول غير صحيحة", 401);
  await clearRateLimit("mobile-login-account", identifier);
  const now = new Date().toISOString();
  await db.update(users).set({ lastLoginAt: now, updatedAt: now }).where(eq(users.id, row.id));
  let challenge;
  try { challenge = await beginLoginMfa(row.id, request, payload.remember !== false); }
  catch (error) { if (error instanceof AdminMfaError) return jsonError(error.message, error.status, error.code); throw error; }
  if (challenge) {
    const headers = new Headers({ "cache-control": "no-store" });

    return Response.json({ ok: true, mfaRequired: true, challengeToken: challenge.challengeToken, expiresAt: challenge.expiresAt }, { headers });
  }
  let session;
  try { session = await createSession(row.id, request, payload.remember !== false); }
  catch (error) { if (error instanceof DeviceLimitError) return jsonError(error.userMessage, error.status, error.code); throw error; }
  const user = sessionUserFromRow(row);
  if (!user.emailVerified) await ensureVerificationEmail(user.id, request);
  const next = accountNext(user, true);
  return Response.json({ ok: true, token: session.token, expiresAt: session.expiresAt, user, next }, { headers: mobileNoStoreHeaders });
}
