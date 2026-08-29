import { eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { checkRateLimit, clearRateLimit, clientIp, createSession, DeviceLimitError, sessionUserFromRow, verifyPassword } from "@/lib/auth";
import { cleanText, jsonError, normalizePhone } from "@/lib/api";
import { isMobileRequest, mobileNoStoreHeaders } from "@/lib/mobile-api";

function phoneCandidate(value: string) {
  const digits = normalizePhone(value).replace(/\D/g, "");
  if (!digits) return value;
  if (digits.startsWith("966")) return `+${digits}`;
  if (digits.startsWith("0")) return `+966${digits.slice(1)}`;
  return `+966${digits}`;
}

export async function POST(request: Request) {
  if (!isMobileRequest(request)) return jsonError("طلب تطبيق غير صالح", 403);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات الدخول غير صالحة"); }
  const identifier = cleanText(payload.identifier, 180).toLowerCase();
  const password = typeof payload.password === "string" ? payload.password : "";
  const ipIdentity = clientIp(request);
  if (!identifier || !password) return jsonError("أدخل البريد أو الجوال وكلمة المرور");
  if (!await checkRateLimit("mobile-login-ip", ipIdentity, 300, 15 * 60) || !await checkRateLimit("mobile-login-account", identifier, 8, 15 * 60)) return jsonError("تم إيقاف المحاولات مؤقتًا. حاول بعد 15 دقيقة.", 429);
  const db = getDb();
  const [row] = await db.select().from(users).where(or(eq(users.email, identifier), eq(users.phone, phoneCandidate(identifier)))).limit(1);
  const valid = row?.status === "active" && await verifyPassword(password, row.passwordHash);
  if (!row || !valid) return jsonError("بيانات الدخول غير صحيحة", 401);
  await clearRateLimit("mobile-login-account", identifier);
  const now = new Date().toISOString();
  await db.update(users).set({ lastLoginAt: now, updatedAt: now }).where(eq(users.id, row.id));
  let session;
  try { session = await createSession(row.id, request, payload.remember !== false); }
  catch (error) { if (error instanceof DeviceLimitError) return jsonError(`وصل حسابك إلى الحد المسموح (${error.limit}) من الأجهزة. سجّل الخروج من جهاز سابق أو تواصل مع الإدارة.`, 409); throw error; }
  const user = sessionUserFromRow(row);
  const next = user.profileCompleted ? (user.onboardingCompleted ? "/home" : "/onboarding") : "/complete-profile";
  return Response.json({ ok: true, token: session.token, expiresAt: session.expiresAt, user, next }, { headers: mobileNoStoreHeaders });
}
