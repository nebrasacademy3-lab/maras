import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { cartItems, couponsDb, courseAccess, invoices, notificationsDb, orderItems, orders, paymentEvents } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { sendPushNotification } from "@/lib/push";

type TapReference = { order?: string; transaction?: string; gateway?: string; payment?: string };
type TapCharge = {
  id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  updated?: string;
  created?: string;
  transaction?: { created?: string };
  metadata?: { order_number?: string; course_slug?: string; course_slugs?: string };
  reference?: TapReference;
  customer?: { email?: string };
};

function orderState(status: string) {
  if (status === "CAPTURED") return "paid";
  if (["ABANDONED", "CANCELLED"].includes(status)) return "cancelled";
  if (["DECLINED", "FAILED", "RESTRICTED"].includes(status)) return "failed";
  if (["VOID", "VOIDED"].includes(status)) return "voided";
  if (status === "PARTIALLY_REFUNDED") return "partially_refunded";
  if (status === "REFUNDED") return "refunded";
  if (["REVERSED", "REVERSAL"].includes(status)) return "reversed";
  if (["CHARGEBACK", "CHARGEBACKED"].includes(status)) return "chargeback";
  return status.toLowerCase() || "pending";
}

function amountDecimals(currency: string) {
  return ["BHD", "JOD", "KWD", "OMR"].includes(currency.toUpperCase()) ? 3 : 2;
}

function hashValue(value: TapCharge, secret: string) {
  const id = cleanText(value.id, 160);
  const currency = cleanText(value.currency, 10).toUpperCase();
  const amount = typeof value.amount === "number" && Number.isFinite(value.amount) ? value.amount.toFixed(amountDecimals(currency)) : "";
  const gatewayReference = cleanText(value.reference?.gateway, 160);
  const paymentReference = cleanText(value.reference?.payment, 160);
  const status = cleanText(value.status, 60);
  const created = cleanText(value.transaction?.created || value.created, 100);
  const source = `x_id${id}x_amount${amount}x_currency${currency}x_gateway_reference${gatewayReference}x_payment_reference${paymentReference}x_status${status}x_created${created}`;
  return createHmac("sha256", secret).update(source, "utf8").digest("hex");
}

