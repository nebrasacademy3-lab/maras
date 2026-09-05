import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { aiSubscriptionOrders, auditLogs, courseAccess, courseAccessEvents, creditNotes, invoices, notificationsDb, orderItems, orders, paymentEvents, refundRequests } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, sameOriginRequest } from "@/lib/auth";
import { AdminMfaError, requireAdminStepUp } from "@/lib/admin-mfa";
import { getCoursesCatalog, getInstitutionsCatalog } from "@/lib/catalog-store";
import { fulfillPaidOrderTx } from "@/lib/order-fulfillment";
import { sendPushNotification } from "@/lib/push";
import {
  CAPTURED_ORDER_STATUSES,
  csvCell,
  financeDateRange,
  financeMetrics,
  resolveRefundAmount,
  toMinorUnits,
  fromMinorUnits,
  type FinancePaymentEvent,
} from "@/lib/finance";
import { ADMIN_PERMISSIONS, authorizePermission, hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUS_ARABIC: Record<string, string> = {
  pending: "بانتظار بدء الدفع",
  initiated: "بدأت عملية الدفع",
  in_progress: "الدفع قيد التنفيذ",
  authorized: "مصرح بها",
  verification_pending: "بانتظار التحقق",
  payment_review: "تحتاج مراجعة مالية",
  paid: "مدفوع",
  partially_refunded: "مسترد جزئيًا",
  refunded: "مسترد بالكامل",
  failed: "فشل الدفع",
  declined: "مرفوض",
  cancelled: "ملغي",
  canceled: "ملغي",
  voided: "ملغي من البوابة",
};

const PAYMENT_ARABIC: Record<string, string> = {
  tap: "بطاقة عبر Tap",
  tabby: "تابي عبر Tap",
  tamara: "تمارا عبر Tap",
  manual: "دفع يدوي",
  manual_payment: "دفع يدوي",
};

async function authorize(request: Request) {
  const user = await authorizePermission(request, ADMIN_PERMISSIONS.FINANCE_VIEW);
  if (user) return { identity: `user:${user.id}`, user };
  return null;
}

function safeSlug(value: string) {
  return /^[a-z0-9][a-z0-9._-]{0,119}$/i.test(value) ? value : "";
}

function statusArabic(value: string) {
  return STATUS_ARABIC[value] || "حالة غير معروفة";
}

function paymentArabic(value: string) {
  return PAYMENT_ARABIC[value] || "وسيلة أخرى";
}

function groupByOrder<T extends { orderNumber: string | null }>(rows: T[]) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.orderNumber) continue;
    const bucket = grouped.get(row.orderNumber) || [];
    bucket.push(row);
    grouped.set(row.orderNumber, bucket);
  }
  return grouped;
}

