import { and, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { cartItems, couponsDb, courseAccess, invoices, notificationsDb, orderItems, orders } from "@/db/schema";
import { checkRateLimit, clientIp, getSessionUser, hashOpaqueToken } from "@/lib/auth";
import { cleanText, isUniqueConstraintError, jsonError, requestOrigin } from "@/lib/api";
import { getCoursesCatalog } from "@/lib/catalog-store";
import { quoteCoupon, quoteCouponForCart } from "@/lib/coupons";
import { isMobileRequest, MOBILE_CLIENT } from "@/lib/mobile-api";
import { getMutationPublicSettings, settingEnabled } from "@/lib/platform-settings";

type TapChargeResponse = { id?: string; status?: string; transaction?: { url?: string }; errors?: Array<{ description?: string }> };
type OrderRow = typeof orders.$inferSelect;

const CHECKOUT_ATTEMPT_PATTERN = /^checkout:v1:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPLETE_ATTEMPT_STATUSES = new Set(["paid", "partially_refunded"]);
const TERMINAL_ATTEMPT_STATUSES = new Set(["failed", "cancelled", "voided", "expired", "refunded", "reversed", "chargeback"]);
const responseHeaders = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

function createOrderNumber() {
  const random = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
  return `MR-${Date.now().toString(36).toUpperCase()}-${random}`;
}

class CouponReservationError extends Error {}

function orderItemQuote(selected: Array<{ slug: string; price: number }>, discount: number, couponCourseSlug: string | null | undefined, orderNumber: string) {
  let remainingDiscountCents = Math.max(0, Math.round(discount * 100));
  return selected.map((course) => {
    const unitPriceCents = Math.max(0, Math.round(course.price * 100));
    const eligible = !couponCourseSlug || couponCourseSlug === course.slug;
    const itemDiscountCents = eligible ? Math.min(unitPriceCents, remainingDiscountCents) : 0;
    remainingDiscountCents -= itemDiscountCents;
    return { orderNumber, courseSlug: course.slug, unitPrice: unitPriceCents / 100, discount: itemDiscountCents / 100, total: (unitPriceCents - itemDiscountCents) / 100 };
  });
}

function checkoutPayload(order: OrderRow, courseSlugs: string[], options: { reused: boolean; pending?: boolean }) {
  return {
    ok: true,
    mode: options.pending ? "pending" : COMPLETE_ATTEMPT_STATUSES.has(order.status) ? "complete" : "live",
    status: order.status,
    reused: options.reused,
    pending: Boolean(options.pending),
    orderNumber: order.orderNumber,
    courseSlugs,
    subtotal: order.subtotal,
    discount: order.discount,
    total: order.total,
    checkoutUrl: options.pending || COMPLETE_ATTEMPT_STATUSES.has(order.status) ? undefined : order.checkoutUrl || undefined,
  };
}

function pendingResponse(order: OrderRow, courseSlugs: string[], reused: boolean) {
  return Response.json(checkoutPayload(order, courseSlugs, { reused, pending: true }), { status: 202, headers: { ...responseHeaders, "retry-after": "2" } });
}

function terminalAttemptResponse(order: OrderRow) {
  return Response.json({ ok: false, error: "انتهت محاولة الدفع السابقة أو فشلت بصورة مؤكدة. ابدأ محاولة دفع جديدة.", code: "CHECKOUT_ATTEMPT_CLOSED", status: order.status, orderNumber: order.orderNumber, newAttemptRequired: true }, { status: 409, headers: responseHeaders });
}

async function failOrderAndReleaseCoupon(orderNumber: string) {
  const db = getDb();
  const now = new Date().toISOString();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM orders WHERE order_number = ${orderNumber} FOR UPDATE`);
    const [current] = await tx.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
    if (!current || !["pending", "creating"].includes(current.status) || current.tapChargeId || current.checkoutUrl) return false;
    if (current.couponReserved && current.couponCode) await tx.update(couponsDb).set({ usedCount: sql`GREATEST(0, ${couponsDb.usedCount} - 1)` }).where(eq(couponsDb.code, current.couponCode));
    await tx.update(orders).set({ status: "failed", couponReserved: false, couponReservationExpiresAt: null, updatedAt: now }).where(eq(orders.id, current.id));
    return true;
  });
}

async function expireCheckoutAttempt(order: OrderRow, now: string) {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`);
    const [current] = await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    if (!current || COMPLETE_ATTEMPT_STATUSES.has(current.status) || TERMINAL_ATTEMPT_STATUSES.has(current.status) || !current.checkoutExpiresAt || current.checkoutExpiresAt > now) return;
    if (current.couponReserved && current.couponCode) await tx.update(couponsDb).set({ usedCount: sql`GREATEST(0, ${couponsDb.usedCount} - 1)` }).where(eq(couponsDb.code, current.couponCode));
    await tx.update(orders).set({ status: "expired", couponReserved: false, couponReservationExpiresAt: null, updatedAt: now }).where(eq(orders.id, current.id));
  });
}

