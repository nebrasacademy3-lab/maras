import { readBoundedJsonObject } from "@/lib/request-body";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { checkRateLimit, clientIp, createOpaqueToken, hashOpaqueToken, sameOriginRequest, validEmail } from "@/lib/auth";
import { cleanText, jsonError, requestOrigin } from "@/lib/api";
import { emailDeliveryConfigured, sendTransactionalEmail } from "@/lib/transactional-email";

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  let payload: Record<string, unknown>;
  try { payload = await readBoundedJsonObject(request); } catch { return jsonError("بيانات غير صالحة"); }
  const email = cleanText(payload.email ?? payload.identifier, 180).toLowerCase();
  if (!validEmail(email)) return jsonError("أدخل بريدًا صالحًا");
  if (!await checkRateLimit("forgot-password-ip", clientIp(request), 30, 60 * 60) || !await checkRateLimit("forgot-password-account", email, 5, 60 * 60)) return jsonError("محاولات كثيرة. حاول لاحقًا.", 429);
  const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
  if (!emailDeliveryConfigured()) return Response.json({ ok: true, delivery: "disabled", message: "خدمة البريد غير مفعّلة حاليًا؛ تواصل مع الدعم لاستعادة الحساب." }, { headers });
  const db = getDb();
  const [user] = await db.select().from(users).where(and(eq(users.email, email), eq(users.status, "active"))).limit(1);
  if (user) {
    const token = createOpaqueToken();
    const tokenHash = await hashOpaqueToken(token);
    const now = Date.now();
    await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash, expiresAt: new Date(now + 15 * 60_000).toISOString(), createdAt: new Date(now).toISOString() });
    try {
      const origin = (process.env.APP_URL || requestOrigin(request)).replace(/\/$/, "");
      await sendTransactionalEmail({ to: email, subject: "استعادة كلمة مرور مراس العلم", idempotencyKey: `reset-${user.id}-${tokenHash.slice(0, 24)}`, text: `مرحبًا ${user.fullName}،\n\nاستخدم الرابط التالي لتعيين كلمة مرور جديدة خلال 15 دقيقة:\n${origin}/reset-password?token=${encodeURIComponent(token)}\n\nالرابط صالح لمرة واحدة. إذا لم تطلب الاستعادة فتجاهل الرسالة.` });
    } catch {
      // Delivery failure must not leave a usable unsent reset link, nor reveal
      // whether the requested email belongs to an account.
      await db.update(passwordResetTokens).set({ usedAt: new Date().toISOString() }).where(eq(passwordResetTokens.tokenHash, tokenHash));
    }
  }
  return Response.json({ ok: true, delivery: "email", message: "إذا كان البريد مسجلًا فستصلك رسالة الاستعادة. يمكنك إعادة المحاولة لاحقًا إن لم تصل." }, { headers });
}