function sarDay(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function csvResponse(rows: Array<Record<string, unknown>>) {
  const headings = ["النوع", "رقم الطلب", "التاريخ", "الطالب", "البريد", "الحالة", "وسيلة الدفع", "الجامعة", "المواد", "قبل الخصم", "الخصم", "المحصل", "المسترد", "الصافي", "الضريبة", "العملة", "رقم الفاتورة"];
  const keys = ["typeLabel", "orderNumber", "date", "customerName", "customerEmail", "statusLabel", "paymentLabel", "institutions", "courses", "subtotal", "discount", "gross", "refund", "net", "tax", "currency", "invoiceNumber"];
  const lines = [headings.map(csvCell).join(","), ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(","))];
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="meras-finance-${stamp}.csv"; filename*=UTF-8''%D8%AA%D9%82%D8%B1%D9%8A%D8%B1-%D9%85%D8%B1%D8%A7%D8%B3-${stamp}.csv`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function GET(request: Request) {
  const authorization = await authorize(request);
  if (!authorization) return jsonError("غير مصرح", 403);
  if (!await checkRateLimit("admin-finance-read", authorization.identity, 60, 60)) return jsonError("طلبات مالية كثيرة. حاول بعد دقيقة.", 429);

  const url = new URL(request.url);
  if (url.searchParams.get("format") === "csv") {
    if (!authorization.user || !await hasPermission(authorization.user, ADMIN_PERMISSIONS.FINANCE_EXPORT)) return jsonError("غير مصرح بتصدير البيانات المالية", 403);
    try {
      await requireAdminStepUp(request, authorization.user);
    } catch (error) {
      if (error instanceof AdminMfaError) {
        return Response.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
      }
      throw error;
    }
  }
  const orderNumber = cleanText(url.searchParams.get("order"), 100);
  if (orderNumber && !/^[A-Za-z0-9._:-]{3,100}$/.test(orderNumber)) return jsonError("رقم الطلب غير صالح");
  const db = getDb();
  const [courseCatalog, institutionCatalog] = await Promise.all([getCoursesCatalog(true), getInstitutionsCatalog(true)]);
  const courseBySlug = new Map(courseCatalog.map((course) => [course.slug, course]));

  if (orderNumber) {
    const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
    if (!order) return jsonError("الطلب غير موجود", 404);
    const [items, events, invoiceRows, accessRows, accessEvents, refundRows, creditNoteRows] = await Promise.all([
      db.select().from(orderItems).where(eq(orderItems.orderNumber, orderNumber)).orderBy(asc(orderItems.id)),
      db.select().from(paymentEvents).where(eq(paymentEvents.orderNumber, orderNumber)).orderBy(desc(paymentEvents.receivedAt)),
      db.select().from(invoices).where(eq(invoices.orderNumber, orderNumber)).limit(1),
      db.select().from(courseAccess).where(eq(courseAccess.orderNumber, orderNumber)).orderBy(asc(courseAccess.courseSlug)),
      db.select().from(courseAccessEvents).where(eq(courseAccessEvents.orderNumber, orderNumber)).orderBy(desc(courseAccessEvents.createdAt)),
      db.select().from(refundRequests).where(eq(refundRequests.orderNumber, orderNumber)).orderBy(desc(refundRequests.createdAt)),
      db.select().from(creditNotes).where(eq(creditNotes.orderNumber, orderNumber)).orderBy(desc(creditNotes.issuedAt)),
    ]);
    const resolvedItems = items.length ? items : [{ id: 0, orderNumber, courseSlug: order.courseSlug, unitPrice: order.subtotal, discount: order.discount, total: order.total, accessDurationDays: 90, createdAt: order.createdAt }];
    const financeEvents: FinancePaymentEvent[] = events.map((event) => ({ providerEventId: event.providerEventId, status: event.status, payload: event.payload }));
    const refund = resolveRefundAmount(order, financeEvents);
    const invoice = invoiceRows[0] || null;
    return Response.json({
      ok: true,
      order: {
        ...order,
        statusLabel: statusArabic(order.status),
        paymentLabel: paymentArabic(order.paymentMethod),
        refund,
        net: fromMinorUnits(Math.max(0, toMinorUnits(order.total) - toMinorUnits(refund.amount))),
        items: resolvedItems.map((item) => {
          const course = courseBySlug.get(item.courseSlug);
          return { ...item, title: course?.title || item.courseSlug, institutionSlug: course?.universitySlug || "", institutionName: course?.university || "غير محددة" };
        }),
        invoice,
        access: accessRows.map((access) => ({
          ...access,
          courseTitle: courseBySlug.get(access.courseSlug)?.title || access.courseSlug,
          events: accessEvents.filter((event) => event.courseSlug === access.courseSlug).map((event) => ({ id: event.id, action: event.action, actorEmail: event.actorEmail, reason: event.reason, createdAt: event.createdAt })),
        })),
        paymentEvents: events.map((event) => ({ id: event.id, provider: event.provider, providerEventId: event.providerEventId, chargeId: event.chargeId, status: event.status, receivedAt: event.receivedAt })),
        refundRequests: refundRows.map((row) => ({ id: row.id, requestNumber: row.requestNumber, amount: fromMinorUnits(row.amountMinor), currency: row.currency, status: row.status, reason: row.reason, requestedByEmail: row.requestedByEmail, createdAt: row.createdAt, completedAt: row.completedAt })),
        creditNotes: creditNoteRows.map((row) => ({ id: row.id, creditNoteNumber: row.creditNoteNumber, invoiceNumber: row.invoiceNumber, amount: fromMinorUnits(row.amountMinor), taxAmount: fromMinorUnits(row.taxAmountMinor), currency: row.currency, reason: row.reason, refundRequestNumber: row.refundRequestNumber, issuedAt: row.issuedAt })),
        reviewable: ["payment_review", "verification_pending"].includes(order.status),
      },
    }, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  }

  const [orderRows, itemRows, eventRows, invoiceRows, aiOrderRows] = await Promise.all([
    db.select().from(orders).orderBy(desc(orders.createdAt)),
    db.select().from(orderItems).orderBy(asc(orderItems.id)),
    db.select().from(paymentEvents).orderBy(asc(paymentEvents.receivedAt)),
    db.select().from(invoices),
    db.select().from(aiSubscriptionOrders).orderBy(desc(aiSubscriptionOrders.createdAt)).limit(2_000),
  ]);
  const itemsByOrder = groupByOrder(itemRows);
  const eventsByOrder = groupByOrder(eventRows);
  const invoiceByOrder = new Map(invoiceRows.map((invoice) => [invoice.orderNumber, invoice]));
  const taxByOrder = new Map(invoiceRows.map((invoice) => [invoice.orderNumber, invoice.taxAmount]));
  const { from, to } = financeDateRange(cleanText(url.searchParams.get("from"), 10), cleanText(url.searchParams.get("to"), 10));
  const institution = safeSlug(cleanText(url.searchParams.get("institution"), 120));
  const course = safeSlug(cleanText(url.searchParams.get("course"), 120));
  const paymentMethod = safeSlug(cleanText(url.searchParams.get("paymentMethod"), 40));
  const status = safeSlug(cleanText(url.searchParams.get("status"), 40));
  const search = cleanText(url.searchParams.get("search"), 120).toLocaleLowerCase("ar");

  const orderItemsWithFallback = (order: typeof orderRows[number]) => {
    const items = itemsByOrder.get(order.orderNumber);
    return items?.length ? items : [{ orderNumber: order.orderNumber, courseSlug: order.courseSlug, unitPrice: order.subtotal, discount: order.discount, total: order.total, accessDurationDays: 90 }];
  };
  const filteredOrders = orderRows.filter((order) => {
    const timestamp = Date.parse(order.paidAt || order.createdAt);
    if (from != null && (!Number.isFinite(timestamp) || timestamp < from)) return false;
    if (to != null && (!Number.isFinite(timestamp) || timestamp > to)) return false;
    if (paymentMethod && order.paymentMethod !== paymentMethod) return false;
    if (status && order.status !== status) return false;
    const items = orderItemsWithFallback(order);
    if (course && !items.some((item) => item.courseSlug === course)) return false;
    if (institution && !items.some((item) => courseBySlug.get(item.courseSlug)?.universitySlug === institution)) return false;
    if (search && ![order.orderNumber, order.customerName, order.customerEmail, order.customerPhone || "", order.tapChargeId || ""].some((value) => value.toLocaleLowerCase("ar").includes(search))) return false;
    return true;
  });

  const summaries = filteredOrders.map((order) => {
    const items = orderItemsWithFallback(order);
    const events = eventsByOrder.get(order.orderNumber) || [];
    const refund = resolveRefundAmount(order, events);
    const captured = CAPTURED_ORDER_STATUSES.has(order.status);
    const grossMinor = captured ? toMinorUnits(order.total) : 0;
    const refundMinor = captured ? toMinorUnits(refund.amount) : 0;
    const itemDetails = items.map((item) => {
      const courseEntry = courseBySlug.get(item.courseSlug);
      return { courseSlug: item.courseSlug, title: courseEntry?.title || item.courseSlug, institutionSlug: courseEntry?.universitySlug || "", institutionName: courseEntry?.university || "غير محددة", itemTotal: item.total };
    });
    const institutionItemTotals = new Map<string, number>();
    for (const item of itemDetails) {
      institutionItemTotals.set(item.institutionName, (institutionItemTotals.get(item.institutionName) || 0) + Math.max(0, toMinorUnits(item.itemTotal)));
    }
    const allocationEntries = [...institutionItemTotals];
    const allocationWeight = allocationEntries.reduce((sum, [, itemTotal]) => sum + itemTotal, 0);
    let remainingNetMinor = Math.max(0, grossMinor - refundMinor);
    const allocations = allocationEntries.map(([institutionName, itemTotal], index) => {
      const proposedShare = index === allocationEntries.length - 1
        ? remainingNetMinor
        : allocationWeight > 0
          ? Math.round(Math.max(0, grossMinor - refundMinor) * itemTotal / allocationWeight)
          : Math.round(Math.max(0, grossMinor - refundMinor) / Math.max(1, allocationEntries.length));
      const share = Math.max(0, Math.min(remainingNetMinor, proposedShare));
      remainingNetMinor -= share;
      return { institution: institutionName, net: fromMinorUnits(share) };
    });
    return {
      orderNumber: order.orderNumber,
      date: order.paidAt || order.createdAt,
      createdAt: order.createdAt,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      status: order.status,
      statusLabel: statusArabic(order.status),
      paymentMethod: order.paymentMethod,
      paymentLabel: paymentArabic(order.paymentMethod),
      subtotal: order.subtotal,
      discount: order.discount,
      gross: fromMinorUnits(grossMinor),
      refund: fromMinorUnits(refundMinor),
      refundComplete: refund.complete,
      net: fromMinorUnits(Math.max(0, grossMinor - refundMinor)),
      tax: captured ? invoiceByOrder.get(order.orderNumber)?.taxAmount || 0 : 0,
      currency: order.currency,
      invoiceNumber: invoiceByOrder.get(order.orderNumber)?.invoiceNumber || "",
      institutions: [...new Set(itemDetails.map((item) => item.institutionName))].join("، "),
      institutionAllocations: allocations,
      courses: itemDetails.map((item) => item.title).join("، "),
      itemCount: itemDetails.length,
      lastPaymentEvent: events.at(-1) ? { status: events.at(-1)!.status, receivedAt: events.at(-1)!.receivedAt } : null,
    };
  });
  const aiFiltered = aiOrderRows.filter((order) => {
    if (institution || course) return false;
    const timestamp = Date.parse(order.paidAt || order.createdAt);
    if (from != null && (!Number.isFinite(timestamp) || timestamp < from)) return false;
    if (to != null && (!Number.isFinite(timestamp) || timestamp > to)) return false;
    if (paymentMethod && paymentMethod !== "tap") return false;
    if (status && order.status !== status) return false;
    if (search && ![order.orderNumber, order.customerName, order.customerEmail, order.customerPhone || "", order.tapChargeId || ""].some((value) => value.toLocaleLowerCase("ar").includes(search))) return false;
    return true;
  });
  const aiSummaries = aiFiltered.map((order) => {
    const captured = ["paid", "refunded", "partially_refunded"].includes(order.status);
    const grossMinor = captured ? toMinorUnits(order.amount) : 0;
    const refundMinor = order.status === "refunded" ? grossMinor : 0;
    return {
      type: "ai_subscription" as const,
      typeLabel: "اشتراك أدوات مراس",
      orderNumber: order.orderNumber,
      date: order.paidAt || order.createdAt,
      createdAt: order.createdAt,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      status: order.status,
      statusLabel: statusArabic(order.status),
      paymentMethod: "tap",
      paymentLabel: paymentArabic("tap"),
      subtotal: order.amount,
      discount: 0,
      gross: fromMinorUnits(grossMinor),
      refund: fromMinorUnits(refundMinor),
      refundComplete: true,
      net: fromMinorUnits(Math.max(0, grossMinor - refundMinor)),
      tax: captured ? Math.round((order.amount * 15 / 115) * 100) / 100 : 0,
      currency: order.currency,
      invoiceNumber: "",
      institutions: "أدوات مراس",
      courses: `اشتراك شهري${order.entitlementExpiresAt ? ` حتى ${sarDay(order.entitlementExpiresAt)}` : ""}`,
      itemCount: 1,
      entitlementExpiresAt: order.entitlementExpiresAt,
    };
  });
  const aiPaid = aiSummaries.filter((summary) => summary.gross > 0);
  const aiSubscriptions = {
    orders: aiSummaries.length,
    paidOrders: aiPaid.length,
    gross: fromMinorUnits(aiPaid.reduce((sum, summary) => sum + toMinorUnits(summary.gross), 0)),
    net: fromMinorUnits(aiPaid.reduce((sum, summary) => sum + toMinorUnits(summary.net), 0)),
    rows: aiSummaries.slice(0, 300),
  };
  if (url.searchParams.get("format") === "csv") return csvResponse([...summaries.map((summary) => ({ ...summary, typeLabel: "مادة" })), ...aiSummaries]);

  const metrics = { ...financeMetrics(filteredOrders, new Map([...eventsByOrder].map(([key, events]) => [key, events])), taxByOrder), aiGross: aiSubscriptions.gross, aiNet: aiSubscriptions.net, aiPaidOrders: aiSubscriptions.paidOrders };
  const paymentBreakdown = new Map<string, { method: string; label: string; orders: number; netMinor: number }>();
  const institutionBreakdown = new Map<string, { institution: string; netMinor: number; orders: Set<string> }>();
  const trend = new Map<string, { date: string; grossMinor: number; refundMinor: number; netMinor: number; orders: number }>();
  for (const summary of summaries) {
    if (CAPTURED_ORDER_STATUSES.has(summary.status)) {
      const payment = paymentBreakdown.get(summary.paymentMethod) || { method: summary.paymentMethod, label: summary.paymentLabel, orders: 0, netMinor: 0 };
      payment.orders += 1;
      payment.netMinor += toMinorUnits(summary.net);
      paymentBreakdown.set(summary.paymentMethod, payment);
      for (const allocation of summary.institutionAllocations) {
        const item = institutionBreakdown.get(allocation.institution) || { institution: allocation.institution, netMinor: 0, orders: new Set<string>() };
        item.netMinor += toMinorUnits(allocation.net);
        item.orders.add(summary.orderNumber);
        institutionBreakdown.set(allocation.institution, item);
      }
      const date = sarDay(summary.date);
      if (date) {
        const day = trend.get(date) || { date, grossMinor: 0, refundMinor: 0, netMinor: 0, orders: 0 };
        day.grossMinor += toMinorUnits(summary.gross);
        day.refundMinor += toMinorUnits(summary.refund);
        day.netMinor += toMinorUnits(summary.net);
        day.orders += 1;
        trend.set(date, day);
      }
    }
  }

  const queueItem = (summary: typeof summaries[number]) => ({
    orderNumber: summary.orderNumber,
    customerName: summary.customerName,
    customerEmail: summary.customerEmail,
    total: summary.gross || filteredOrders.find((order) => order.orderNumber === summary.orderNumber)?.total || 0,
    paymentLabel: summary.paymentLabel,
    createdAt: summary.createdAt,
    ageHours: Math.max(0, Math.round((Date.now() - Date.parse(summary.createdAt)) / 3_600_000)),
    lastPaymentEvent: summary.lastPaymentEvent,
  });

  return Response.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    filters: { from: url.searchParams.get("from") || "", to: url.searchParams.get("to") || "", institution, course, paymentMethod, status, search },
    options: {
      institutions: institutionCatalog.map((entry) => ({ slug: entry.slug, name: entry.name })).sort((a, b) => a.name.localeCompare(b.name, "ar")),
      courses: courseCatalog.map((entry) => ({ slug: entry.slug, title: entry.title, institutionSlug: entry.universitySlug })).sort((a, b) => a.title.localeCompare(b.title, "ar")),
      paymentMethods: [...new Set(orderRows.map((order) => order.paymentMethod))].map((method) => ({ method, label: paymentArabic(method) })),
      statuses: [...new Set(orderRows.map((order) => order.status))].map((value) => ({ status: value, label: statusArabic(value) })),
    },
    metrics,
    queue: {
      verificationPending: summaries.filter((summary) => summary.status === "verification_pending").map(queueItem),
      paymentReview: summaries.filter((summary) => summary.status === "payment_review").map(queueItem),
    },
    breakdown: {
      paymentMethods: [...paymentBreakdown.values()].map((item) => ({ method: item.method, label: item.label, orders: item.orders, net: fromMinorUnits(item.netMinor) })).sort((a, b) => b.net - a.net),
      institutions: [...institutionBreakdown.values()].map((item) => ({ institution: item.institution, orders: item.orders.size, net: fromMinorUnits(item.netMinor) })).sort((a, b) => b.net - a.net),
      trend: [...trend.values()].sort((a, b) => a.date.localeCompare(b.date)).map((day) => ({ date: day.date, gross: fromMinorUnits(day.grossMinor), refunds: fromMinorUnits(day.refundMinor), net: fromMinorUnits(day.netMinor), orders: day.orders })),
    },
    orders: summaries,
    aiSubscriptions,
  }, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

export async function POST(request: Request) {
  const authorization = await authorize(request);
  if (!authorization?.user) return jsonError("غير مصرح", 403);
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  if (!await hasPermission(authorization.user, ADMIN_PERMISSIONS.FINANCE_MANAGE)) return jsonError("غير مصرح بتنفيذ العمليات المالية", 403);
  if (!await checkRateLimit("admin-finance-write", authorization.identity, 30, 60)) return jsonError("طلبات مالية كثيرة. حاول بعد دقيقة.", 429);
  try {
    await requireAdminStepUp(request, authorization.user);
  } catch (error) {
    if (error instanceof AdminMfaError) return jsonError(error.message, error.status, error.code);
    throw error;
  }
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات الطلب غير صالحة"); }
  const action = cleanText(payload.action, 40);
  if (action !== "resolvePaymentReview") return jsonError("الإجراء غير مدعوم");
  const orderNumber = cleanText(payload.orderNumber, 100);
  if (!/^[A-Za-z0-9._:-]{3,100}$/.test(orderNumber)) return jsonError("رقم الطلب غير صالح");
  const decision = cleanText(payload.decision, 20);
  if (decision !== "approve") return jsonError("قرار المراجعة غير مدعوم؛ لطلب الاسترداد استخدم نموذج الاسترداد المحكوم.");
  const reason = cleanText(payload.reason, 600);
  if (reason.length < 4) return jsonError("اكتب سبب القرار بوضوح");
  const user = authorization.user;
  const now = new Date().toISOString();
  const db = getDb();
  let notice: { id: number; title: string; body: string; route: string } | null = null;
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${orderNumber}))`);
    const [current] = await tx.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
    if (!current) return { error: "الطلب غير موجود", status: 404 } as const;
    if (!["payment_review", "verification_pending"].includes(current.status)) return { error: `لا يمكن حسم طلب حالته «${statusArabic(current.status)}»`, status: 409 } as const;
    const items = await tx.select({ courseSlug: orderItems.courseSlug, accessDurationDays: orderItems.accessDurationDays }).from(orderItems).where(eq(orderItems.orderNumber, current.orderNumber));
    const purchaseItems = items.length ? items : [{ courseSlug: current.courseSlug, accessDurationDays: 90 }];
    for (const item of [...purchaseItems].sort((left, right) => left.courseSlug.localeCompare(right.courseSlug))) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`access:${current.customerEmail}:${item.courseSlug}`}))`);
    }
    const fulfilled = await fulfillPaidOrderTx(tx, current, purchaseItems, { chargeId: current.tapChargeId, actorEmail: user.email, now, extendDuplicates: true });
    notice = fulfilled.notice;
    await tx.insert(paymentEvents).values({ provider: "admin", providerEventId: `admin-review:${current.orderNumber}:${now}`, orderNumber: current.orderNumber, chargeId: current.tapChargeId, objectType: "order", eventType: "payment_review.approved", amountMinor: current.totalMinor ?? toMinorUnits(current.total), currency: current.currency, signatureVerified: true, processedAt: now, status: "review_approved", payload: JSON.stringify({ decision, reason, actor: user.email, previousStatus: current.status }), receivedAt: now });
    await tx.insert(auditLogs).values({ actorEmail: user.email, action: "resolve", entityType: "order", entityId: current.orderNumber, beforeJson: JSON.stringify({ status: current.status }), afterJson: JSON.stringify({ status: "paid", decision, reason, newlyPaid: fulfilled.newlyPaid }), ipAddress: clientIp(request), createdAt: now });
    return { ok: true as const, previousStatus: current.status, customerEmail: current.customerEmail };
  });
  if ("error" in result) return jsonError(result.error || "تعذر حسم الطلب", result.status || 409);
  const queued = notice as { id: number; title: string; body: string; route: string } | null;
  if (queued) {
    const delivery = await sendPushNotification({ userEmail: result.customerEmail }, queued.title, queued.body, { route: queued.route, notificationId: queued.id });
    const pushStatus = delivery.accepted > 0 ? "accepted" : delivery.attempted === 0 ? "no_devices" : "failed";
    await db.update(notificationsDb).set({ pushStatus, pushAttempts: sql`${notificationsDb.pushAttempts} + 1`, pushLastError: delivery.providerErrors.join(" | ").slice(0, 1000) || null, pushDeliveredAt: delivery.accepted > 0 ? new Date().toISOString() : null }).where(eq(notificationsDb.id, queued.id));
  }
  return Response.json({ ok: true, orderNumber, status: "paid", previousStatus: result.previousStatus }, { headers: { "cache-control": "no-store" } });
}
