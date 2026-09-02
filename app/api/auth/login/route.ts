import { eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { checkRateLimit, clearRateLimit, clientIp, createSession, DeviceLimitError, sameOriginRequest, verifyPassword } from "@/lib/auth";
import { cleanText, jsonError, normalizePhone } from "@/lib/api";

function phoneCandidate(value: string) {
  const digits = normalizePhone(value).replace(/\D/g, "");
  if (!digits) return value;
  if (digits.startsWith("966")) return `+${digits}`;
  if (digits.startsWith("0")) return `+966${digits.slice(1)}`;
  return `+966${digits}`;
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات الدخول غير صالحة"); }
  const identifier = cleanText(payload.identifier, 180).toLowerCase();
  const password = typeof payload.password === "string" ? payload.password : "";
  const ipIdentity = clientIp(request);
  if (!identifier || !password) return jsonError("أدخل البريد أو الجوال وكلمة المرور");
  if (!await checkRateLimit("login-ip", ipIdentity, 300, 15 * 60) || !await checkRateLimit("login-account", identifier, 8, 15 * 60)) return jsonError("تم إيقاف المحاولات مؤقتًا. حاول بعد 15 دقيقة.", 429);

  const [user] = await getDb().select().from(users).where(or(eq(users.email, identifier), eq(users.phone, phoneCandidate(identifier)))).limit(1);
  const valid = user?.status === "active" && await verifyPassword(password, user.passwordHash);
  if (!user || !valid) return jsonError("بيانات الدخول غير صحيحة", 401);

  await clearRateLimit("login-account", identifier);
  await getDb().update(users).set({ lastLoginAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(users.id, user.id));
  let session;
  try { session = await createSession(user.id, request, payload.remember !== false); }
  catch (error) { if (error instanceof DeviceLimitError) return jsonError(`وصل حسابك إلى الحد المسموح (${error.limit}) من الأجهزة. سجّل الخروج من جهاز سابق من «حسابي ← الأمان والأجهزة»، أو استخدم «نسيت كلمة المرور» لإنهاء جميع الجلسات، أو تواصل مع الدعم.`, 409, "DEVICE_LIMIT_REACHED"); throw error; }
  const next = user.profileCompletedAt ? (user.onboardingCompletedAt ? "/dashboard" : "/onboarding") : "/complete-profile";
  return Response.json({ ok: true, next }, { headers: { "set-cookie": session.cookie, "cache-control": "no-store" } });
}
