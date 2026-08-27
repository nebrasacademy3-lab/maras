import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { courseAccess, orderItems, orders } from "@/db/schema";
import { checkRateLimit, clientIp, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { cleanText, jsonError, requestOrigin } from "@/lib/api";
import { getCoursesCatalog } from "@/lib/catalog-store";
import { quoteCoupon, quoteCouponForCart } from "@/lib/coupons";

type TapChargeResponse = { id?: string; status?: string; transaction?: { url?: string }; errors?: Array<{ description?: string }> };

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

  const requestedSlugs = Array.isArray(payload.courseSlugs) ? payload.courseSlugs.map((slug) => cleanText(slug, 120)).filter(Boolean).slice(0, 30) : [cleanText(payload.courseSlug, 120)].filter(Boolean);
  if (!requestedSlugs.length) return jsonError("أضف مادة واحدة على الأقل إلى السلة", 400);
  const uniqueSlugs = [...new Set(requestedSlugs)];
  const courses = await getCoursesCatalog();
  const selected = uniqueSlugs.map((slug) => courses.find((course) => course.slug === slug)).filter((course): course is NonNullable<typeof course> => Boolean(course));
  if (selected.length !== uniqueSlugs.length) return jsonError("إحدى المواد غير موجودة أو غير منشورة", 404);

  const db = getDb();
  const now = new Date().toISOString();
  const activeAccess = await db.select({ courseSlug: courseAccess.courseSlug }).from(courseAccess).where(and(eq(courseAccess.userEmail, user.email), inArray(courseAccess.courseSlug, uniqueSlugs), isNull(courseAccess.revokedAt), or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, now))));
  if (activeAccess.length) return jsonError(`لديك وصول مفعّل مسبقًا إلى: ${activeAccess.map((row) => row.courseSlug).join(", ")}`, 409);

  const coupon = cleanText(payload.coupon, 40).toUpperCase();
  const couponQuote = coupon ? selected.length === 1 ? await quoteCoupon(coupon, selected[0].slug, selected[0].price) : await quoteCouponForCart(coupon, selected.map((course) => ({ courseSlug: course.slug, price: course.price }))) : null;
  if (coupon && !couponQuote) return jsonError("كود الخصم غير صالح أو منتهي أو غير مخصص لهذه السلة", 409);
  const subtotal = Math.round(selected.reduce((sum, course) => sum + course.price, 0) * 100) / 100;
  const discount = Math.min(couponQuote?.discount || 0, Math.max(0, subtotal - 1));
  const total = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
  const orderNumber = createOrderNumber();
  const customerName = user.fullName;
  const customerEmail = user.email;
  const customerPhone = user.phone;
  const tapSecretKey = process.env.TAP_SECRET_KEY?.trim();
  if (!tapSecretKey) return jsonError("بوابة الدفع قيد الإعداد. لم تُنشأ أي عملية أو مطالبة مالية.", 503);

  const discountIndex = couponQuote?.courseSlug ? selected.findIndex((course) => course.slug === couponQuote.courseSlug) : 0;
  const orderItemValues = selected.map((course, index) => { const itemDiscount = index === discountIndex ? discount : 0; return { orderNumber, courseSlug: course.slug, unitPrice: course.price, discount: itemDiscount, total: Math.max(0, course.price - itemDiscount) }; });
  await db.transaction(async (tx) => {
    await tx.insert(orders).values({ orderNumber, customerEmail, customerName, customerPhone: customerPhone || undefined, courseSlug: selected[0].slug, subtotal, discount, couponCode: couponQuote?.code || null, total, currency: "SAR", status: "pending" });
    await tx.insert(orderItems).values(orderItemValues);
  });

  const siteOrigin = (process.env.APP_URL || requestOrigin(request)).replace(/\/$/, "");
  const nameParts = customerName.split(/\s+/);
  const localPhone = customerPhone.replace(/^\+?966/, "").replace(/^0/, "");
  let chargeResponse: Response;
  try {
    chargeResponse = await fetch("https://api.tap.company/v2/charges/", {
      method: "POST",
      headers: { authorization: `Bearer ${tapSecretKey}`, "content-type": "application/json" },
      body: JSON.stringify({ amount: total, currency: "SAR", customer_initiated: true, threeDSecure: true, save_card: false, description: `اشتراك ${selected.length} مواد في مراس`, metadata: { order_number: orderNumber, course_slugs: uniqueSlugs.join(",") }, reference: { transaction: orderNumber, order: orderNumber }, customer: { first_name: nameParts[0] || customerName, last_name: nameParts.slice(1).join(" ") || "طالب مراس", email: customerEmail, phone: { country_code: "966", number: localPhone } }, source: { id: "src_all" }, post: { url: `${siteOrigin}/api/webhooks/tap` }, redirect: { url: `${siteOrigin}/dashboard?payment=return&order=${encodeURIComponent(orderNumber)}` } }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    await db.update(orders).set({ status: "failed", updatedAt: new Date().toISOString() }).where(eq(orders.orderNumber, orderNumber));
    return jsonError("تعذر الاتصال ببوابة الدفع. لم تُنشأ مطالبة مالية.", 502);
  }
  let charge: TapChargeResponse;
  try { charge = await chargeResponse.json() as TapChargeResponse; } catch { charge = {}; }
  if (!chargeResponse.ok || !charge.id || !charge.transaction?.url) {
    await db.update(orders).set({ status: "failed", updatedAt: new Date().toISOString() }).where(eq(orders.orderNumber, orderNumber));
    return jsonError(charge.errors?.[0]?.description || "تعذر بدء عملية الدفع. حاول مرة أخرى.", 502);
  }
  await db.update(orders).set({ tapChargeId: charge.id, status: "initiated", updatedAt: new Date().toISOString() }).where(eq(orders.orderNumber, orderNumber));
  return Response.json({ ok: true, mode: "live", orderNumber, courseSlugs: uniqueSlugs, subtotal, discount, total, checkoutUrl: charge.transaction.url }, { status: 201, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
