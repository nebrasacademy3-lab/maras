import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiEntitlements, aiSubscriptionOrders, couponUses, courseAccess, courseAccessEvents, notificationsDb, orderItems, orders, paymentEvents, refundRequests } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { sendPushNotification } from "@/lib/push";
import { createAndSendNotification } from "@/lib/notifications";
import { fulfillPaidOrderTx } from "@/lib/order-fulfillment";
import { qualifyReferralForPaidOrderTx, reconcileReferralQualificationAfterRefundTx } from "@/lib/referrals";
import { redeemCouponReservationTx } from "@/lib/coupons";
import {
  applyConfirmedRefundToOrder,
  issueCreditNote,
  majorAmountToMinor,
  reconcileRefundRequest,
  tapRefundRequestStatus,
} from "@/lib/refunds";

type TapReference = { order?: string; transaction?: string; gateway?: string; payment?: string; merchant?: string; idempotent?: string };
type TapCharge = {
  id?: string;
  object?: string;
  charge_id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  updated?: string;
  created?: string;
  date?: string;
  transaction?: { created?: string };
  metadata?: { order_number?: string; course_slug?: string; course_slugs?: string; refund_request?: string; product?: string; ai_order_number?: string; user_id?: string };
  reference?: TapReference;
  customer?: { email?: string };
};

type TapRefund = TapCharge & {
  object?: "refund";
  charge_id?: string;
  reason?: string;
};

