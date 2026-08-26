import { and, eq, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { couponsDb, courseAccess, invoices, orders, paymentEvents } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";

type TapCharge = {
  id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  metadata?: { order_number?: string; course_slug?: string };
  reference?: { order?: string; transaction?: string };
  customer?: { email?: string };
};

function orderState(status: string) {
  if (status === "CAPTURED") return "paid";
  if (["ABANDONED", "CANCELLED"].includes(status)) return "cancelled";
  if (["DECLINED", "FAILED", "RESTRICTED"].includes(status)) return "failed";
  if (["VOID", "VOIDED"].includes(status)) return "voided";
  return status.toLowerCase() || "pending";
}

export async function POST(request: Request) {
  const tapSecretKey = process.env.TAP_SECRET_KEY?.trim();
  if (!tapSecretKey) return jsonError("Tap webhook غير مفعّل", 503);

  let posted: TapCharge;
  try {
    posted = await request.json() as TapCharge;
  } catch {
    return jsonError("حمولة Tap غير صالحة");
  }

  const chargeId = cleanText(posted.id, 160);
  if (!chargeId) return jsonError("معرّف العملية مفقود");

  const verifiedResponse = await fetch(`https://api.tap.company/v2/charges/${encodeURIComponent(chargeId)}`, {
    headers: { authorization: `Bearer ${tapSecretKey}`, accept: "application/json" },
  });
  if (!verifiedResponse.ok) return jsonError("تعذر التحقق من العملية لدى Tap", 502);
  const verified = await verifiedResponse.json() as TapCharge;
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

  const [order] = await db.select().from(orders).where(
    orderNumber
      ? or(eq(orders.tapChargeId, chargeId), eq(orders.orderNumber, orderNumber))
      : eq(orders.tapChargeId, chargeId),
  ).limit(1);

  if (!order) return Response.json({ ok: true, received: true, matched: false });
  if (status === "CAPTURED") {
    const amountMatches = typeof verified.amount === "number" && Math.abs(verified.amount - order.total) < 0.01;
    const currencyMatches = cleanText(verified.currency, 10).toUpperCase() === order.currency.toUpperCase();
    const courseMatches = !verified.metadata?.course_slug || verified.metadata.course_slug === order.courseSlug;
    const emailMatches = !verified.customer?.email || verified.customer.email.toLowerCase() === order.customerEmail.toLowerCase();
    if (!amountMatches || !currencyMatches || !courseMatches || !emailMatches) return jsonError("فشلت مطابقة تفاصيل عملية الدفع", 409);
  }
  const nextStatus = orderState(status);
  const now = new Date().toISOString();
  let newlyPaid = false;
  if (nextStatus === "paid") {
    const changed = await db.update(orders).set({ status: nextStatus, tapChargeId: chargeId, updatedAt: now, paidAt: now }).where(and(eq(orders.id, order.id), ne(orders.status, "paid"))).returning({ id: orders.id });
    newlyPaid = changed.length > 0;
  } else if (order.status !== "paid") {
    await db.update(orders).set({ status: nextStatus, tapChargeId: chargeId, updatedAt: now }).where(eq(orders.id, order.id));
  }

  if (newlyPaid) {
    await db.insert(courseAccess).values({
      userEmail: order.customerEmail,
      courseSlug: order.courseSlug,
      source: "tap",
      orderNumber: order.orderNumber,
      startsAt: now,
    }).onConflictDoUpdate({
      target: [courseAccess.userEmail, courseAccess.courseSlug],
      set: { source: "tap", orderNumber: order.orderNumber, revokedAt: null, expiresAt: null, startsAt: now },
    });
    await db.insert(invoices).values({
      invoiceNumber: `INV-${order.orderNumber}`,
      orderNumber: order.orderNumber,
      customerEmail: order.customerEmail,
      total: order.total,
      taxAmount: Math.round((order.total * 15 / 115) * 100) / 100,
      currency: order.currency,
      issuedAt: now,
    }).onConflictDoNothing({ target: invoices.orderNumber });
    if (order.couponCode) {
      await db.update(couponsDb).set({ usedCount: sql`${couponsDb.usedCount} + 1` }).where(eq(couponsDb.code, order.couponCode));
    }
  }

  return Response.json({ ok: true, received: true, matched: true, status: nextStatus });
}