async function releaseExpiredCouponReservations(now: string) {
  const db = getDb();
  const stale = await db.select({ orderNumber: orders.orderNumber }).from(orders).where(and(eq(orders.couponReserved, true), lt(orders.couponReservationExpiresAt, now), ne(orders.status, "paid"))).limit(100);
  for (const row of stale) {
    await db.transaction(async (tx) => {
      const [released] = await tx.update(orders).set({ status: "expired", couponReserved: false, couponReservationExpiresAt: null, updatedAt: now }).where(and(eq(orders.orderNumber, row.orderNumber), eq(orders.couponReserved, true), lt(orders.couponReservationExpiresAt, now), ne(orders.status, "paid"))).returning({ couponCode: orders.couponCode });
      if (released?.couponCode) await tx.update(couponsDb).set({ usedCount: sql`GREATEST(0, ${couponsDb.usedCount} - 1)` }).where(eq(couponsDb.code, released.couponCode));
    });
  }
}

async function courseSlugsForOrder(order: OrderRow) {
  const rows = await getDb().select({ courseSlug: orderItems.courseSlug }).from(orderItems).where(eq(orderItems.orderNumber, order.orderNumber));
  return rows.length ? rows.map((row) => row.courseSlug) : [order.courseSlug];
}

async function completeFreeCheckout(order: OrderRow, courseSlugs: string[], reused: boolean) {
  const db = getDb();
  const now = new Date().toISOString();
  const completed = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`);
    const [current] = await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    if (!current) return null;
    if (COMPLETE_ATTEMPT_STATUSES.has(current.status) || TERMINAL_ATTEMPT_STATUSES.has(current.status)) return current;
    if (current.total !== 0 || current.subtotal !== 0) return null;
    const [saved] = await tx.update(orders).set({ status: "paid", couponReserved: false, couponReservationExpiresAt: null, paidAt: current.paidAt || now, updatedAt: now }).where(eq(orders.id, current.id)).returning();
    await tx.insert(courseAccess).values(courseSlugs.map((courseSlug) => ({ userEmail: current.customerEmail, courseSlug, source: "free_checkout", orderNumber: current.orderNumber, startsAt: now }))).onConflictDoUpdate({ target: [courseAccess.userEmail, courseAccess.courseSlug], set: { source: "free_checkout", orderNumber: current.orderNumber, revokedAt: null, expiresAt: null, startsAt: now } });
    await tx.insert(invoices).values({ invoiceNumber: `INV-${current.orderNumber}`, orderNumber: current.orderNumber, customerEmail: current.customerEmail, total: 0, taxAmount: 0, currency: current.currency, issuedAt: now }).onConflictDoNothing({ target: invoices.orderNumber });
    await tx.delete(cartItems).where(and(eq(cartItems.userEmail, current.customerEmail), inArray(cartItems.courseSlug, courseSlugs)));
    await tx.insert(notificationsDb).values({ userEmail: current.customerEmail, audience: "student", title: "تم تفعيل موادك المجانية", body: `تم تفعيل ${courseSlugs.length === 1 ? "المادة المجانية" : `${courseSlugs.length} مواد مجانية`} في حسابك.`, actionUrl: "/dashboard?view=learning", actionLabel: "فتح موادي", createdAt: now });
    return saved;
  });
  if (!completed) return jsonError("تعذر تفعيل المادة المجانية بأمان", 503);
  if (TERMINAL_ATTEMPT_STATUSES.has(completed.status)) return terminalAttemptResponse(completed);
  return Response.json(checkoutPayload(completed, courseSlugs, { reused }), { status: reused ? 200 : 201, headers: { ...responseHeaders, ...(reused ? { "x-idempotent-replay": "true" } : {}) } });
}

async function startTapCheckout(order: OrderRow, courseSlugs: string[], tapSecretKey: string, siteOrigin: string, reused: boolean, mobileClient: boolean) {
  if (COMPLETE_ATTEMPT_STATUSES.has(order.status)) return Response.json(checkoutPayload(order, courseSlugs, { reused: true }), { headers: { ...responseHeaders, "x-idempotent-replay": "true" } });
  if (TERMINAL_ATTEMPT_STATUSES.has(order.status)) return terminalAttemptResponse(order);
  if (order.total === 0 && order.subtotal === 0) return completeFreeCheckout(order, courseSlugs, reused);
  if (order.checkoutUrl) return Response.json(checkoutPayload(order, courseSlugs, { reused: true }), { headers: { ...responseHeaders, "x-idempotent-replay": "true" } });
  if (!tapSecretKey || !siteOrigin) return jsonError("بوابة الدفع قيد الإعداد. لم تُنشأ مطالبة مالية جديدة.", 503);

  const nameParts = order.customerName.split(/\s+/);
  const localPhone = (order.customerPhone || "").replace(/^\+?966/, "").replace(/^0/, "");
  let chargeResponse: Response;
  try {
    chargeResponse = await fetch("https://api.tap.company/v2/charges/", {
      method: "POST",
      headers: { authorization: `Bearer ${tapSecretKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        amount: order.total,
        currency: order.currency,
        customer_initiated: true,
        threeDSecure: true,
        save_card: false,
        description: `اشتراك ${courseSlugs.length} مواد في مراس`,
        metadata: { order_number: order.orderNumber, course_slugs: courseSlugs.join(",") },
        // Tap guarantees the same response for this idempotent reference for
        // 24 hours, closing the crash window between provider creation and DB persistence.
        reference: { transaction: order.orderNumber, order: order.orderNumber, idempotent: order.orderNumber },
        customer: { first_name: nameParts[0] || order.customerName, last_name: nameParts.slice(1).join(" ") || "طالب مراس", email: order.customerEmail, phone: { country_code: "966", number: localPhone } },
        source: { id: "src_all" },
        transaction: { expiry: { period: 30, type: "MINUTE" } },
        post: { url: `${siteOrigin}/api/webhooks/tap` },
        redirect: { url: mobileClient
          ? `${siteOrigin}/payment/return?channel=mobile&order=${encodeURIComponent(order.orderNumber)}`
          : `${siteOrigin}/dashboard?payment=return&order=${encodeURIComponent(order.orderNumber)}` },
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // A timeout is ambiguous: Tap may already have created the charge. Keep the
    // attempt open and let the same idempotent reference reconcile on retry.
    return pendingResponse(order, courseSlugs, reused);
  }

  let charge: TapChargeResponse;
  try { charge = await chargeResponse.json() as TapChargeResponse; } catch { charge = {}; }
  if (chargeResponse.ok && charge.id && charge.transaction?.url) {
    const now = new Date().toISOString();
    const [saved] = await getDb().update(orders).set({
      tapChargeId: charge.id,
      checkoutUrl: charge.transaction.url,
      status: sql`CASE WHEN ${orders.status} IN ('paid', 'partially_refunded', 'refunded', 'reversed', 'chargeback') THEN ${orders.status} ELSE 'initiated' END`,
      updatedAt: now,
    }).where(eq(orders.id, order.id)).returning();
    const current = saved || { ...order, tapChargeId: charge.id, checkoutUrl: charge.transaction.url, status: "initiated", updatedAt: now };
    return Response.json(checkoutPayload(current, courseSlugs, { reused }), { status: reused ? 200 : 201, headers: { ...responseHeaders, ...(reused ? { "x-idempotent-replay": "true" } : {}) } });
  }

  if (chargeResponse.status >= 500 || chargeResponse.status === 409 || chargeResponse.status === 429 || chargeResponse.ok) return pendingResponse(order, courseSlugs, reused);
  const closed = await failOrderAndReleaseCoupon(order.orderNumber);
  if (!closed) {
    const [current] = await getDb().select().from(orders).where(eq(orders.id, order.id)).limit(1);
    if (current && (COMPLETE_ATTEMPT_STATUSES.has(current.status) || TERMINAL_ATTEMPT_STATUSES.has(current.status) || current.checkoutUrl)) return startTapCheckout(current, courseSlugs, tapSecretKey, siteOrigin, true, mobileClient);
    if (current) return pendingResponse(current, courseSlugs, true);
  }
  return Response.json({ ok: false, error: charge.errors?.[0]?.description || "رفضت بوابة الدفع إنشاء المحاولة. ابدأ محاولة جديدة.", code: "TAP_CREATE_REJECTED", orderNumber: order.orderNumber, newAttemptRequired: true }, { status: 502, headers: responseHeaders });
}

