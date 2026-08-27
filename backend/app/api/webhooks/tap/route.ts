import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { couponsDb, courseAccess, invoices, orderItems, orders, paymentEvents } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";

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

  const verifiedResponse = await fetch(`https://api.tap.company/v2/charges/${encodeURIComponent(chargeId)}`, {
    headers: { authorization: `Bearer ${tapSecretKey}`, accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
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
  const itemRows = await db.select({ courseSlug: orderItems.courseSlug }).from(orderItems).where(eq(orderItems.orderNumber, order.orderNumber));
  const expectedCourseSlugs = itemRows.length ? itemRows.map((item) => item.courseSlug) : [order.courseSlug];
  if (status === "CAPTURED") {
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
  if (nextStatus === "paid") {
    const changed = await db.update(orders).set({ status: nextStatus, tapChargeId: chargeId, updatedAt: now, paidAt: now }).where(and(eq(orders.id, order.id), ne(orders.status, "paid"))).returning({ id: orders.id });
    newlyPaid = changed.length > 0;
  } else if (order.status !== "paid") {
    await db.update(orders).set({ status: nextStatus, tapChargeId: chargeId, updatedAt: now }).where(eq(orders.id, order.id));
  }

  if (newlyPaid) {
    await db.insert(courseAccess).values(expectedCourseSlugs.map((courseSlug) => ({ userEmail: order.customerEmail, courseSlug, source: "tap", orderNumber: order.orderNumber, startsAt: now }))).onConflictDoUpdate({ target: [courseAccess.userEmail, courseAccess.courseSlug], set: { source: "tap", orderNumber: order.orderNumber, revokedAt: null, expiresAt: null, startsAt: now } });
    await db.insert(invoices).values({ invoiceNumber: `INV-${order.orderNumber}`, orderNumber: order.orderNumber, customerEmail: order.customerEmail, total: order.total, taxAmount: Math.round((order.total * 15 / 115) * 100) / 100, currency: order.currency, issuedAt: now }).onConflictDoNothing({ target: invoices.orderNumber });
    if (order.couponCode) await db.update(couponsDb).set({ usedCount: sql`${couponsDb.usedCount} + 1` }).where(eq(couponsDb.code, order.couponCode));
  }

  return Response.json({ ok: true, received: true, matched: true, status: nextStatus });
}
