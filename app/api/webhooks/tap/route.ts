import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { couponsDb, courseAccess, courseAccessEvents, invoices, notificationsDb, orderItems, orders, paymentEvents } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { accessExpiryIso, normalizeAccessDurationDays } from "@/lib/course-access";
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

  const eventVersion = cleanText(verified.updated || verified.transaction?.created || verified.created, 100) || "unknown";
  await db.insert(paymentEvents).values({
    provider: "tap",
    providerEventId: `${chargeId}:${status}:${eventVersion}:${verified.amount ?? "na"}`,
    orderNumber: orderNumber || null,
    chargeId,
    status,
    payload: JSON.stringify(verified).slice(0, 60_000),
  }).onConflictDoNothing({ target: paymentEvents.providerEventId });

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
          const title = "استلمنا دفعتك ونتحقق من الاشتراك";
          const body = `لديك وصول قائم إلى ${duplicateEntitlement.courseSlug}. أوقفنا التفعيل المكرر للطلب ${current.orderNumber} وسيُراجع تلقائيًا قبل أي تفعيل مكرر.`;
          const [notice] = await tx.insert(notificationsDb).values({ userEmail: current.customerEmail, audience: "student", title, body, actionUrl: "/dashboard?view=orders", actionLabel: "عرض الطلب", template: "general", dedupeKey: `order:${current.orderNumber}:payment-review`, pushStatus: "processing", pushClaimedAt: now, createdAt: now }).onConflictDoNothing({ target: notificationsDb.dedupeKey }).returning({ id: notificationsDb.id });
          if (notice) notify = { id: notice.id, title, body, route: "/dashboard?view=orders" };
        }
        effectiveStatus = "payment_review";
        return;
      }
      const changed = await tx.update(orders).set({ status: "paid", tapChargeId: chargeId, updatedAt: now, paidAt: current.paidAt || now }).where(and(eq(orders.id, current.id), ne(orders.status, "paid"), ne(orders.status, "refunded"))).returning({ id: orders.id });
      const newlyPaid = changed.length > 0;
      const startsAt = current.paidAt || now;

      for (const item of purchaseItems) {
        const durationDays = normalizeAccessDurationDays(item.accessDurationDays);
        const expiresAt = accessExpiryIso(durationDays, new Date(startsAt));
        const [existing] = await tx.select().from(courseAccess).where(and(eq(courseAccess.userEmail, current.customerEmail), eq(courseAccess.courseSlug, item.courseSlug))).limit(1);
        let accessId = existing?.id;
        const canRepair = !existing || existing.orderNumber === current.orderNumber || Boolean(existing.revokedAt) || Boolean(existing.expiresAt && Date.parse(existing.expiresAt) <= Date.now());
        if (!existing) {
          const [created] = await tx.insert(courseAccess).values({ userEmail: current.customerEmail, courseSlug: item.courseSlug, source: "tap", orderNumber: current.orderNumber, startsAt, expiresAt, suspendedAt: null, suspensionReason: null, revokedAt: null, revocationReason: null, updatedAt: now }).returning({ id: courseAccess.id });
          accessId = created?.id;
        } else if (canRepair) {
          await tx.update(courseAccess).set({ source: "tap", orderNumber: current.orderNumber, startsAt, expiresAt, suspendedAt: null, suspensionReason: null, revokedAt: null, revocationReason: null, updatedAt: now }).where(eq(courseAccess.id, existing.id));
        }
        if (canRepair) await tx.insert(courseAccessEvents).values({ eventKey: `order:${current.orderNumber}:grant:${item.courseSlug}`, accessId, userEmail: current.customerEmail, courseSlug: item.courseSlug, action: newlyPaid ? "purchase_granted" : "purchase_reconciled", actorEmail: "tap-webhook", orderNumber: current.orderNumber, afterJson: JSON.stringify({ startsAt, expiresAt, durationDays }), createdAt: now }).onConflictDoNothing({ target: courseAccessEvents.eventKey });
      }

      await tx.insert(invoices).values({ invoiceNumber: `INV-${current.orderNumber}`, orderNumber: current.orderNumber, customerEmail: current.customerEmail, total: current.total, taxAmount: Math.round((current.total * 15 / 115) * 100) / 100, currency: current.currency, issuedAt: startsAt }).onConflictDoNothing({ target: invoices.orderNumber });
      if (newlyPaid && current.couponCode) await tx.update(couponsDb).set({ usedCount: sql`${couponsDb.usedCount} + 1` }).where(eq(couponsDb.code, current.couponCode));
      const title = "تم تفعيل اشتراكك";
      const body = expectedCourseSlugs.length > 1 ? `تم تفعيل ${expectedCourseSlugs.length} مواد ضمن الطلب ${current.orderNumber}.` : "أصبحت المادة متاحة الآن في مساحة التعلم الخاصة بك.";
      const [notice] = await tx.insert(notificationsDb).values({ userEmail: current.customerEmail, audience: "student", title, body, actionUrl: "/dashboard?view=courses", actionLabel: "ابدأ التعلم", template: "success", dedupeKey: `order:${current.orderNumber}:paid`, pushStatus: "processing", pushClaimedAt: now, createdAt: now }).onConflictDoNothing({ target: notificationsDb.dedupeKey }).returning({ id: notificationsDb.id });
      if (notice) notify = { id: notice.id, title, body, route: "/dashboard?view=courses" };
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
