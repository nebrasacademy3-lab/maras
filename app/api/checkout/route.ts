import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { analyticsEvents, courseAccess, courseBundleItems, courseBundles, orderItems, orders } from "@/db/schema";
import { checkRateLimit, clientIp, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { cleanText, jsonError, requestOrigin } from "@/lib/api";
import { getCoursesCatalog } from "@/lib/catalog-store";
import { allocateBundleDiscountMinor, getActiveCourseBundleQuote } from "@/lib/course-bundles";
import { quoteCoupon, quoteCouponForCart, releaseCouponReservation, reserveCouponForCheckoutTx } from "@/lib/coupons";
import { normalizeAccessDurationDays } from "@/lib/course-access";
import { fromMinorUnits, toMinorUnits } from "@/lib/finance";

type TapChargeResponse = { id?: string; status?: string; transaction?: { url?: string }; errors?: Array<{ description?: string }> };
type PaymentMethod = "tap" | "tabby" | "tamara";
type OrderRow = typeof orders.$inferSelect;

const CHECKOUT_EXPIRY_MINUTES = 30;
const OPEN_CHECKOUT_STATUSES = ["pending", "initiated", "in_progress", "authorized", "verification_pending", "payment_review"];

function checkoutIsFresh(createdAt: string) {
  const createdTime = Date.parse(createdAt);
  return Number.isFinite(createdTime) && createdTime > Date.now() - CHECKOUT_EXPIRY_MINUTES * 60 * 1000;
}

function existingCheckoutResponse(existing: OrderRow, courseSlugs: string[]) {
  if (!checkoutIsFresh(existing.createdAt)) {
    return Response.json({ error: "انتهت صلاحية محاولة الدفع السابقة. يمكنك بدء محاولة جديدة الآن.", retryable: true }, { status: 409, headers: { "cache-control": "no-store" } });
  }
  if (existing.checkoutUrl && ["pending", "initiated", "in_progress"].includes(existing.status)) {
    return Response.json({
      ok: true,
      replayed: true,
      mode: "live",
      paymentMethod: existing.paymentMethod,
      orderNumber: existing.orderNumber,
      courseSlugs,
      bundleSlug: existing.bundleSlug,
      subtotal: existing.subtotal,
      discount: existing.discount,
      total: existing.total,
      subtotalMinor: existing.subtotalMinor ?? toMinorUnits(existing.subtotal),
      discountMinor: existing.discountMinor ?? toMinorUnits(existing.discount),
      totalMinor: existing.totalMinor ?? toMinorUnits(existing.total),
      checkoutUrl: existing.checkoutUrl,
    }, { status: 200, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  }
  return Response.json({ error: "محاولة الدفع لهذه السلة قيد الإنشاء أو التحقق. لم ننشئ مطالبة جديدة؛ انتظر لحظات ثم أعد المحاولة.", pending: true, orderNumber: existing.orderNumber }, { status: 202, headers: { "cache-control": "no-store", "retry-after": "3" } });
}

function paymentSource(method: PaymentMethod) {
  if (method === "tabby") return "src_tabby.installement";
  if (method === "tamara") return "src_tamara";
  return "src_all";
}

function createOrderNumber() {
  const random = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
  return `MR-${Date.now().toString(36).toUpperCase()}-${random}`;
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول قبل الشراء", 401);
  if (!user.profileCompleted || !user.phone || !user.universitySlug || !user.specialty) return jsonError("أكمل رقم الجوال والجامعة والتخصص قبل الشراء", 409);
  if (!await checkRateLimit("checkout", `user:${user.id}:${clientIp(request)}`, 12, 15 * 60)) return jsonError("محاولات دفع كثيرة. حاول بعد 15 دقيقة.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات الدفع غير صالحة"); }
  const requestedPaymentMethod = cleanText(payload.paymentMethod, 20) || "tap";
  if (!["tap", "tabby", "tamara"].includes(requestedPaymentMethod)) return jsonError("طريقة الدفع غير مدعومة");
  const paymentMethod = requestedPaymentMethod as PaymentMethod;
  if (paymentMethod === "tabby" && process.env.TAP_TABBY_ENABLED !== "true") return jsonError("تابي غير مفعّل حاليًا على حساب المتجر", 409);
  if (paymentMethod === "tamara" && process.env.TAP_TAMARA_ENABLED !== "true") return jsonError("تمارا غير مفعّلة حاليًا على حساب المتجر", 409);
  const suppliedCheckoutKey = cleanText(request.headers.get("idempotency-key") || payload.checkoutKey, 100);
  const checkoutKey = `${user.id}:${/^[A-Za-z0-9_-]{12,90}$/.test(suppliedCheckoutKey) ? suppliedCheckoutKey : crypto.randomUUID()}`;

  const requestedSlugs = Array.isArray(payload.courseSlugs) ? payload.courseSlugs.map((slug) => cleanText(slug, 120)).filter(Boolean).slice(0, 30) : [cleanText(payload.courseSlug, 120)].filter(Boolean);
  if (!requestedSlugs.length) return jsonError("أضف مادة واحدة على الأقل إلى السلة", 400);
  const uniqueSlugs = [...new Set(requestedSlugs)];
  const requestedSorted = [...uniqueSlugs].sort();
  const requestedCoupon = cleanText(payload.coupon, 40).toUpperCase();
  const requestedBundleSlug = cleanText(payload.bundleSlug, 120).toLowerCase();
  if (requestedBundleSlug && !/^[a-z0-9][a-z0-9._-]*$/.test(requestedBundleSlug)) return jsonError("معرّف الباقة غير صالح", 400);
  if (requestedCoupon && requestedBundleSlug) return jsonError("لا يمكن الجمع بين باقة مخفضة وكود خصم في الطلب نفسه", 409);
  const courses = await getCoursesCatalog();
  const selected = uniqueSlugs.map((slug) => courses.find((course) => course.slug === slug)).filter((course): course is NonNullable<typeof course> => Boolean(course));
  if (selected.length !== uniqueSlugs.length) return jsonError("إحدى المواد غير موجودة أو غير منشورة", 404);
  const preparing = selected.filter((course) => !course.availableForPurchase);
  if (preparing.length) return jsonError(`المواد التالية قيد التجهيز ولا تقبل الدفع بعد: ${preparing.map((course) => course.title).join("، ")}`, 409);

  const db = getDb();
  const replayExistingCheckout = async () => {
    const [existing] = await db.select().from(orders).where(eq(orders.checkoutKey, checkoutKey)).limit(1);
    if (!existing) return null;
    const existingItems = await db.select({ courseSlug: orderItems.courseSlug }).from(orderItems).where(eq(orderItems.orderNumber, existing.orderNumber));
    const existingSlugs = (existingItems.length ? existingItems.map((item) => item.courseSlug) : [existing.courseSlug]).sort();
    const sameRequest = existing.customerEmail === user.email
      && existing.paymentMethod === paymentMethod
      && existing.couponCode === (requestedCoupon || null)
      && existing.bundleSlug === (requestedBundleSlug || null)
      && existingSlugs.length === requestedSorted.length
      && existingSlugs.every((slug, index) => slug === requestedSorted[index]);
    if (!sameRequest) return jsonError("مفتاح محاولة الدفع مستخدم لطلب مختلف. حدّث الصفحة وابدأ محاولة جديدة.", 409);
    if (["failed", "cancelled", "declined"].includes(existing.status)) {
      return Response.json({ error: "تعذرت محاولة الدفع السابقة. يمكنك بدء محاولة جديدة الآن.", retryable: true }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    return existingCheckoutResponse(existing, existingSlugs);
  };
  const replay = await replayExistingCheckout();
  if (replay) return replay;

  const now = new Date().toISOString();
  const activeAccess = await db.select({ courseSlug: courseAccess.courseSlug }).from(courseAccess).where(and(eq(courseAccess.userEmail, user.email), inArray(courseAccess.courseSlug, uniqueSlugs), isNull(courseAccess.revokedAt), or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, now))));
  if (activeAccess.length) return jsonError(`لديك وصول مفعّل مسبقًا إلى: ${activeAccess.map((row) => row.courseSlug).join(", ")}`, 409);

  const bundleQuote = requestedBundleSlug ? await getActiveCourseBundleQuote(requestedBundleSlug, uniqueSlugs) : null;
  if (requestedBundleSlug && !bundleQuote) return jsonError("الباقة غير متاحة حاليًا أو لا تطابق مواد السلة كاملة", 409);
  const coupon = requestedCoupon;
  const couponQuote = coupon ? selected.length === 1 ? await quoteCoupon(coupon, selected[0].slug, selected[0].price, user.id) : await quoteCouponForCart(coupon, selected.map((course) => ({ courseSlug: course.slug, price: course.price })), user.id) : null;
  if (coupon && !couponQuote) return jsonError("كود الخصم غير صالح أو منتهي أو غير مخصص لهذه السلة", 409);
  const subtotalMinor = selected.reduce((sum, course) => sum + toMinorUnits(course.price), 0);
  const discountMinor = bundleQuote
    ? Math.min(bundleQuote.discountMinor, Math.max(0, subtotalMinor - 100))
    : Math.min(toMinorUnits(couponQuote?.discount || 0), Math.max(0, subtotalMinor - 100));
  const totalMinor = Math.max(0, subtotalMinor - discountMinor);
  const subtotal = fromMinorUnits(subtotalMinor);
  const discount = fromMinorUnits(discountMinor);
  const total = fromMinorUnits(totalMinor);
  if (paymentMethod === "tabby" && totalMinor < 1_000) return jsonError("الحد الأدنى للدفع عبر تابي هو 10 ر.س", 409);
  const orderNumber = createOrderNumber();
  const customerName = user.fullName;
  const customerEmail = user.email;
  const customerPhone = user.phone;
  const tapSecretKey = process.env.TAP_SECRET_KEY?.trim();
  if (!tapSecretKey) return jsonError("بوابة الدفع قيد الإعداد. لم تُنشأ أي عملية أو مطالبة مالية.", 503);

  const priceMinors = selected.map((course) => toMinorUnits(course.price));
  let itemDiscountMinors = allocateBundleDiscountMinor(priceMinors, discountMinor);
  if (!bundleQuote && couponQuote?.courseSlug) {
    const discountIndex = selected.findIndex((course) => course.slug === couponQuote.courseSlug);
    if (discountIndex >= 0 && discountMinor <= priceMinors[discountIndex]) {
      itemDiscountMinors = selected.map((_, index) => index === discountIndex ? discountMinor : 0);
    }
  }
  const orderItemValues = selected.map((course, index) => ({
    orderNumber,
    courseSlug: course.slug,
    unitPrice: fromMinorUnits(priceMinors[index]),
    discount: fromMinorUnits(itemDiscountMinors[index]),
    total: fromMinorUnits(priceMinors[index] - itemDiscountMinors[index]),
    accessDurationDays: normalizeAccessDurationDays(course.accessDurationDays, course.access),
  }));
  const creation = await db.transaction(async (tx) => {
    const requestedCartJson = JSON.stringify(requestedSorted);
    const cartLockKey = `checkout:${user.id}:${requestedCartJson}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${cartLockKey}))`);
    if (bundleQuote) {
      const [lockedBundle] = await tx.select({ id: courseBundles.id, discountType: courseBundles.discountType, discountValue: courseBundles.discountValue }).from(courseBundles).where(and(
        eq(courseBundles.slug, bundleQuote.slug),
        eq(courseBundles.status, "published"),
        sql`(${courseBundles.startsAt} IS NULL OR ${courseBundles.startsAt}::timestamptz <= NOW())`,
        sql`(${courseBundles.expiresAt} IS NULL OR ${courseBundles.expiresAt}::timestamptz > NOW())`,
      )).limit(1).for("share");
      if (!lockedBundle || lockedBundle.discountType !== bundleQuote.discountType || lockedBundle.discountValue !== bundleQuote.discountValue) return { kind: "bundle_changed" as const };
      const lockedItems = await tx.select({ courseSlug: courseBundleItems.courseSlug }).from(courseBundleItems).where(eq(courseBundleItems.bundleId, lockedBundle.id));
      const lockedSlugs = lockedItems.map((item) => item.courseSlug).sort();
      if (lockedSlugs.length !== requestedSorted.length || lockedSlugs.some((slug, index) => slug !== requestedSorted[index])) return { kind: "bundle_changed" as const };
    }
    const recentOrders = await tx.select().from(orders).where(and(
      eq(orders.customerEmail, customerEmail),
      inArray(orders.status, OPEN_CHECKOUT_STATUSES),
      sql`${orders.createdAt}::timestamptz >= NOW() - INTERVAL '30 minutes'`,
      sql`COALESCE((SELECT jsonb_agg(oi.course_slug ORDER BY oi.course_slug) FROM order_items AS oi WHERE oi.order_number = ${orders.orderNumber}), jsonb_build_array(${orders.courseSlug})) = ${requestedCartJson}::jsonb`,
    )).orderBy(
      sql`CASE WHEN ${orders.paymentMethod} = ${paymentMethod} AND ${orders.couponCode} IS NOT DISTINCT FROM ${couponQuote?.code || null} AND ${orders.bundleSlug} IS NOT DISTINCT FROM ${bundleQuote?.slug || null} THEN 0 ELSE 1 END`,
      sql`${orders.createdAt}::timestamptz DESC`,
    ).limit(1);
    const [existing] = recentOrders;
    if (existing) {
      const sameConfiguration = existing.paymentMethod === paymentMethod
        && existing.couponCode === (couponQuote?.code || null)
        && existing.bundleSlug === (bundleQuote?.slug || null);
      if (!sameConfiguration) return { kind: "conflict" as const, existing };
      return { kind: "existing" as const, existing, existingSlugs: requestedSorted };
    }
    if (couponQuote) {
      const reservation = await reserveCouponForCheckoutTx(tx, { quote: couponQuote, userId: user.id, orderNumber, eligibleCourseSlugs: requestedSorted, now, reservationMinutes: CHECKOUT_EXPIRY_MINUTES });
      if (!reservation.ok) return { kind: "coupon_unavailable" as const, reason: reservation.reason };
    }
    const inserted = await tx.insert(orders).values({ orderNumber, customerEmail, customerName, customerPhone: customerPhone || undefined, courseSlug: selected[0].slug, subtotal, discount, couponCode: couponQuote?.code || null, bundleSlug: bundleQuote?.slug || null, total, subtotalMinor, discountMinor, taxAmountMinor: 0, totalMinor, currency: "SAR", status: "pending", paymentMethod, checkoutKey, createdAt: now, updatedAt: now }).onConflictDoNothing({ target: orders.checkoutKey }).returning({ orderNumber: orders.orderNumber });
    if (!inserted.length) return { kind: "checkout_key_conflict" as const };
    await tx.insert(orderItems).values(orderItemValues);
    await tx.insert(analyticsEvents).values({ event: "checkout_start", userEmail: user.email, courseSlug: selected[0].slug, metadataJson: JSON.stringify({ orderNumber, method: paymentMethod, value: total, currency: "SAR", bundleSlug: bundleQuote?.slug || null }), createdAt: now });
    return { kind: "created" as const };
  });
  if (creation.kind === "bundle_changed") return jsonError("تغيرت الباقة أثناء بدء الدفع. حدّث السلة ثم أعد اختيار العرض.", 409);
  if (creation.kind === "coupon_unavailable") return jsonError("تغيرت حالة الكوبون أو تم حجزه في محاولة دفع أخرى. حدّث السلة ثم حاول مجددًا.", 409);
  if (creation.kind === "existing") return existingCheckoutResponse(creation.existing, creation.existingSlugs);
  if (creation.kind === "conflict") return Response.json({ error: "توجد محاولة دفع حديثة لهذه السلة بطريقة دفع أو عرض مختلف. استخدم المحاولة الحالية أو انتظر انتهاءها قبل تغيير الخيار.", pending: true, orderNumber: creation.existing.orderNumber }, { status: 409, headers: { "cache-control": "no-store", "retry-after": "3" } });
  if (creation.kind === "checkout_key_conflict") {
    await releaseCouponReservation(orderNumber);
    return await replayExistingCheckout() || jsonError("محاولة الدفع نفسها قيد التجهيز. حاول بعد لحظات.", 409);
  }

  const siteOrigin = (process.env.APP_URL || requestOrigin(request)).replace(/\/$/, "");
  const nameParts = customerName.split(/\s+/);
  const localPhone = customerPhone.replace(/^\+?966/, "").replace(/^0/, "");
  let chargeResponse: Response;
  try {
    chargeResponse = await fetch("https://api.tap.company/v2/charges/", {
      method: "POST",
      headers: { authorization: `Bearer ${tapSecretKey}`, "content-type": "application/json" },
      body: JSON.stringify({ amount: total, currency: "SAR", customer_initiated: true, threeDSecure: true, save_card: false, description: bundleQuote ? `باقة ${bundleQuote.title} في مراس` : `اشتراك ${selected.length} مواد في مراس`, transaction: { expiry: { period: CHECKOUT_EXPIRY_MINUTES, type: "MINUTE" } }, metadata: { order_number: orderNumber, course_slugs: uniqueSlugs.join(","), payment_method: paymentMethod, bundle_slug: bundleQuote?.slug || "" }, reference: { transaction: orderNumber, order: orderNumber }, customer: { first_name: nameParts[0] || customerName, last_name: nameParts.slice(1).join(" ") || "طالب مراس", email: customerEmail, phone: { country_code: "966", number: localPhone } }, source: { id: paymentSource(paymentMethod) }, post: { url: `${siteOrigin}/api/webhooks/tap` }, redirect: { url: `${siteOrigin}/dashboard?payment=return&order=${encodeURIComponent(orderNumber)}` } }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // A transport timeout is ambiguous: Tap may have received the charge even
    // when our server did not receive its response. Keep the order reconcilable
    // and never invite an immediate duplicate charge.
    await db.update(orders).set({ status: "verification_pending", updatedAt: new Date().toISOString() }).where(eq(orders.orderNumber, orderNumber));
    await db.insert(analyticsEvents).values({ event: "checkout_pending", userEmail: user.email, courseSlug: selected[0].slug, metadataJson: JSON.stringify({ orderNumber, method: paymentMethod, value: total, currency: "SAR", bundleSlug: bundleQuote?.slug || null }), createdAt: new Date().toISOString() });
    return Response.json({ error: "تعذر تأكيد استجابة بوابة الدفع. لم نكرر المطالبة، وسنتحقق من المحاولة الحالية تلقائيًا.", pending: true, orderNumber }, { status: 202, headers: { "cache-control": "no-store", "retry-after": "5" } });
  }
  let charge: TapChargeResponse;
  try { charge = await chargeResponse.json() as TapChargeResponse; } catch { charge = {}; }
  if (!chargeResponse.ok || !charge.id || !charge.transaction?.url) {
    await db.update(orders).set({ status: "failed", updatedAt: new Date().toISOString() }).where(eq(orders.orderNumber, orderNumber));
    await releaseCouponReservation(orderNumber);
    await db.insert(analyticsEvents).values({ event: "payment_failed", userEmail: user.email, courseSlug: selected[0].slug, metadataJson: JSON.stringify({ orderNumber, method: paymentMethod, value: total, currency: "SAR", bundleSlug: bundleQuote?.slug || null }), createdAt: new Date().toISOString() });
    return jsonError(charge.errors?.[0]?.description || "تعذر بدء عملية الدفع. حاول مرة أخرى.", 502);
  }
  await db.update(orders).set({ tapChargeId: charge.id, checkoutUrl: charge.transaction.url, status: "initiated", updatedAt: new Date().toISOString() }).where(eq(orders.orderNumber, orderNumber));
  await db.insert(analyticsEvents).values({ event: "checkout_redirect", userEmail: user.email, courseSlug: selected[0].slug, metadataJson: JSON.stringify({ orderNumber, method: paymentMethod, value: total, currency: "SAR", bundleSlug: bundleQuote?.slug || null }), createdAt: new Date().toISOString() });
  return Response.json({ ok: true, mode: "live", paymentMethod, orderNumber, courseSlugs: uniqueSlugs, bundleSlug: bundleQuote?.slug || null, subtotal, discount, total, subtotalMinor, discountMinor, totalMinor, checkoutUrl: charge.transaction.url }, { status: 201, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