async function replayAttempt(order: OrderRow, requestHash: string, userEmail: string, tapSecretKey: string, siteOrigin: string, now: string, mobileClient: boolean) {
  // Defence in depth: even a hash collision or future query refactor must never
  // reveal a hosted payment URL across accounts.
  if (order.customerEmail.toLowerCase() !== userEmail.toLowerCase()) return jsonError("تعارض في محاولة الدفع", 409);
  if (!order.checkoutRequestHash || order.checkoutRequestHash !== requestHash) {
    return Response.json({ ok: false, error: "استُخدم مفتاح محاولة الدفع مع سلة أو كوبون مختلف.", code: "IDEMPOTENCY_CONFLICT", newAttemptRequired: true }, { status: 409, headers: responseHeaders });
  }
  if (order.checkoutExpiresAt && order.checkoutExpiresAt <= now && !COMPLETE_ATTEMPT_STATUSES.has(order.status) && !TERMINAL_ATTEMPT_STATUSES.has(order.status)) {
    await expireCheckoutAttempt(order, now);
    const [expired] = await getDb().select().from(orders).where(eq(orders.id, order.id)).limit(1);
    return terminalAttemptResponse(expired || { ...order, status: "expired" });
  }
  return startTapCheckout(order, await courseSlugsForOrder(order), tapSecretKey, siteOrigin, true, mobileClient);
}

