import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { adminApprovals, auditLogs, orders, paymentEvents, refundRequests } from "@/db/schema";
import { cleanText, jsonError, requestOrigin } from "@/lib/api";
import { checkRateLimit, clientIp, sameOriginRequest } from "@/lib/auth";
import { AdminMfaError, requireAdminStepUp } from "@/lib/admin-mfa";
import { resolveRefundAmount, toMinorUnits } from "@/lib/finance";
import { createAndSendNotification } from "@/lib/notifications";
import { ADMIN_PERMISSIONS, authorizePermission } from "@/lib/permissions";
import {
  applyConfirmedRefundToOrder,
  confirmedRefundMinorById,
  issueCreditNote,
  majorAmountToMinor,
  reconcileRefundRequest,
  REFUND_RESERVING_STATUSES,
  requestedRefundMinor,
  tapRefundRequestStatus,
} from "@/lib/refunds";

const reviewable = ["pending", "first_approved", "approved_pending_provider", "provider_failed"];

async function admin(request: Request) {
  const user = await authorizePermission(request, ADMIN_PERMISSIONS.FINANCE_MANAGE);
  if (!user || !sameOriginRequest(request)) return null;
  if (!await checkRateLimit("refund-admin", `user:${user!.id}:${clientIp(request)}`, 30, 60)) return null;
  return user;
}

type RefundRow = typeof refundRequests.$inferSelect;
type PaymentEventRow = Pick<typeof paymentEvents.$inferSelect, "status" | "payload">;

function occupiedRefundMinor(
  order: Pick<typeof orders.$inferSelect, "total" | "status">,
  events: PaymentEventRow[],
  requests: RefundRow[],
  excludeRequestId?: number,
) {
  const confirmedMinor = toMinorUnits(resolveRefundAmount(order, events).amount);
  const confirmedById = confirmedRefundMinorById(events);
  const managedAmountsByProvider = new Map<string, number>();
  for (const request of requests) {
    if (!request.providerRefundId) continue;
    managedAmountsByProvider.set(request.providerRefundId, Math.max(managedAmountsByProvider.get(request.providerRefundId) || 0, request.amountMinor));
  }
  let managedConfirmedCoverage = 0;
  for (const [providerRefundId, amountMinor] of confirmedById) {
    managedConfirmedCoverage += Math.min(amountMinor, managedAmountsByProvider.get(providerRefundId) || 0);
  }
  const unmanagedConfirmedMinor = Math.max(0, confirmedMinor - managedConfirmedCoverage);
  const reservedManagedMinor = requests.reduce((sum, request) => {
    if (request.id === excludeRequestId || !REFUND_RESERVING_STATUSES.has(request.status)) return sum;
    return sum + Math.max(0, request.amountMinor);
  }, 0);
  return unmanagedConfirmedMinor + reservedManagedMinor;
}