function orderState(status: string) {
  if (status === "CAPTURED") return "paid";
  if (["ABANDONED", "CANCELLED"].includes(status)) return "cancelled";
  if (["DECLINED", "FAILED", "RESTRICTED"].includes(status)) return "failed";
  if (["VOID", "VOIDED"].includes(status)) return "voided";
  if (["REFUND", "REFUNDED", "FULLY_REFUNDED"].includes(status)) return "refunded";
  if (["PARTIALLY_REFUNDED", "PARTIAL_REFUND"].includes(status)) return "partially_refunded";
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

function isRefundPayload(value: TapCharge): value is TapRefund {
  return cleanText(value.object, 30).toLowerCase() === "refund" || cleanText(value.id, 160).startsWith("re_");
}

async function handleRefundWebhook(posted: TapRefund, tapSecretKey: string) {
  const refundId = cleanText(posted.id, 160);
  if (!refundId || !refundId.startsWith("re_")) return jsonError("معرّف الاسترداد غير صالح");

  let verifiedResponse: Response;
  try {
    verifiedResponse = await fetch(`https://api.tap.company/v2/refunds/${encodeURIComponent(refundId)}`, {
      headers: { authorization: `Bearer ${tapSecretKey}`, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return jsonError("تعذر الاتصال بخدمة Tap للتحقق من الاسترداد", 502);
  }
  if (!verifiedResponse.ok) return jsonError("تعذر التحقق من الاسترداد لدى Tap", 502);
  let verified: TapRefund;
  try { verified = await verifiedResponse.json() as TapRefund; } catch { return jsonError("استجابة Tap للاسترداد غير صالحة", 502); }
  if (cleanText(verified.id, 160) !== refundId || cleanText(verified.object, 30).toLowerCase() !== "refund") return jsonError("تعذر مطابقة عملية الاسترداد", 409);

  const chargeId = cleanText(verified.charge_id, 160);
  const postedChargeId = cleanText(posted.charge_id, 160);
  if (!chargeId || !chargeId.startsWith("chg_") || (postedChargeId && postedChargeId !== chargeId)) return jsonError("عملية Tap الأصلية لا تطابق الاسترداد", 409);
  const status = cleanText(verified.status, 60).toUpperCase();
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.tapChargeId, chargeId)).limit(1);
  const [aiOrder] = await db.select().from(aiSubscriptionOrders).where(eq(aiSubscriptionOrders.tapChargeId, chargeId)).limit(1);
  if (order && aiOrder) return jsonError("عملية Tap مرتبطة بأكثر من طلب محلي", 409);
  if (aiOrder) {
    const amountMinor = majorAmountToMinor(verified.amount);
    const currency = cleanText(verified.currency, 10).toUpperCase();
    const metadataOrderNumber = cleanText(verified.metadata?.ai_order_number || verified.metadata?.order_number, 160);
    const matchFailed = !amountMinor
      || amountMinor > aiOrder.amountMinor
      || currency !== aiOrder.currency.toUpperCase()
      || (metadataOrderNumber && metadataOrderNumber !== aiOrder.orderNumber);
    const eventVersion = cleanText(verified.updated || verified.date || verified.created || verified.transaction?.created, 100) || "unknown";
    const eventStatus = matchFailed ? "AI_REFUND_REJECTED_MATCH" : `AI_REFUND_${status || "UNKNOWN"}`;
    await db.insert(paymentEvents).values({
      provider: "tap",
      providerEventId: `tap:ai-refund:${refundId}:${eventStatus}:${eventVersion}`,
      orderNumber: aiOrder.orderNumber,
      chargeId,
      objectType: "refund",
      eventType: "ai_subscription_refund",
      amountMinor,
      currency: currency || null,
      signatureVerified: true,
      processedAt: new Date().toISOString(),
      status: eventStatus,
      payload: JSON.stringify(verified).slice(0, 60_000),
    }).onConflictDoNothing({ target: paymentEvents.providerEventId });
    if (matchFailed) return jsonError("فشلت مطابقة مبلغ أو عملة استرداد اشتراك مراس AI", 409);
    if (status !== "REFUNDED") {
      return Response.json({ ok: true, received: true, matched: true, kind: "ai_subscription_refund", refundStatus: status, status: aiOrder.status });
    }

    const now = new Date().toISOString();
    const refundedStatus = amountMinor >= aiOrder.amountMinor ? "refunded" : "partially_refunded";
    let newlyRefunded = false;
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`ai-order:${aiOrder.orderNumber}`}))`);
      const [current] = await tx.select().from(aiSubscriptionOrders).where(eq(aiSubscriptionOrders.id, aiOrder.id)).limit(1).for("update");
      if (!current) return;
      newlyRefunded = !["refunded", "partially_refunded"].includes(current.status);
      await tx.update(aiSubscriptionOrders).set({ status: refundedStatus, updatedAt: now }).where(eq(aiSubscriptionOrders.id, current.id));
      await tx.update(aiEntitlements).set({ status: "revoked", updatedAt: now }).where(and(
        eq(aiEntitlements.userId, current.userId),
        eq(aiEntitlements.source, "paid"),
        eq(aiEntitlements.externalRef, current.orderNumber),
      ));
    });
    if (newlyRefunded) {
      await createAndSendNotification({
        values: {
          userEmail: aiOrder.customerEmail,
          audience: "student",
          title: refundedStatus === "refunded" ? "اكتمل استرداد اشتراك مراس AI" : "تم تسجيل استرداد جزئي لاشتراك مراس AI",
          body: "تم إيقاف مدة الاشتراك المرتبطة بهذه الدفعة. يمكنك مراجعة حالة الطلب من صفحة مراس AI.",
          actionUrl: "/meras-ai/subscribe",
          actionLabel: "عرض الاشتراك",
          template: "ai_entitlement",
          dedupeKey: `ai-order:${aiOrder.orderNumber}:refund:${refundId}`,
        },
        target: { userEmail: aiOrder.customerEmail },
        data: { route: "/meras-ai/subscribe" },
      });
    }
    return Response.json({ ok: true, received: true, matched: true, kind: "ai_subscription_refund", refundStatus: status, status: refundedStatus });
  }
  const managedReference = cleanText(verified.metadata?.refund_request || verified.reference?.merchant || verified.reference?.idempotent, 160);
  const metadataOrderNumber = cleanText(verified.metadata?.order_number, 160);
  const [managedByProvider] = await db.select().from(refundRequests).where(eq(refundRequests.providerRefundId, refundId)).limit(1);
  const [managedByReference] = managedReference ? await db.select().from(refundRequests).where(eq(refundRequests.requestNumber, managedReference)).limit(1) : [];
  if (managedByProvider && managedByReference && managedByProvider.id !== managedByReference.id) return jsonError("تعارض مرجع الاسترداد لدى Tap مع معرّف المزود", 409);
  const managedRequest = managedByProvider || managedByReference;
  const amountMinor = majorAmountToMinor(verified.amount);
  const orderTotalMinor = order ? order.totalMinor ?? majorAmountToMinor(order.total) ?? 0 : 0;
  const currency = cleanText(verified.currency, 10).toUpperCase();
  const matchFailed = Boolean(
    (managedRequest && !order)
    || (order && (
      !amountMinor
      || amountMinor > orderTotalMinor
      || order.currency.toUpperCase() !== "SAR"
      || currency !== order.currency.toUpperCase()
      || (metadataOrderNumber && metadataOrderNumber !== order.orderNumber)
      || (managedRequest && (
        managedRequest.orderNumber !== order.orderNumber
        || managedRequest.amountMinor !== amountMinor
        || managedRequest.currency.toUpperCase() !== currency
        || Boolean(managedRequest.providerRefundId && managedRequest.providerRefundId !== refundId)
      ))
    ))
  );
  const eventVersion = cleanText(verified.updated || verified.date || verified.created || verified.transaction?.created, 100) || "unknown";
  const eventStatus = matchFailed ? "REFUND_REJECTED_MATCH" : `REFUND_${status || "UNKNOWN"}`;
  await db.insert(paymentEvents).values({
    provider: "tap",
    providerEventId: `tap:refund:${refundId}:${eventStatus}:${eventVersion}`,
    orderNumber: order?.orderNumber || managedRequest?.orderNumber || null,
    chargeId,
    objectType: cleanText(verified.object, 40) || "refund",
    eventType: "refund_status",
    amountMinor,
    currency: currency || null,
    signatureVerified: true,
    processedAt: new Date().toISOString(),
    status: eventStatus,
    payload: JSON.stringify(verified).slice(0, 60_000),
  }).onConflictDoNothing({ target: paymentEvents.providerEventId });

  if (!order) {
    if (managedRequest) return jsonError("طلب الاسترداد المحلي لا يرتبط بعملية Tap الأصلية", 409);
    return Response.json({ ok: true, received: true, matched: false, kind: "refund" });
  }
  if (matchFailed) return jsonError("فشلت مطابقة مبلغ أو عملة الاسترداد", 409);

  const providerRequestStatus = tapRefundRequestStatus(status);
  if (managedRequest) {
    const reconciled = await reconcileRefundRequest({ id: managedRequest.id, providerRefundId: refundId, status: providerRequestStatus, reviewNote: providerRequestStatus === "provider_failed" ? cleanText(verified.reason, 500) || `Tap ${status}` : null, completedAt: status === "REFUNDED" ? new Date().toISOString() : null });
    if (!reconciled.ok) return jsonError("تعارض معرّف الاسترداد لدى Tap مع السجل المحلي", 409);
  }

  // Pending or accepted refund requests stay in the audit trail only. Course
  // access changes exclusively after Tap independently confirms REFUNDED.
  if (status !== "REFUNDED") return Response.json({ ok: true, received: true, matched: true, kind: "refund", refundStatus: status, status: order.status });

  const applied = await applyConfirmedRefundToOrder({ orderNumber: order.orderNumber, chargeId });
  if (!applied.ok) return jsonError(applied.error === "invalid_refund_total" ? "إجمالي أحداث الاسترداد غير صالح" : `لا يمكن تسجيل الاسترداد للطلب في حالته الحالية (${applied.status || applied.error})`, 409);

  const now = new Date().toISOString();
  let notify: { id: number; title: string; body: string; route: string } | null = null;
  if (applied.fullyRefunded && applied.newlyFullyRefunded) {
    await db.transaction((tx) => reconcileReferralQualificationAfterRefundTx(tx, applied.customerEmail, now));
    const title = "اكتمل استرداد طلبك";
    const body = `اكتمل استرداد الطلب ${order.orderNumber} وتم إيقاف الوصول المرتبط به.`;
    const [notice] = await db.insert(notificationsDb).values({ userEmail: applied.customerEmail, audience: "student", title, body, actionUrl: "/dashboard?view=orders", actionLabel: "عرض الطلب", template: "general", dedupeKey: `order:${order.orderNumber}:refunded`, pushStatus: "processing", pushClaimedAt: now, createdAt: now }).onConflictDoNothing({ target: notificationsDb.dedupeKey }).returning({ id: notificationsDb.id });
    if (notice) notify = { id: notice.id, title, body, route: "/dashboard?view=orders" };
  } else if (!applied.fullyRefunded) {
    const title = "تم تسجيل استرداد جزئي";
    const body = `تم استرداد ${(applied.refundedAmountMinor / 100).toFixed(2)} ${applied.currency} من الطلب ${order.orderNumber}.`;
    const [notice] = await db.insert(notificationsDb).values({ userEmail: applied.customerEmail, audience: "student", title, body, actionUrl: "/dashboard?view=orders", actionLabel: "عرض الطلب", template: "general", dedupeKey: `order:${order.orderNumber}:partial-refund:${refundId}`, pushStatus: "processing", pushClaimedAt: now, createdAt: now }).onConflictDoNothing({ target: notificationsDb.dedupeKey }).returning({ id: notificationsDb.id });
    if (notice) notify = { id: notice.id, title, body, route: "/dashboard?view=orders" };
  }

  await issueCreditNote({ orderNumber: order.orderNumber, reference: managedRequest?.requestNumber || refundId, amountMinor: amountMinor!, reason: managedRequest?.reason || cleanText(verified.reason, 500) || "Tap refund" });

  const queuedNotice = notify as { id: number; title: string; body: string; route: string } | null;
  if (queuedNotice) {
    const delivery = await sendPushNotification({ userEmail: order.customerEmail }, queuedNotice.title, queuedNotice.body, { route: queuedNotice.route, notificationId: queuedNotice.id });
    const pushStatus = delivery.accepted > 0 ? "accepted" : delivery.attempted === 0 ? "no_devices" : "failed";
    await db.update(notificationsDb).set({ pushStatus, pushAttempts: sql`${notificationsDb.pushAttempts} + 1`, pushLastError: delivery.providerErrors.join(" | ").slice(0, 1000) || null, pushDeliveredAt: delivery.accepted > 0 ? new Date().toISOString() : null }).where(eq(notificationsDb.id, queuedNotice.id));
  }
  return Response.json({ ok: true, received: true, matched: true, kind: "refund", refundStatus: status, status: applied.status });
}

function plusCalendarMonth(value: string) {
  const date = new Date(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

async function handleAiSubscriptionCharge(verified: TapCharge, chargeId: string, status: string, orderNumber: string) {
  const db = getDb();
  const [byCharge] = await db.select().from(aiSubscriptionOrders).where(eq(aiSubscriptionOrders.tapChargeId, chargeId)).limit(1);
  const [byNumber] = orderNumber ? await db.select().from(aiSubscriptionOrders).where(eq(aiSubscriptionOrders.orderNumber, orderNumber)).limit(1) : [];
  if (byCharge && byNumber && byCharge.id !== byNumber.id) return jsonError("تعارض معرّف اشتراك AI مع عملية Tap", 409);
  const order = byCharge || byNumber;
  if (!order) return Response.json({ ok: true, received: true, matched: false, kind: "ai_subscription" });
  if (order.tapChargeId && order.tapChargeId !== chargeId) return jsonError("طلب AI مرتبط بعملية Tap مختلفة", 409);
  if (orderNumber && order.orderNumber !== orderNumber) return jsonError("رقم طلب AI لا يطابق العملية", 409);
  const nextStatus = orderState(status);
  const requiresFinancialMatch = ["paid", "refunded", "partially_refunded"].includes(nextStatus);
  if (requiresFinancialMatch) {
    const amountMatches = typeof verified.amount === "number" && Math.abs(Math.round(verified.amount * 100) - order.amountMinor) === 0;
    const currencyMatches = cleanText(verified.currency, 10).toUpperCase() === "SAR" && order.currency.toUpperCase() === "SAR";
    const emailMatches = !verified.customer?.email || verified.customer.email.toLowerCase() === order.customerEmail.toLowerCase();
    const productMatches = cleanText(verified.metadata?.product, 40) === "meras-ai";
    if (!amountMatches || !currencyMatches || !emailMatches || !productMatches) return jsonError("فشلت مطابقة تفاصيل اشتراك مراس AI", 409);
  }
  const now = new Date().toISOString();
  let newlyPaid = false;
  let effectiveStatus = nextStatus;
  let entitlementExpiresAt = order.entitlementExpiresAt;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`ai-order:${order.orderNumber}`}))`);
    const [current] = await tx.select().from(aiSubscriptionOrders).where(eq(aiSubscriptionOrders.id, order.id)).limit(1);
    if (!current) return;
    if (nextStatus === "paid") {
      if (["refunded", "partially_refunded"].includes(current.status)) {
        effectiveStatus = current.status;
        entitlementExpiresAt = current.entitlementExpiresAt;
        return;
      }
      if (current.status !== "paid") {
        const activePaid = await tx.select({ expiresAt: aiEntitlements.expiresAt }).from(aiEntitlements).where(and(eq(aiEntitlements.userId, current.userId), eq(aiEntitlements.source, "paid"), eq(aiEntitlements.status, "active"), ne(aiEntitlements.externalRef, current.orderNumber)));
        const latestExpiry = activePaid.map((item) => item.expiresAt ? Date.parse(item.expiresAt) : 0).filter(Number.isFinite).reduce((latest, value) => Math.max(latest, value), 0);
        const base = latestExpiry > Date.now() ? new Date(latestExpiry).toISOString() : now;
        entitlementExpiresAt = plusCalendarMonth(base);
        await tx.insert(aiEntitlements).values({ userId: current.userId, source: "paid", externalRef: current.orderNumber, status: "active", startsAt: base, expiresAt: entitlementExpiresAt, createdBy: "tap-webhook", createdAt: now, updatedAt: now }).onConflictDoNothing({ target: [aiEntitlements.userId, aiEntitlements.source, aiEntitlements.externalRef] });
        await tx.update(aiSubscriptionOrders).set({ status: "paid", tapChargeId: chargeId, paidAt: current.paidAt || now, entitlementExpiresAt, updatedAt: now }).where(eq(aiSubscriptionOrders.id, current.id));
        newlyPaid = true;
      } else entitlementExpiresAt = current.entitlementExpiresAt;
      return;
    }
    if (nextStatus === "refunded" || nextStatus === "partially_refunded") {
      effectiveStatus = nextStatus;
      await tx.update(aiSubscriptionOrders).set({ status: nextStatus, tapChargeId: chargeId, updatedAt: now }).where(eq(aiSubscriptionOrders.id, current.id));
      await tx.update(aiEntitlements).set({ status: "revoked", updatedAt: now }).where(and(eq(aiEntitlements.userId, current.userId), eq(aiEntitlements.source, "paid"), eq(aiEntitlements.externalRef, current.orderNumber)));
      return;
    }
    if (current.status !== "paid" && current.status !== "refunded") await tx.update(aiSubscriptionOrders).set({ status: nextStatus, tapChargeId: chargeId, updatedAt: now }).where(eq(aiSubscriptionOrders.id, current.id));
  });
  if (newlyPaid) await createAndSendNotification({ values: { userEmail: order.customerEmail, audience: "student", title: "تم تفعيل اشتراك مراس AI", body: "أصبح اشتراك مراس AI بلس متاحًا في حسابك لمدة شهر.", actionUrl: "/meras-ai", actionLabel: "ابدأ الآن", template: "ai_entitlement", dedupeKey: `ai-order:${order.orderNumber}:paid` }, target: { userEmail: order.customerEmail }, data: { route: "/meras-ai" } });
  return Response.json({ ok: true, received: true, matched: true, kind: "ai_subscription", status: effectiveStatus, entitlementExpiresAt });
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

  if (isRefundPayload(posted)) return handleRefundWebhook(posted, tapSecretKey);

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

  const eventVersion = cleanText(verified.updated || verified.transaction?.created || verified.created, 100) || "unknown";
  await db.insert(paymentEvents).values({
    provider: "tap",
    providerEventId: `${chargeId}:${status}:${eventVersion}:${verified.amount ?? "na"}`,
    orderNumber: orderNumber || null,
    chargeId,
    objectType: cleanText(verified.object, 40) || "charge",
    eventType: "charge_status",
    amountMinor: typeof verified.amount === "number" ? Math.round(verified.amount * 100) : null,
    currency: cleanText(verified.currency, 10).toUpperCase() || null,
    signatureVerified: true,
    processedAt: new Date().toISOString(),
    status,
    payload: JSON.stringify(verified).slice(0, 60_000),
  }).onConflictDoNothing({ target: paymentEvents.providerEventId });

  if (cleanText(verified.metadata?.product, 40) === "meras-ai") {
    const aiOrderNumber = cleanText(verified.metadata?.ai_order_number || orderNumber, 160);
    return handleAiSubscriptionCharge(verified, chargeId, status, aiOrderNumber);
  }

  const [orderByCharge] = await db.select().from(orders).where(eq(orders.tapChargeId, chargeId)).limit(1);
  const [orderByNumber] = orderNumber ? await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1) : [];
  if (orderByCharge && orderByNumber && orderByCharge.id !== orderByNumber.id) {
    return jsonError("تعارض معرّف عملية Tap مع رقم الطلب", 409);
  }
  const order = orderByCharge || orderByNumber;

  if (!order) return Response.json({ ok: true, received: true, matched: false });
  if (orderNumber && order.orderNumber !== orderNumber) return jsonError("رقم الطلب لا يطابق عملية Tap المسجلة", 409);
  if (order.tapChargeId && order.tapChargeId !== chargeId) return jsonError("الطلب مرتبط مسبقًا بعملية Tap مختلفة", 409);
  const itemRows = await db.select({ courseSlug: orderItems.courseSlug, accessDurationDays: orderItems.accessDurationDays }).from(orderItems).where(eq(orderItems.orderNumber, order.orderNumber));
  const expectedCourseSlugs = itemRows.length ? itemRows.map((item) => item.courseSlug) : [order.courseSlug];
  const nextStatus = orderState(status);
  if (["paid", "refunded", "partially_refunded"].includes(nextStatus)) {
    const amountMatches = nextStatus !== "paid" || (typeof verified.amount === "number" && Math.abs(verified.amount - order.total) < 0.01);
    const currencyMatches = cleanText(verified.currency, 10).toUpperCase() === order.currency.toUpperCase();
    const postedCourseSlugs = verified.metadata?.course_slugs?.split(",").map((slug) => cleanText(slug, 120)).filter(Boolean) || (verified.metadata?.course_slug ? [verified.metadata.course_slug] : []);
    const courseMatches = !postedCourseSlugs.length || (postedCourseSlugs.length === expectedCourseSlugs.length && postedCourseSlugs.every((slug) => expectedCourseSlugs.includes(slug)));
    const emailMatches = !verified.customer?.email || verified.customer.email.toLowerCase() === order.customerEmail.toLowerCase();
    if (!amountMatches || !currencyMatches || !courseMatches || !emailMatches) return jsonError("فشلت مطابقة تفاصيل عملية الدفع", 409);
  }
  const now = new Date().toISOString();
  let notify: { id: number; title: string; body: string; route: string } | null = null;
  let effectiveStatus = nextStatus;
  let transitionError: string | null = null;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${order.orderNumber}))`);
    const [current] = await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    if (!current) return;

    if (nextStatus === "paid" && current.status !== "refunded") {
      const purchaseItems = itemRows.length ? itemRows : [{ courseSlug: current.courseSlug, accessDurationDays: 90 }];
      if (current.couponCode) {
        const redeemed = await redeemCouponReservationTx(tx, {
          orderNumber: current.orderNumber,
          couponCode: current.couponCode,
          customerEmail: current.customerEmail,
          now,
        });
        if (!redeemed.ok) {
          const newlyUnderReview = current.status !== "payment_review";
          await tx.update(orders).set({ status: "payment_review", tapChargeId: chargeId, paidAt: current.paidAt || now, updatedAt: now }).where(eq(orders.id, current.id));
          if (newlyUnderReview) {
            const title = "استلمنا دفعتك ونراجع الكوبون";
            const body = `تم استلام دفعة الطلب ${current.orderNumber}، ونراجع أهلية الكوبون قبل تفعيل المحتوى لحماية حسابك.`;
            const [notice] = await tx.insert(notificationsDb).values({ userEmail: current.customerEmail, audience: "student", title, body, actionUrl: "/dashboard?view=orders", actionLabel: "عرض الطلب", template: "general", dedupeKey: `order:${current.orderNumber}:coupon-review`, pushStatus: "processing", pushClaimedAt: now, createdAt: now }).onConflictDoNothing({ target: notificationsDb.dedupeKey }).returning({ id: notificationsDb.id });
            if (notice) notify = { id: notice.id, title, body, route: "/dashboard?view=orders" };
          }
          effectiveStatus = "payment_review";
          return;
        }
      }
      for (const item of [...purchaseItems].sort((left, right) => left.courseSlug.localeCompare(right.courseSlug))) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`access:${current.customerEmail}:${item.courseSlug}`}))`);
      }
      let duplicateEntitlement: { courseSlug: string; orderNumber: string | null } | null = null;
      for (const item of purchaseItems) {
        const [existing] = await tx.select().from(courseAccess).where(and(eq(courseAccess.userEmail, current.customerEmail), eq(courseAccess.courseSlug, item.courseSlug))).limit(1);
        const active = existing && !existing.revokedAt && (!existing.expiresAt || Date.parse(existing.expiresAt) > Date.now());
        if (active && existing.orderNumber !== current.orderNumber) {
          duplicateEntitlement = { courseSlug: item.courseSlug, orderNumber: existing.orderNumber };
          break;
        }
      }
      if (duplicateEntitlement) {
        const newlyUnderReview = current.status !== "payment_review";
        await tx.update(orders).set({ status: "payment_review", tapChargeId: chargeId, paidAt: current.paidAt || now, updatedAt: now }).where(eq(orders.id, current.id));
        if (newlyUnderReview) {
          await qualifyReferralForPaidOrderTx(tx, current.customerEmail, now);
          const title = "استلمنا دفعتك ونتحقق من الاشتراك";
          const body = `لديك وصول قائم إلى ${duplicateEntitlement.courseSlug}. أوقفنا التفعيل المكرر للطلب ${current.orderNumber} وسيُراجع تلقائيًا قبل أي تفعيل مكرر.`;
          const [notice] = await tx.insert(notificationsDb).values({ userEmail: current.customerEmail, audience: "student", title, body, actionUrl: "/dashboard?view=orders", actionLabel: "عرض الطلب", template: "general", dedupeKey: `order:${current.orderNumber}:payment-review`, pushStatus: "processing", pushClaimedAt: now, createdAt: now }).onConflictDoNothing({ target: notificationsDb.dedupeKey }).returning({ id: notificationsDb.id });
          if (notice) notify = { id: notice.id, title, body, route: "/dashboard?view=orders" };
        }
        effectiveStatus = "payment_review";
        return;
      }
      const fulfilled = await fulfillPaidOrderTx(tx, current, purchaseItems, { chargeId, actorEmail: "tap-webhook", now });
      if (fulfilled.notice) notify = fulfilled.notice;
      effectiveStatus = "paid";
      return;
    }

    if (nextStatus === "partially_refunded") {
      if (!["paid", "partially_refunded", "payment_review"].includes(current.status)) {
        transitionError = `لا يمكن تسجيل استرداد جزئي لطلب حالته ${current.status}`;
        effectiveStatus = current.status;
        return;
      }
      await tx.update(orders).set({ status: "partially_refunded", tapChargeId: chargeId, updatedAt: now }).where(eq(orders.id, current.id));
      const title = "تم تسجيل استرداد جزئي";
      const body = `تم تحديث الطلب ${current.orderNumber} باسترداد جزئي. يمكنك متابعة التفاصيل من سجل الطلبات.`;
      const [notice] = await tx.insert(notificationsDb).values({ userEmail: current.customerEmail, audience: "student", title, body, actionUrl: "/dashboard?view=orders", actionLabel: "عرض الطلب", template: "general", dedupeKey: `order:${current.orderNumber}:partial-refund:${eventVersion}`, pushStatus: "processing", pushClaimedAt: now, createdAt: now }).onConflictDoNothing({ target: notificationsDb.dedupeKey }).returning({ id: notificationsDb.id });
      if (notice) notify = { id: notice.id, title, body, route: "/dashboard?view=orders" };
      effectiveStatus = "partially_refunded";
      return;
    }

    if (nextStatus === "refunded") {
      if (!["paid", "partially_refunded", "payment_review", "refunded"].includes(current.status)) {
        transitionError = `لا يمكن تسجيل استرداد كامل لطلب حالته ${current.status}`;
        effectiveStatus = current.status;
        return;
      }
      const newlyRefunded = current.status !== "refunded";
      await tx.update(orders).set({ status: "refunded", tapChargeId: chargeId, updatedAt: now }).where(eq(orders.id, current.id));
      await reconcileReferralQualificationAfterRefundTx(tx, current.customerEmail, now);
      const affected = await tx.select().from(courseAccess).where(and(eq(courseAccess.orderNumber, current.orderNumber), eq(courseAccess.userEmail, current.customerEmail)));
      for (const access of affected) {
        await tx.update(courseAccess).set({ revokedAt: now, revocationReason: "payment_refunded", suspendedAt: null, suspensionReason: null, updatedAt: now }).where(eq(courseAccess.id, access.id));
        await tx.insert(courseAccessEvents).values({ eventKey: `order:${current.orderNumber}:refund:${access.courseSlug}`, accessId: access.id, userEmail: access.userEmail, courseSlug: access.courseSlug, action: "refund_revoked", actorEmail: "tap-webhook", reason: "payment_refunded", orderNumber: current.orderNumber, beforeJson: JSON.stringify(access), afterJson: JSON.stringify({ revokedAt: now }), createdAt: now }).onConflictDoNothing({ target: courseAccessEvents.eventKey });
      }
      if (newlyRefunded) {
        const title = "تم تحديث حالة الاسترداد";
        const body = `اكتمل استرداد الطلب ${current.orderNumber} وتم إيقاف الوصول المرتبط به.`;
        const [notice] = await tx.insert(notificationsDb).values({ userEmail: current.customerEmail, audience: "student", title, body, actionUrl: "/dashboard?view=orders", actionLabel: "عرض الطلب", template: "general", dedupeKey: `order:${current.orderNumber}:refunded`, pushStatus: "processing", pushClaimedAt: now, createdAt: now }).onConflictDoNothing({ target: notificationsDb.dedupeKey }).returning({ id: notificationsDb.id });
        if (notice) notify = { id: notice.id, title, body, route: "/dashboard?view=orders" };
      }
      effectiveStatus = "refunded";
      return;
    }

    if (["cancelled", "failed", "voided"].includes(nextStatus)) {
      await tx.update(couponUses).set({ status: "released", releasedAt: now }).where(and(eq(couponUses.orderNumber, current.orderNumber), eq(couponUses.status, "reserved")));
    }
    if (current.status !== "paid" && current.status !== "refunded") await tx.update(orders).set({ status: nextStatus, tapChargeId: chargeId, updatedAt: now }).where(eq(orders.id, current.id));
    else effectiveStatus = current.status;
  });

  if (transitionError) return jsonError(transitionError, 409);

  const queuedNotice = notify as { id: number; title: string; body: string; route: string } | null;
  if (queuedNotice) {
    const delivery = await sendPushNotification({ userEmail: order.customerEmail }, queuedNotice.title, queuedNotice.body, { route: queuedNotice.route, notificationId: queuedNotice.id });
    const pushStatus = delivery.accepted > 0 ? "accepted" : delivery.attempted === 0 ? "no_devices" : "failed";
    await db.update(notificationsDb).set({ pushStatus, pushAttempts: sql`${notificationsDb.pushAttempts} + 1`, pushLastError: delivery.providerErrors.join(" | ").slice(0, 1000) || null, pushDeliveredAt: delivery.accepted > 0 ? new Date().toISOString() : null }).where(eq(notificationsDb.id, queuedNotice.id));
  }

  return Response.json({ ok: true, received: true, matched: true, status: effectiveStatus });
}