export async function POST(request: Request) {
  if (!isMobileRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول قبل الشراء", 401);
  if (user.role !== "student") return jsonError("الشراء متاح من حساب الطالب فقط", 403);
  if (!user.profileCompleted || !user.phone || !user.universitySlug || !user.specialty) return jsonError("أكمل رقم الجوال والجامعة والتخصص قبل الشراء", 409);
  if (!await checkRateLimit("checkout", `user:${user.id}:${clientIp(request)}`, 30, 15 * 60)) return jsonError("محاولات دفع كثيرة. حاول بعد 15 دقيقة.", 429);

  const attemptKey = request.headers.get("idempotency-key")?.trim() || "";
  if (!CHECKOUT_ATTEMPT_PATTERN.test(attemptKey)) return jsonError("يلزم مفتاح محاولة دفع قوي وصالح", 400);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات الدفع غير صالحة"); }
  const requestedSlugs = Array.isArray(payload.courseSlugs) ? payload.courseSlugs.map((slug) => cleanText(slug, 120)).filter(Boolean).slice(0, 30) : [cleanText(payload.courseSlug, 120)].filter(Boolean);
  if (!requestedSlugs.length) return jsonError("أضف مادة واحدة على الأقل إلى السلة", 400);
  const uniqueSlugs = [...new Set(requestedSlugs)].sort();
  const coupon = cleanText(payload.coupon, 40).toUpperCase();
  const [attemptHash, checkoutRequestHash] = await Promise.all([
    hashOpaqueToken(`checkout:${user.id}:${attemptKey}`),
    hashOpaqueToken(JSON.stringify({ courseSlugs: uniqueSlugs, coupon })),
  ]);

  const db = getDb();
  const now = new Date().toISOString();
  await releaseExpiredCouponReservations(now);
  const tapSecretKey = process.env.TAP_SECRET_KEY?.trim() || "";
  const siteOrigin = requestOrigin(request).replace(/\/$/, "");
  const mobileClient = request.headers.get("x-meras-client") === MOBILE_CLIENT && !request.headers.get("origin");
  const [existing] = await db.select().from(orders).where(eq(orders.checkoutAttemptHash, attemptHash)).limit(1);
  if (existing) return replayAttempt(existing, checkoutRequestHash, user.email, tapSecretKey, siteOrigin, now, mobileClient);

  let platformSettings;
  try { platformSettings = await getMutationPublicSettings(); }
  catch { return jsonError("تعذر التحقق من حالة الشراء الآن. لم تُنشأ أي مطالبة مالية.", 503); }
  if (!settingEnabled(platformSettings.purchases_enabled)) return jsonError(platformSettings.maintenance_message || "الشراء متوقف مؤقتًا. لم تُنشأ أي مطالبة مالية.", 503);

  const courses = await getCoursesCatalog();
  const selected = uniqueSlugs.map((slug) => courses.find((course) => course.slug === slug)).filter((course): course is NonNullable<typeof course> => Boolean(course));
  if (selected.length !== uniqueSlugs.length) return jsonError("إحدى المواد غير موجودة أو غير منشورة", 404);
  const preparing = selected.filter((course) => !course.availableForPurchase);
  if (preparing.length) return jsonError(`المواد التالية قيد التجهيز ولا تقبل الدفع بعد: ${preparing.map((course) => course.title).join("، ")}`, 409);
  const activeAccess = await db.select({ courseSlug: courseAccess.courseSlug }).from(courseAccess).where(and(eq(courseAccess.userEmail, user.email), inArray(courseAccess.courseSlug, uniqueSlugs), isNull(courseAccess.revokedAt), or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, now))));
  if (activeAccess.length) return jsonError(`لديك وصول مفعّل مسبقًا إلى: ${activeAccess.map((row) => row.courseSlug).join(", ")}`, 409);

  const couponQuote = coupon ? selected.length === 1 ? await quoteCoupon(coupon, selected[0].slug, selected[0].price) : await quoteCouponForCart(coupon, selected.map((course) => ({ courseSlug: course.slug, price: course.price }))) : null;
  if (coupon && !couponQuote) return jsonError("كود الخصم غير صالح أو منتهي أو غير مخصص لهذه السلة", 409);
  const subtotal = Math.round(selected.reduce((sum, course) => sum + course.price, 0) * 100) / 100;
  const discount = Math.min(couponQuote?.discount || 0, Math.max(0, subtotal - 1));
  const total = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
  const freeCheckout = subtotal === 0 && total === 0;
  if (total === 0 && !freeCheckout) return jsonError("تعذر مطابقة إجمالي الطلب المجاني", 409);
  if (total > 0 && total < 0.1) return jsonError("إجمالي الطلب أقل من الحد الذي تقبله بوابة الدفع. راجع سعر المادة مع الإدارة.", 409);
  if (!freeCheckout && !tapSecretKey) return jsonError("بوابة الدفع قيد الإعداد. لم تُنشأ أي عملية أو مطالبة مالية.", 503);
  if (!freeCheckout && !siteOrigin) return jsonError("رابط المنصة العام غير مضبوط. لم تُنشأ أي عملية أو مطالبة مالية.", 503);
  const orderNumber = createOrderNumber();
  const checkoutExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const orderItemValues = orderItemQuote(selected, discount, couponQuote?.courseSlug, orderNumber);
  if (Math.abs(orderItemValues.reduce((sum, item) => sum + item.total, 0) - total) > 0.001) return jsonError("تعذر احتساب تفاصيل الخصم بصورة متسقة", 500);

  let sharedAttempt: OrderRow | undefined;
  try {
    sharedAttempt = await db.transaction(async (tx) => {
      // A client-side key is necessary for retries, but two tabs can still
      // mint different keys at the same instant. Serialize the user+intent and
      // reuse its active order before reserving a coupon or creating a charge.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`checkout:${user.id}:${checkoutRequestHash}`}, 0))`);
      const [inFlight] = await tx.select().from(orders).where(and(
        eq(orders.customerEmail, user.email),
        eq(orders.checkoutRequestHash, checkoutRequestHash),
        inArray(orders.status, ["pending", "creating", "initiated"]),
        gt(orders.checkoutExpiresAt, now),
      )).orderBy(orders.id).limit(1);
      if (inFlight) return inFlight;
      if (couponQuote) {
        await tx.execute(sql`SELECT id FROM coupons WHERE code = ${couponQuote.code} FOR UPDATE`);
        const [liveCoupon] = await tx.select().from(couponsDb).where(eq(couponsDb.code, couponQuote.code)).limit(1);
        const eligibleSubtotal = liveCoupon?.courseSlug ? selected.filter((course) => course.slug === liveCoupon.courseSlug).reduce((sum, course) => sum + course.price, 0) : subtotal;
        const requestedDiscount = liveCoupon?.type === "percent" ? eligibleSubtotal * Math.min(liveCoupon.value, 95) / 100 : liveCoupon?.value || 0;
        const liveDiscount = Math.round(Math.min(Math.max(0, requestedDiscount), Math.max(0, eligibleSubtotal - 1)) * 100) / 100;
        const eligibleNow = Boolean(liveCoupon && liveCoupon.status === "active" && (!liveCoupon.startsAt || Date.parse(liveCoupon.startsAt) <= Date.parse(now)) && (!liveCoupon.expiresAt || Date.parse(liveCoupon.expiresAt) > Date.parse(now)) && (liveCoupon.usageLimit === null || liveCoupon.usedCount < liveCoupon.usageLimit) && eligibleSubtotal > 0 && Math.abs(liveDiscount - couponQuote.discount) < 0.001);
        if (!eligibleNow) throw new CouponReservationError();
        await tx.update(couponsDb).set({ usedCount: sql`${couponsDb.usedCount} + 1` }).where(eq(couponsDb.code, couponQuote.code));
      }
      await tx.insert(orders).values({
        orderNumber,
        customerEmail: user.email,
        customerName: user.fullName,
        customerPhone: user.phone,
        courseSlug: selected[0].slug,
        subtotal,
        discount,
        couponCode: couponQuote?.code || null,
        couponReserved: Boolean(couponQuote),
        couponReservationExpiresAt: couponQuote ? checkoutExpiresAt : null,
        total,
        currency: "SAR",
        status: "pending",
        checkoutAttemptHash: attemptHash,
        checkoutRequestHash,
        checkoutExpiresAt,
      });
      await tx.insert(orderItems).values(orderItemValues);
      return undefined;
    });
  } catch (error) {
    if (error instanceof CouponReservationError) return jsonError("نفدت مرات استخدام كود الخصم للتو. حدّث السلة وحاول مرة أخرى.", 409);
    if (isUniqueConstraintError(error)) {
      const [raced] = await db.select().from(orders).where(eq(orders.checkoutAttemptHash, attemptHash)).limit(1);
      if (raced) return replayAttempt(raced, checkoutRequestHash, user.email, tapSecretKey, siteOrigin, now, mobileClient);
    }
    return jsonError("تعذر إنشاء الطلب بأمان. لم تُنشأ أي مطالبة مالية.", 503);
  }

  if (sharedAttempt) return replayAttempt(sharedAttempt, checkoutRequestHash, user.email, tapSecretKey, siteOrigin, now, mobileClient);

  const [created] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
  if (!created) return jsonError("تعذر تثبيت محاولة الدفع", 503);
  if (freeCheckout) return completeFreeCheckout(created, uniqueSlugs, false);
  return startTapCheckout(created, uniqueSlugs, tapSecretKey, siteOrigin, false, mobileClient);
}