function secureEquals(expected: string, actual: string) {
  const left = Buffer.from(expected.trim().toLowerCase(), "utf8");
  const right = Buffer.from(actual.trim().toLowerCase(), "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const tapSecretKey = process.env.TAP_SECRET_KEY?.trim();
  const webhookSecret = process.env.TAP_WEBHOOK_SECRET?.trim() || tapSecretKey;
  if (!tapSecretKey || !webhookSecret) return jsonError("Tap webhook غير مفعّل", 503);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 256 * 1024) return jsonError("حمولة Tap كبيرة جدًا", 413);

  let posted: TapCharge;
  try {
    const raw = await request.text();
    if (raw.length > 256 * 1024) return jsonError("حمولة Tap كبيرة جدًا", 413);
    posted = JSON.parse(raw) as TapCharge;
  } catch {
    return jsonError("حمولة Tap غير صالحة");
  }

  const hashString = request.headers.get("hashstring") || request.headers.get("x-hashstring") || "";
  if (!hashString || !secureEquals(hashValue(posted, webhookSecret), hashString)) return jsonError("توقيع Tap غير صالح", 401);

  const chargeId = cleanText(posted.id, 160);
  if (!chargeId) return jsonError("معرّف العملية مفقود");

  let verifiedResponse: Response;
  try {
    verifiedResponse = await fetch(`https://api.tap.company/v2/charges/${encodeURIComponent(chargeId)}`, {
      headers: { authorization: `Bearer ${tapSecretKey}`, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return jsonError("تعذر الاتصال بخدمة Tap للتحقق من العملية", 502);
  }
  if (!verifiedResponse.ok) return jsonError("تعذر التحقق من العملية لدى Tap", 502);
  let verified: TapCharge;
  try { verified = await verifiedResponse.json() as TapCharge; } catch { return jsonError("استجابة Tap غير صالحة", 502); }
  if (verified.id !== chargeId) return jsonError("تعذر مطابقة العملية", 409);

  const orderNumber = cleanText(verified.metadata?.order_number || verified.reference?.order || verified.reference?.transaction, 160);
  const status = cleanText(verified.status, 60).toUpperCase();
  const db = getDb();

  await db.insert(paymentEvents).values({
    provider: "tap",
    providerEventId: `${chargeId}:${status}`,
    orderNumber: orderNumber || null,
    chargeId,
    status,
    payload: JSON.stringify(verified).slice(0, 60_000),
  }).onConflictDoNothing({ target: paymentEvents.providerEventId });

  const [[chargeOrder], [referenceOrder]] = await Promise.all([
    db.select().from(orders).where(eq(orders.tapChargeId, chargeId)).limit(1),
    orderNumber ? db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1) : Promise.resolve([]),
  ]);
  if (chargeOrder && referenceOrder && chargeOrder.id !== referenceOrder.id) return jsonError("مراجع Tap تشير إلى طلبين مختلفين", 409);
  const order = chargeOrder || referenceOrder;
  if (order && orderNumber && order.orderNumber !== orderNumber) return jsonError("رقم الطلب لا يطابق معرّف العملية", 409);
  if (order?.tapChargeId && order.tapChargeId !== chargeId) return jsonError("معرّف Tap مرتبط بعملية أخرى", 409);

  if (!order) return Response.json({ ok: true, received: true, matched: false });
  const itemRows = await db.select({ courseSlug: orderItems.courseSlug }).from(orderItems).where(eq(orderItems.orderNumber, order.orderNumber));
  const expectedCourseSlugs = itemRows.length ? itemRows.map((item) => item.courseSlug) : [order.courseSlug];
  if (["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED", "REVERSED", "REVERSAL", "CHARGEBACK", "CHARGEBACKED"].includes(status)) {
    const amountMatches = typeof verified.amount === "number" && Math.abs(verified.amount - order.total) < 0.01;
    const currencyMatches = cleanText(verified.currency, 10).toUpperCase() === order.currency.toUpperCase();
    const postedCourseSlugs = verified.metadata?.course_slugs?.split(",").map((slug) => cleanText(slug, 120)).filter(Boolean) || (verified.metadata?.course_slug ? [verified.metadata.course_slug] : []);
    const courseMatches = !postedCourseSlugs.length || (postedCourseSlugs.length === expectedCourseSlugs.length && postedCourseSlugs.every((slug) => expectedCourseSlugs.includes(slug)));
    const emailMatches = !verified.customer?.email || verified.customer.email.toLowerCase() === order.customerEmail.toLowerCase();
    if (!amountMatches || !currencyMatches || !courseMatches || !emailMatches) return jsonError("فشلت مطابقة تفاصيل عملية الدفع", 409);
  }
  const nextStatus = orderState(status);
  const now = new Date().toISOString();
  let newlyPaid = false;
  let paymentReversed = false;
  let partialRefundRecorded = false;
  await db.transaction(async (tx) => {
    // Serialize duplicate/out-of-order Tap events for this order. The access,
    // invoice, cart cleanup, and coupon state then commit as one unit.
    await tx.execute(sql`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`);
    const [current] = await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    if (!current) return;

    if (nextStatus === "paid") {
      if (["partially_refunded", "refunded", "reversed", "chargeback"].includes(current.status)) return;
      newlyPaid = current.status !== "paid";
      const hadReservation = current.couponReserved;
      await tx.update(orders).set({ status: "paid", tapChargeId: chargeId, couponReserved: false, couponReservationExpiresAt: null, updatedAt: now, paidAt: current.paidAt || now }).where(eq(orders.id, current.id));
      // Compatibility for orders initiated before coupon reservations existed.
      if (newlyPaid && current.couponCode && !hadReservation) await tx.update(couponsDb).set({ usedCount: sql`${couponsDb.usedCount} + 1` }).where(eq(couponsDb.code, current.couponCode));
      await tx.insert(courseAccess).values(expectedCourseSlugs.map((courseSlug) => ({ userEmail: current.customerEmail, courseSlug, source: "tap", orderNumber: current.orderNumber, startsAt: now }))).onConflictDoUpdate({ target: [courseAccess.userEmail, courseAccess.courseSlug], set: { source: "tap", orderNumber: current.orderNumber, revokedAt: null, expiresAt: null, startsAt: now } });
      await tx.insert(invoices).values({ invoiceNumber: `INV-${current.orderNumber}`, orderNumber: current.orderNumber, customerEmail: current.customerEmail, total: current.total, taxAmount: Math.round((current.total * 15 / 115) * 100) / 100, currency: current.currency, issuedAt: now }).onConflictDoNothing({ target: invoices.orderNumber });
      await tx.delete(cartItems).where(and(eq(cartItems.userEmail, current.customerEmail), inArray(cartItems.courseSlug, expectedCourseSlugs)));
      if (newlyPaid) await tx.insert(notificationsDb).values({ userEmail: current.customerEmail, audience: "student", title: "تم تأكيد الدفع وتفعيل موادك", body: `تم تفعيل ${expectedCourseSlugs.length === 1 ? "المادة" : `${expectedCourseSlugs.length} مواد`} في حسابك بنجاح.`, actionUrl: "/dashboard?view=learning", actionLabel: "فتح موادي", createdAt: now });
      return;
    }

    if (nextStatus === "partially_refunded") {
      // Tap does not identify which course/item a partial refund belongs to in
      // the charge status. Preserve all access until a full refund and record a
      // distinct state; revoking every course here would over-refund access.
      if (["refunded", "reversed", "chargeback"].includes(current.status)) return;
      partialRefundRecorded = current.status !== "partially_refunded";
      const wasPaid = ["paid", "partially_refunded"].includes(current.status);
      const hadReservation = current.couponReserved;
      await tx.update(orders).set({ status: "partially_refunded", tapChargeId: chargeId, couponReserved: false, couponReservationExpiresAt: null, updatedAt: now, paidAt: current.paidAt || now }).where(eq(orders.id, current.id));
      // A partial-refund webhook can be the first event received for a captured
      // charge. In that case provider truth still proves payment, so restore the
      // same access/invoice atomically instead of leaving a paying student at 403.
      if (!wasPaid) {
        if (current.couponCode && !hadReservation) await tx.update(couponsDb).set({ usedCount: sql`${couponsDb.usedCount} + 1` }).where(eq(couponsDb.code, current.couponCode));
        await tx.insert(courseAccess).values(expectedCourseSlugs.map((courseSlug) => ({ userEmail: current.customerEmail, courseSlug, source: "tap", orderNumber: current.orderNumber, startsAt: now }))).onConflictDoUpdate({ target: [courseAccess.userEmail, courseAccess.courseSlug], set: { source: "tap", orderNumber: current.orderNumber, revokedAt: null, expiresAt: null, startsAt: now } });
        await tx.insert(invoices).values({ invoiceNumber: `INV-${current.orderNumber}`, orderNumber: current.orderNumber, customerEmail: current.customerEmail, total: current.total, taxAmount: Math.round((current.total * 15 / 115) * 100) / 100, currency: current.currency, issuedAt: now }).onConflictDoNothing({ target: invoices.orderNumber });
        await tx.delete(cartItems).where(and(eq(cartItems.userEmail, current.customerEmail), inArray(cartItems.courseSlug, expectedCourseSlugs)));
      }
      if (partialRefundRecorded) await tx.insert(notificationsDb).values({ userEmail: current.customerEmail, audience: "student", title: "تم تسجيل استرداد جزئي", body: "تم تسجيل استرداد جزئي للعملية، ويظل وصولك للمواد فعالًا حتى اكتمال مراجعة الاسترداد.", actionUrl: "/support", actionLabel: "التواصل مع الدعم", createdAt: now });
      return;
    }

    if (["refunded", "reversed", "chargeback"].includes(nextStatus)) {
      paymentReversed = ["paid", "partially_refunded"].includes(current.status);
      const releaseReservation = current.couponReserved;
      if (paymentReversed) {
        await tx.update(courseAccess).set({ revokedAt: now }).where(and(eq(courseAccess.orderNumber, current.orderNumber), eq(courseAccess.source, "tap")));
        await tx.insert(notificationsDb).values({ userEmail: current.customerEmail, audience: "student", title: "تحديث على عملية الدفع", body: "تم عكس أو استرداد عملية الدفع وسُحب الوصول المرتبط بها. تواصل مع الدعم إذا لم تكن تتوقع ذلك.", actionUrl: "/support", actionLabel: "التواصل مع الدعم", createdAt: now });
      }
      // Reservations and completed uses share the same quota counter. Release
      // either exactly once based on the locked pre-transition state.
      if ((paymentReversed || releaseReservation) && current.couponCode) await tx.update(couponsDb).set({ usedCount: sql`GREATEST(0, ${couponsDb.usedCount} - 1)` }).where(eq(couponsDb.code, current.couponCode));
      await tx.update(orders).set({ status: nextStatus, tapChargeId: chargeId, couponReserved: false, couponReservationExpiresAt: null, updatedAt: now }).where(eq(orders.id, current.id));
      return;
    }

    if (current.status === "paid") return;
    const terminal = ["cancelled", "failed", "voided"].includes(nextStatus);
    if (terminal && current.couponReserved && current.couponCode) {
      await tx.update(couponsDb).set({ usedCount: sql`GREATEST(0, ${couponsDb.usedCount} - 1)` }).where(eq(couponsDb.code, current.couponCode));
    }
    await tx.update(orders).set({ status: nextStatus, tapChargeId: chargeId, couponReserved: terminal ? false : current.couponReserved, couponReservationExpiresAt: terminal ? null : current.couponReservationExpiresAt, updatedAt: now }).where(and(eq(orders.id, current.id), ne(orders.status, "paid")));
  });

  if (newlyPaid) await sendPushNotification({ userEmail: order.customerEmail }, "تم تأكيد الدفع وتفعيل موادك", `أصبحت ${expectedCourseSlugs.length === 1 ? "مادتك" : "موادك"} متاحة الآن داخل مراس.`, { route: "/learning", orderNumber: order.orderNumber });
  if (partialRefundRecorded) await sendPushNotification({ userEmail: order.customerEmail }, "تم تسجيل استرداد جزئي", "يظل وصولك للمواد فعالًا حتى اكتمال مراجعة الاسترداد.", { route: "/support", orderNumber: order.orderNumber });
  if (paymentReversed) await sendPushNotification({ userEmail: order.customerEmail }, "تحديث على عملية الدفع", "تم عكس أو استرداد عملية الدفع وسُحب الوصول المرتبط بها.", { route: "/support", orderNumber: order.orderNumber });

  return Response.json({ ok: true, received: true, matched: true, status: nextStatus });
}
