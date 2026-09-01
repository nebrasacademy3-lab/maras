import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiSubscriptionOrders } from "@/db/schema";
import { cleanText, jsonError, requestOrigin } from "@/lib/api";
import { checkRateLimit, clientIp, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { getAiMonthlyPrice } from "@/lib/ai-platform";
import { fromMinorUnits, toMinorUnits } from "@/lib/finance";
import { observeRequest } from "@/lib/observability";

type TapChargeResponse = { id?: string; transaction?: { url?: string }; errors?: Array<{ description?: string }> };
const OPEN_STATUSES = ["pending", "initiated", "in_progress", "verification_pending"];
const CHECKOUT_MINUTES = 30;

function orderNumber() {
  const random = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
  return `AI-${Date.now().toString(36).toUpperCase()}-${random}`;
}

function replay(row: typeof aiSubscriptionOrders.$inferSelect) {
  const fresh = Date.parse(row.createdAt) > Date.now() - CHECKOUT_MINUTES * 60_000;
  if (!fresh) return jsonError("انتهت محاولة الدفع السابقة. ابدأ محاولة جديدة.", 409);
  if (row.checkoutUrl && ["initiated", "in_progress", "pending"].includes(row.status)) return Response.json({ ok: true, replayed: true, orderNumber: row.orderNumber, amount: row.amount, currency: row.currency, checkoutUrl: row.checkoutUrl, mode: "live" }, { headers: { "cache-control": "no-store" } });
  return Response.json({ ok: true, pending: true, orderNumber: row.orderNumber, status: row.status }, { status: 202, headers: { "cache-control": "no-store", "retry-after": "3" } });
}

export async function GET(request: Request) {
  return observeRequest(request, "ai.subscription.status", async () => {
    const user = await getSessionUser(request);
    if (!user) return jsonError("سجّل الدخول لمتابعة الاشتراك", 401);
    const requested = cleanText(new URL(request.url).searchParams.get("order"), 120);
    if (!requested) return jsonError("رقم الطلب مطلوب");
    const [row] = await getDb().select({ orderNumber: aiSubscriptionOrders.orderNumber, status: aiSubscriptionOrders.status, amount: aiSubscriptionOrders.amount, currency: aiSubscriptionOrders.currency, paidAt: aiSubscriptionOrders.paidAt, entitlementExpiresAt: aiSubscriptionOrders.entitlementExpiresAt }).from(aiSubscriptionOrders).where(and(eq(aiSubscriptionOrders.orderNumber, requested), eq(aiSubscriptionOrders.userId, user.id))).limit(1);
    if (!row) return jsonError("طلب الاشتراك غير موجود", 404);
    return Response.json({ ok: true, order: row }, { headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  });
}

export async function POST(request: Request) {
  return observeRequest(request, "ai.subscription.checkout", async () => {
    if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
    const user = await getSessionUser(request);
    if (!user) return jsonError("سجّل الدخول قبل الاشتراك", 401);
    if (!user.profileCompleted || !user.phone) return jsonError("أكمل رقم الجوال وبيانات الحساب قبل الدفع", 409);
    if (!await checkRateLimit("ai-subscription-checkout", `user:${user.id}:${clientIp(request)}`, 8, 15 * 60)) return jsonError("محاولات دفع كثيرة. حاول بعد 15 دقيقة.", 429);
    let body: Record<string, unknown> = {};
    try { body = await request.json() as Record<string, unknown>; } catch { /* The only client field is optional idempotency. */ }
    const supplied = cleanText(request.headers.get("idempotency-key") || body.checkoutKey, 100);
    const checkoutKey = `u${user.id}:meras-ai:${/^[A-Za-z0-9_-]{12,90}$/.test(supplied) ? supplied : crypto.randomUUID()}`;
    const price = await getAiMonthlyPrice();
    const amountMinor = toMinorUnits(price);
    if (amountMinor < 100) return jsonError("سعر الاشتراك غير صالح في إعدادات الإدارة", 503);
    const amount = fromMinorUnits(amountMinor);
    const tapSecretKey = process.env.TAP_SECRET_KEY?.trim();
    if (!tapSecretKey) return jsonError("بوابة الدفع قيد الإعداد. لم تُنشأ مطالبة مالية.", 503);
    const db = getDb();
    const now = new Date().toISOString();
    const created = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`ai-subscription:${user.id}`}))`);
      const [sameKey] = await tx.select().from(aiSubscriptionOrders).where(eq(aiSubscriptionOrders.checkoutKey, checkoutKey)).limit(1);
      if (sameKey) return { kind: "existing" as const, row: sameKey };
      const [recent] = await tx.select().from(aiSubscriptionOrders).where(and(eq(aiSubscriptionOrders.userId, user.id), inArray(aiSubscriptionOrders.status, OPEN_STATUSES), sql`${aiSubscriptionOrders.createdAt}::timestamptz >= NOW() - INTERVAL '30 minutes'`)).orderBy(desc(aiSubscriptionOrders.createdAt)).limit(1);
      if (recent) return { kind: "existing" as const, row: recent };
      const number = orderNumber();
      const [row] = await tx.insert(aiSubscriptionOrders).values({ orderNumber: number, userId: user.id, customerEmail: user.email, customerName: user.fullName, customerPhone: user.phone, amount, amountMinor, currency: "SAR", status: "pending", checkoutKey, createdAt: now, updatedAt: now }).returning();
      return { kind: "created" as const, row };
    });
    if (created.kind === "existing") return replay(created.row);

    const row = created.row;
    const siteOrigin = (process.env.APP_URL || requestOrigin(request)).replace(/\/$/, "");
    const nameParts = user.fullName.split(/\s+/);
    const localPhone = user.phone.replace(/^\+?966/, "").replace(/^0/, "");
    let response: Response;
    try {
      response = await fetch("https://api.tap.company/v2/charges/", {
        method: "POST",
        headers: { authorization: `Bearer ${tapSecretKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          amount,
          currency: "SAR",
          customer_initiated: true,
          threeDSecure: true,
          save_card: false,
          description: "اشتراك مراس AI الشهري",
          transaction: { expiry: { period: CHECKOUT_MINUTES, type: "MINUTE" } },
          metadata: { product: "meras-ai", ai_order_number: row.orderNumber, order_number: row.orderNumber, user_id: String(user.id) },
          reference: { transaction: row.orderNumber, order: row.orderNumber },
          customer: { first_name: nameParts[0] || user.fullName, last_name: nameParts.slice(1).join(" ") || "طالب مراس", email: user.email, phone: { country_code: "966", number: localPhone } },
          source: { id: "src_all" },
          post: { url: `${siteOrigin}/api/webhooks/tap` },
          redirect: { url: `${siteOrigin}/meras-ai/subscribe?payment=return&order=${encodeURIComponent(row.orderNumber)}` },
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      await db.update(aiSubscriptionOrders).set({ status: "verification_pending", updatedAt: new Date().toISOString() }).where(eq(aiSubscriptionOrders.id, row.id));
      return Response.json({ ok: true, pending: true, orderNumber: row.orderNumber, status: "verification_pending" }, { status: 202, headers: { "cache-control": "no-store", "retry-after": "5" } });
    }
    let charge: TapChargeResponse;
    try { charge = await response.json() as TapChargeResponse; } catch { charge = {}; }
    if (!response.ok || !charge.id || !charge.transaction?.url) {
      await db.update(aiSubscriptionOrders).set({ status: "failed", updatedAt: new Date().toISOString() }).where(eq(aiSubscriptionOrders.id, row.id));
      return jsonError(charge.errors?.[0]?.description || "تعذر بدء عملية الدفع. حاول مرة أخرى.", 502);
    }
    await db.update(aiSubscriptionOrders).set({ tapChargeId: charge.id, checkoutUrl: charge.transaction.url, status: "initiated", updatedAt: new Date().toISOString() }).where(eq(aiSubscriptionOrders.id, row.id));
    return Response.json({ ok: true, mode: "live", orderNumber: row.orderNumber, amount, currency: "SAR", checkoutUrl: charge.transaction.url }, { status: 201, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  });
}