function mfaError(error: unknown) {
  if (!(error instanceof AdminMfaError)) return null;
  return Response.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const user = await authorizePermission(request, ADMIN_PERMISSIONS.FINANCE_VIEW);
  if (!user) return jsonError("غير مصرح بعرض الاستردادات", 403);
  const db = getDb();
  const rows = await db.select().from(refundRequests).orderBy(desc(refundRequests.createdAt)).limit(500);
  const approvals = await db.select().from(adminApprovals).where(eq(adminApprovals.entityType, "refund_request")).orderBy(desc(adminApprovals.createdAt)).limit(2_000);
  return Response.json({ ok: true, requests: rows.map((row) => ({ ...row, approvals: approvals.filter((item) => item.entityId === String(row.id)) })) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await admin(request);
  if (!user) return jsonError("غير مصرح أو تجاوزت حد المحاولات", 403);
  try {
    await requireAdminStepUp(request, user);
  } catch (error) {
    const response = mfaError(error);
    if (response) return response;
    throw error;
  }
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات الاسترداد غير صالحة"); }
  const action = cleanText(payload.action, 30);
  const db = getDb();
  const now = new Date().toISOString();

  if (action === "create") {
    const orderNumber = cleanText(payload.orderNumber, 160);
    const reason = cleanText(payload.reason, 1000);
    const requested = requestedRefundMinor({ amountMinor: payload.amountMinor, amount: payload.amount });
    if (!requested) return jsonError("مبلغ الاسترداد يجب أن يكون عددًا صحيحًا موجبًا من الهللات وبحد أقصى منزلتين عشريتين", 400);
    if (reason.length < 8) return jsonError("اكتب سببًا واضحًا للاسترداد");
    const requestNumber = `RF-${crypto.randomUUID().replace(/-/g, "").slice(0, 14).toUpperCase()}`;
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${orderNumber}))`);
      const [order] = await tx.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
      if (!order || !order.tapChargeId || !["paid", "partially_refunded", "payment_review"].includes(order.status)) return { error: "الطلب غير مؤهل للاسترداد", status: 409 } as const;
      if (order.currency.toUpperCase() !== "SAR") return { error: "الاسترداد الإداري بالهللات متاح حاليًا لطلبات SAR فقط", status: 409 } as const;
      const [events, requests] = await Promise.all([
        tx.select({ status: paymentEvents.status, payload: paymentEvents.payload }).from(paymentEvents).where(eq(paymentEvents.orderNumber, orderNumber)),
        tx.select().from(refundRequests).where(eq(refundRequests.orderNumber, orderNumber)),
      ]);
      const replay = requests.find((request) => REFUND_RESERVING_STATUSES.has(request.status)
        && request.status !== "completed"
        && request.requestedByEmail.toLowerCase() === user.email.toLowerCase()
        && request.amountMinor === requested
        && request.reason === reason);
      if (replay) return { request: replay, replayed: true } as const;
      const totalMinor = order.totalMinor ?? toMinorUnits(order.total);
      const remainingMinor = Math.max(0, totalMinor - occupiedRefundMinor(order, events, requests));
      if (requested > remainingMinor) return { error: "مبلغ الاسترداد أكبر من الرصيد المتاح بعد حجز الطلبات المفتوحة", status: 409 } as const;
      const [row] = await tx.insert(refundRequests).values({ requestNumber, orderNumber, requestedByEmail: user.email, amountMinor: requested, currency: order.currency, reason, status: "pending", createdAt: now, updatedAt: now }).returning();
      await tx.insert(auditLogs).values({ actorEmail: user.email, action: "create", entityType: "refund_request", entityId: String(row.id), afterJson: JSON.stringify({ requestNumber, orderNumber, amountMinor: requested, currency: order.currency, reason }), ipAddress: clientIp(request), createdAt: now });
      return { request: row, replayed: false } as const;
    });
    if ("error" in result) return jsonError(result.error || "تعذر إنشاء طلب الاسترداد", result.status || 409);
    return Response.json({ ok: true, request: result.request, replayed: result.replayed, message: result.replayed ? "أُعيد طلب الاسترداد المفتوح نفسه دون إنشاء طلب مكرر" : "أُنشئ الطلب وينتظر موافقتين من مديرين مختلفين غير منشئ الطلب" }, { status: result.replayed ? 200 : 201 });
  }

  const id = Math.floor(Number(payload.id));
  if (!id) return jsonError("طلب الاسترداد غير صالح");
  const [refund] = await db.select().from(refundRequests).where(eq(refundRequests.id, id)).limit(1);
  if (!refund) return jsonError("طلب الاسترداد غير موجود", 404);

  if (action === "reject") {
    if (!reviewable.includes(refund.status)) return jsonError("لا يمكن رفض الطلب في حالته الحالية", 409);
    const note = cleanText(payload.note, 600);
    if (note.length < 4) return jsonError("اكتب سببًا واضحًا لرفض طلب الاسترداد");
    const rejection = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`refund:${id}`}))`);
      const [current] = await tx.select().from(refundRequests).where(eq(refundRequests.id, id)).limit(1);
      if (!current || !reviewable.includes(current.status)) return { ok: false as const, status: current?.status || "missing" };
      await tx.insert(adminApprovals).values({ entityType: "refund_request", entityId: String(id), action: "refund", approverEmail: user.email, decision: "rejected", note, createdAt: now }).onConflictDoUpdate({ target: [adminApprovals.entityType, adminApprovals.entityId, adminApprovals.action, adminApprovals.approverEmail], set: { decision: "rejected", note, createdAt: now } });
      await tx.update(refundRequests).set({ status: "rejected", reviewedBy: user.email, reviewNote: note, updatedAt: now }).where(eq(refundRequests.id, id));
      await tx.insert(auditLogs).values({ actorEmail: user.email, action: "reject", entityType: "refund_request", entityId: String(id), beforeJson: JSON.stringify(current), afterJson: JSON.stringify({ status: "rejected", note }), ipAddress: clientIp(request), createdAt: now });
      return { ok: true as const, status: "rejected" };
    });
    if (!rejection.ok) return jsonError(`لا يمكن رفض الطلب في حالته الحالية (${rejection.status})`, 409);
    return Response.json({ ok: true, status: "rejected" });
  }

  if (action !== "approve") return jsonError("إجراء الاسترداد غير معروف");
  if (!reviewable.includes(refund.status)) return jsonError("لا يمكن اعتماد الطلب في حالته الحالية", 409);
  if (refund.requestedByEmail.toLowerCase() === user.email.toLowerCase()) return jsonError("منشئ طلب الاسترداد لا يمكن أن يكون أحد الموافقين عليه", 409);
  const approval = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`refund:${id}`}))`);
    const [current] = await tx.select().from(refundRequests).where(eq(refundRequests.id, id)).limit(1);
    if (!current || !reviewable.includes(current.status)) return { send: false, status: current?.status || "missing", approvals: 0 };
    if (current.requestedByEmail.toLowerCase() === user.email.toLowerCase()) return { send: false, status: "maker_cannot_approve", approvals: 0 };
    await tx.insert(adminApprovals).values({ entityType: "refund_request", entityId: String(id), action: "refund", approverEmail: user.email, decision: "approved", note: cleanText(payload.note, 600) || null, createdAt: now }).onConflictDoNothing({ target: [adminApprovals.entityType, adminApprovals.entityId, adminApprovals.action, adminApprovals.approverEmail] });
    const [total] = await tx.select({ value: sql<number>`count(distinct lower(${adminApprovals.approverEmail}))` }).from(adminApprovals).where(and(eq(adminApprovals.entityType, "refund_request"), eq(adminApprovals.entityId, String(id)), eq(adminApprovals.action, "refund"), eq(adminApprovals.decision, "approved"), sql`lower(${adminApprovals.approverEmail}) <> lower(${current.requestedByEmail})`));
    const approvals = Number(total?.value || 0);
    const next = approvals >= 2 ? "provider_processing" : "first_approved";
    await tx.update(refundRequests).set({ status: next, reviewedBy: user.email, providerRefundId: approvals >= 2 && current.status === "provider_failed" ? null : current.providerRefundId, approvedAt: approvals >= 2 ? current.approvedAt || now : current.approvedAt, updatedAt: now }).where(eq(refundRequests.id, id));
    await tx.insert(auditLogs).values({ actorEmail: user.email, action: "approve", entityType: "refund_request", entityId: String(id), beforeJson: JSON.stringify(current), afterJson: JSON.stringify({ status: next, approvals }), ipAddress: clientIp(request), createdAt: now });
    return { send: approvals >= 2, status: next, approvals, refund: { ...current, providerRefundId: approvals >= 2 && current.status === "provider_failed" ? null : current.providerRefundId } };
  });
  if (approval.status === "maker_cannot_approve") return jsonError("منشئ طلب الاسترداد لا يمكن أن يكون أحد الموافقين عليه", 409);
  if (!approval.send) return Response.json({ ok: true, status: approval.status, approvals: approval.approvals, required: 2 });

  const approvedRefund = refund;
  const readiness = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${approvedRefund.orderNumber}))`);
    const [order] = await tx.select().from(orders).where(eq(orders.orderNumber, approvedRefund.orderNumber)).limit(1);
    if (!order?.tapChargeId || order.currency.toUpperCase() !== "SAR" || !["paid", "partially_refunded", "payment_review"].includes(order.status)) {
      const reviewNote = "ألغي الإرسال لأن عملية Tap الأصلية غير موجودة أو لم تعد مؤهلة للاسترداد";
      await tx.update(refundRequests).set({ status: "rejected", reviewNote, updatedAt: new Date().toISOString() }).where(eq(refundRequests.id, approvedRefund.id));
      await tx.insert(auditLogs).values({ actorEmail: user.email, action: "provider_send_blocked", entityType: "refund_request", entityId: String(approvedRefund.id), beforeJson: JSON.stringify(approvedRefund), afterJson: JSON.stringify({ status: "rejected", reason: reviewNote }), ipAddress: clientIp(request), createdAt: new Date().toISOString() });
      return { error: "عملية Tap الأصلية غير موجودة أو لم تعد مؤهلة للاسترداد", status: 409 } as const;
    }
    const [events, requests] = await Promise.all([
      tx.select({ status: paymentEvents.status, payload: paymentEvents.payload }).from(paymentEvents).where(eq(paymentEvents.orderNumber, approvedRefund.orderNumber)),
      tx.select().from(refundRequests).where(eq(refundRequests.orderNumber, approvedRefund.orderNumber)),
    ]);
    const totalMinor = order.totalMinor ?? toMinorUnits(order.total);
    const remainingMinor = Math.max(0, totalMinor - occupiedRefundMinor(order, events, requests, approvedRefund.id));
    if (approvedRefund.amountMinor > remainingMinor) {
      const reviewNote = "ألغي الإرسال لأن الرصيد القابل للاسترداد تغيّر بعد إنشاء الطلب";
      await tx.update(refundRequests).set({ status: "rejected", reviewNote, updatedAt: new Date().toISOString() }).where(eq(refundRequests.id, approvedRefund.id));
      await tx.insert(auditLogs).values({ actorEmail: user.email, action: "provider_send_blocked", entityType: "refund_request", entityId: String(approvedRefund.id), beforeJson: JSON.stringify(approvedRefund), afterJson: JSON.stringify({ status: "rejected", remainingMinor, requestedMinor: approvedRefund.amountMinor }), ipAddress: clientIp(request), createdAt: new Date().toISOString() });
      return { error: "تغيّر الرصيد القابل للاسترداد، لذلك أُلغي الإرسال إلى Tap لمنع تجاوز قيمة الطلب", status: 409 } as const;
    }
    return { order } as const;
  });
  if ("error" in readiness) return jsonError(readiness.error || "تعذر إرسال طلب الاسترداد", readiness.status || 409);
  const order = readiness.order;
  const tapChargeId = order.tapChargeId;
  if (!tapChargeId) return jsonError("عملية Tap الأصلية غير موجودة", 409);
  const tapSecret = process.env.TAP_SECRET_KEY?.trim();
  if (!tapSecret) {
    await db.update(refundRequests).set({ status: "approved_pending_provider", reviewNote: "مفتاح Tap غير مهيأ", updatedAt: new Date().toISOString() }).where(and(eq(refundRequests.id, id), eq(refundRequests.status, "provider_processing")));
    return Response.json({ ok: true, status: "approved_pending_provider", approvals: approval.approvals, providerConfigured: false, message: "اكتملت الموافقات ويحتاج الخادم إلى مفتاح Tap لإرسال الاسترداد" }, { status: 202 });
  }
  let response: Response;
  try {
    response = await fetch("https://api.tap.company/v2/refunds/", {
      method: "POST",
      headers: { authorization: `Bearer ${tapSecret}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ charge_id: tapChargeId, amount: approvedRefund.amountMinor / 100, currency: approvedRefund.currency, reason: "requested_by_customer", description: approvedRefund.reason, reference: { merchant: approvedRefund.requestNumber, idempotent: approvedRefund.requestNumber }, metadata: { refund_request: approvedRefund.requestNumber, order_number: approvedRefund.orderNumber }, post: { url: `${requestOrigin(request)}/api/webhooks/tap` } }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    await reconcileRefundRequest({ id, status: "provider_pending", reviewNote: "نتيجة الاتصال بـ Tap غير مؤكدة؛ يلزم انتظار webhook أو المطابقة قبل أي إعادة إرسال" });
    return jsonError("تعذر تأكيد نتيجة Tap. أوقفنا إعادة الإرسال تلقائيًا حتى لا يتكرر الاسترداد.", 502);
  }
  let provider: {
    id?: string;
    status?: string;
    object?: string;
    charge_id?: string;
    amount?: number;
    currency?: string;
    message?: string;
    response?: { message?: string };
    metadata?: { refund_request?: string; order_number?: string };
    reference?: { merchant?: string; idempotent?: string };
    updated?: string;
    date?: string;
    created?: string;
    transaction?: { created?: string };
  } = {};
  try { provider = await response.json() as typeof provider; } catch { /* handled by response status */ }
  const providerId = cleanText(provider.id, 160);
  const providerStatus = cleanText(provider.status, 60).toUpperCase();
  const providerAmountMinor = majorAmountToMinor(provider.amount);
  const validRefundShape = providerId.startsWith("re_") && cleanText(provider.object, 30).toLowerCase() === "refund";
  const providerMatchesRequest = validRefundShape
    && cleanText(provider.charge_id, 160) === tapChargeId
    && providerAmountMinor === approvedRefund.amountMinor
    && cleanText(provider.currency, 10).toUpperCase() === approvedRefund.currency.toUpperCase()
    && (!provider.metadata?.refund_request || cleanText(provider.metadata.refund_request, 160) === approvedRefund.requestNumber)
    && (!provider.metadata?.order_number || cleanText(provider.metadata.order_number, 160) === approvedRefund.orderNumber)
    && (!provider.reference?.merchant || cleanText(provider.reference.merchant, 160) === approvedRefund.requestNumber)
    && (!provider.reference?.idempotent || cleanText(provider.reference.idempotent, 160) === approvedRefund.requestNumber);
  const providerMessage = cleanText(provider.message || provider.response?.message, 500) || `Tap HTTP ${response.status}`;
  if (!response.ok || !providerMatchesRequest) {
    const ambiguous = response.status >= 500 || response.status === 409 || validRefundShape;
    await reconcileRefundRequest({ id, providerRefundId: providerMatchesRequest ? providerId : null, status: ambiguous ? "provider_pending" : "provider_failed", reviewNote: providerMatchesRequest ? providerMessage : `تعذر مطابقة استجابة Tap: ${providerMessage}` });
    return jsonError("رفضت Tap إنشاء الاسترداد؛ بقي الطلب محفوظًا للمراجعة", 502);
  }
  const status = tapRefundRequestStatus(providerStatus);
  const reconciled = await reconcileRefundRequest({ id, providerRefundId: providerId, status, reviewNote: status === "provider_failed" ? providerMessage : null, completedAt: status === "completed" ? new Date().toISOString() : null });
  if (!reconciled.ok) return jsonError("تعارض معرّف الاسترداد لدى Tap مع السجل المحلي", 409);
  if (status === "provider_failed") return jsonError("رفضت Tap الاسترداد. يمكن إعادة المحاولة بعد مراجعة سبب الرفض.", 502);
  if (status === "completed") {
    const eventVersion = cleanText(provider.updated || provider.date || provider.created || provider.transaction?.created, 100) || "unknown";
    await db.insert(paymentEvents).values({
      provider: "tap",
      providerEventId: `tap:refund:${providerId}:REFUND_REFUNDED:${eventVersion}`,
      orderNumber: approvedRefund.orderNumber,
      chargeId: tapChargeId,
      objectType: "refund",
      eventType: "refund_status",
      amountMinor: approvedRefund.amountMinor,
      currency: approvedRefund.currency,
      signatureVerified: true,
      processedAt: new Date().toISOString(),
      status: "REFUND_REFUNDED",
      payload: JSON.stringify(provider).slice(0, 60_000),
    }).onConflictDoNothing({ target: paymentEvents.providerEventId });
    const applied = await applyConfirmedRefundToOrder({ orderNumber: approvedRefund.orderNumber, chargeId: tapChargeId });
    if (!applied.ok) return jsonError("أكدت Tap الاسترداد لكن تعذر تطبيق انتقال الطلب محليًا؛ يلزم فحص المطابقة", 409);
    await issueCreditNote({ orderNumber: approvedRefund.orderNumber, reference: approvedRefund.requestNumber, amountMinor: approvedRefund.amountMinor, reason: approvedRefund.reason });
    if (applied.newlyFullyRefunded) await createAndSendNotification({ values: { userEmail: order.customerEmail, audience: "student", title: "اكتمل الاسترداد", body: `اكتمل استرداد الطلب ${approvedRefund.orderNumber} وتم إيقاف الوصول المرتبط به.`, actionUrl: "/dashboard?view=orders", actionLabel: "عرض الطلب" }, target: { userEmail: order.customerEmail }, data: { route: "/dashboard?view=orders" } });
  }
  if (status === "provider_pending") await createAndSendNotification({ values: { userEmail: order.customerEmail, audience: "student", title: "بدأت معالجة الاسترداد", body: `تم اعتماد استرداد الطلب ${approvedRefund.orderNumber} وأرسل إلى Tap للمعالجة.`, actionUrl: "/dashboard?view=orders", actionLabel: "عرض الطلب" }, target: { userEmail: order.customerEmail }, data: { route: "/dashboard?view=orders" } });
  return Response.json({ ok: true, status, providerRefundId: providerId, providerStatus });
}
