import { and, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { courseAccess, orders } from "@/db/schema";
import { getSessionUser, sameOriginRequest } from "@/lib/auth";
import { cleanText, jsonError, requestOrigin } from "@/lib/api";
import { getCourseCatalog } from "@/lib/catalog-store";
import { quoteCoupon } from "@/lib/coupons";

type TapChargeResponse = {
  id?: string;
  status?: string;
  transaction?: { url?: string };
  errors?: Array<{ description?: string }>; 
};

function createOrderNumber() {
  const random = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
  return `MR-${Date.now().toString(36).toUpperCase()}-${random}`;
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول قبل الشراء", 401);
  if (!user.profileCompleted || !user.phone || !user.universitySlug || !user.specialty) return jsonError("أكمل رقم الجوال والجامعة والتخصص قبل الشراء", 409);
  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return jsonError("بيانات الدفع غير صالحة");
  }

  const courseSlug = cleanText(payload.courseSlug, 120);
  const course = await getCourseCatalog(courseSlug);
  if (!course) return jsonError("المادة غير موجودة", 404);

  const customerName = user.fullName;
  const customerEmail = user.email;
  const customerPhone = user.phone;

  const coupon = cleanText(payload.coupon, 40).toUpperCase();
  const couponQuote = coupon ? await quoteCoupon(coupon, course.slug, course.price) : null;
  if (coupon && !couponQuote) return jsonError("كود الخصم غير صالح أو منتهي", 409);
  const discount = couponQuote?.discount || 0;
  const total = Math.max(0, Math.round((course.price - discount) * 100) / 100);
  const orderNumber = createOrderNumber();
  const db = getDb();
  const tapSecretKey = process.env.TAP_SECRET_KEY?.trim();

  const [activeAccess] = await db.select({ id: courseAccess.id }).from(courseAccess).where(and(eq(courseAccess.userEmail, customerEmail), eq(courseAccess.courseSlug, courseSlug), isNull(courseAccess.revokedAt), or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, new Date().toISOString())))).limit(1);
  if (activeAccess) return jsonError("هذه المادة مفعّلة في حسابك بالفعل", 409);
  if (!tapSecretKey) return jsonError("بوابة الدفع قيد الإعداد. لم تُنشأ أي عملية أو مطالبة مالية.", 503);

  await db.insert(orders).values({
    orderNumber,
    customerEmail,
    customerName,
    customerPhone: customerPhone || undefined,
    courseSlug,
    subtotal: course.price,
    discount,
    couponCode: couponQuote?.code || null,
    total,
    currency: "SAR",
    status: "pending",
  });

  const siteOrigin = (process.env.APP_URL || requestOrigin(request)).replace(/\/$/, "");
  const nameParts = customerName.split(/\s+/);
  const localPhone = customerPhone.replace(/^\+?966/, "").replace(/^0/, "");
  const chargeResponse = await fetch("https://api.tap.company/v2/charges/", {
    method: "POST",
    headers: {
      authorization: `Bearer ${tapSecretKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      amount: total,
      currency: "SAR",
      customer_initiated: true,
      threeDSecure: true,
      save_card: false,
      description: `اشتراك مادة ${course.title}`,
      metadata: { order_number: orderNumber, course_slug: course.slug },
      reference: { transaction: orderNumber, order: orderNumber },
      customer: {
        first_name: nameParts[0] || customerName,
        last_name: nameParts.slice(1).join(" ") || "طالب مراس",
        email: customerEmail,
        phone: { country_code: "966", number: localPhone },
      },
      source: { id: "src_all" },
      post: { url: `${siteOrigin}/api/webhooks/tap` },
      redirect: { url: `${siteOrigin}/dashboard?payment=return&order=${encodeURIComponent(orderNumber)}` },
    }),
  });

  const charge = await chargeResponse.json() as TapChargeResponse;
  if (!chargeResponse.ok || !charge.id || !charge.transaction?.url) {
    await db.update(orders).set({ status: "failed", updatedAt: new Date().toISOString() }).where(eq(orders.orderNumber, orderNumber));
    return jsonError(charge.errors?.[0]?.description || "تعذر بدء عملية الدفع. حاول مرة أخرى.", 502);
  }

  await db.update(orders).set({ tapChargeId: charge.id, status: "initiated", updatedAt: new Date().toISOString() }).where(eq(orders.orderNumber, orderNumber));
  return Response.json({ ok: true, mode: "live", orderNumber, checkoutUrl: charge.transaction.url }, { status: 201 });
}
