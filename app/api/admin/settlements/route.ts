import { count, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, orders, paymentEvents, paymentSettlementLines, paymentSettlements } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, sameOriginRequest } from "@/lib/auth";
import { AdminMfaError, requireAdminStepUp } from "@/lib/admin-mfa";
import { ADMIN_PERMISSIONS, authorizePermission } from "@/lib/permissions";
import { confirmedRefundMinorById } from "@/lib/refunds";
import { parseSettlementMinor, resolveSettlementMatch, type SettlementOrder } from "@/lib/settlements";

type LineInput = { providerTransactionId?: unknown; orderNumber?: unknown; chargeId?: unknown; gross?: unknown; refund?: unknown; fee?: unknown; tax?: unknown; net?: unknown };

class SettlementImportConflict extends Error {}

function parseCsvRow(line: string) {
  const cells: string[] = [];
  let value = ""; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { cells.push(value.trim()); value = ""; }
    else value += character;
  }
  cells.push(value.trim());
  if (quoted) throw new Error("unterminated CSV field");
  return cells;
}

function parseCsv(text: string): LineInput[] {
  const rows = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map(parseCsvRow);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const index = (names: string[]) => names.map((name) => headers.indexOf(name)).find((value) => value >= 0) ?? -1;
  const columns = { providerTransactionId: index(["provider_transaction_id", "transaction_id", "charge_id"]), orderNumber: index(["order_number", "merchant_reference"]), chargeId: index(["charge_id"]), gross: index(["gross", "amount"]), refund: index(["refund", "refund_amount", "refunded_amount"]), fee: index(["fee", "fees"]), tax: index(["tax", "vat"]), net: index(["net", "settled_amount"]) };
  return rows.slice(1).map((row) => Object.fromEntries(Object.entries(columns).map(([key, position]) => [key, position >= 0 ? row[position] : ""]))) as LineInput[];
}

function validPeriod(value: string | null) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function tapChargeReference(line: { chargeId: string | null; providerTransactionId: string }) {
  return line.chargeId || (/^chg_[A-Za-z0-9_-]+$/.test(line.providerTransactionId) ? line.providerTransactionId : null);
}

export async function GET(request: Request) {
  if (!await authorizePermission(request, ADMIN_PERMISSIONS.FINANCE_VIEW)) return jsonError("غير مصرح بعرض التسويات", 403);
  const db = getDb();
  const settlements = await db.select().from(paymentSettlements).orderBy(desc(paymentSettlements.createdAt)).limit(200);
  const ids = settlements.map((row) => row.id);
  const lineCounts = ids.length ? await db.select({ settlementId: paymentSettlementLines.settlementId, status: paymentSettlementLines.status, total: count() }).from(paymentSettlementLines).where(inArray(paymentSettlementLines.settlementId, ids)).groupBy(paymentSettlementLines.settlementId, paymentSettlementLines.status) : [];
  return Response.json({ ok: true, settlements: settlements.map((row) => ({ ...row, lines: lineCounts.filter((line) => line.settlementId === row.id).map((line) => ({ status: line.status, count: Number(line.total) })) })) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await authorizePermission(request, ADMIN_PERMISSIONS.FINANCE_MANAGE);
  if (!user) return jsonError("غير مصرح باستيراد التسويات", 403);
  try {
    await requireAdminStepUp(request, user);
  } catch (error) {
    if (error instanceof AdminMfaError) return Response.json({ ok: false, code: error.code, error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
    throw error;
  }
  if (!await checkRateLimit("settlement-import", `user:${user.id}:${clientIp(request)}`, 6, 60 * 60)) return jsonError("محاولات استيراد كثيرة. حاول لاحقًا.", 429);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 5 * 1024 * 1024) return jsonError("ملف التسوية أكبر من المسموح", 413);
  const contentType = request.headers.get("content-type") || "";
  let metadata: Record<string, unknown> = {};
  let lines: LineInput[] = [];
  try {
    if (contentType.includes("text/csv")) {
      const text = await request.text();
      if (text.length > 5 * 1024 * 1024) return jsonError("ملف التسوية أكبر من المسموح", 413);
      lines = parseCsv(text);
      const url = new URL(request.url);
      metadata = { providerSettlementId: url.searchParams.get("id"), currency: url.searchParams.get("currency"), periodStart: url.searchParams.get("from"), periodEnd: url.searchParams.get("to") };
    } else {
      metadata = await request.json() as Record<string, unknown>;
      lines = Array.isArray(metadata.lines) ? metadata.lines as LineInput[] : [];
    }
  } catch { return jsonError("ملف التسوية غير صالح"); }
  if (lines.length > 10_000) return jsonError("يتجاوز كشف التسوية حد 10,000 سطر", 413);
  const providerSettlementId = cleanText(metadata.providerSettlementId, 160);
  const currency = cleanText(metadata.currency, 10).toUpperCase() || "SAR";
  const periodStart = cleanText(metadata.periodStart, 40) || null;
  const periodEnd = cleanText(metadata.periodEnd, 40) || null;
  if (!providerSettlementId || !/^[A-Z]{3}$/.test(currency) || !lines.length) return jsonError("رقم التسوية والعملة والسطور مطلوبة");
  if (!validPeriod(periodStart) || !validPeriod(periodEnd) || (periodStart && periodEnd && periodStart > periodEnd)) return jsonError("فترة التسوية غير صالحة");

  type NormalizedLine = { providerTransactionId: string; orderNumber: string | null; chargeId: string | null; grossMinor: number; refundMinor: number; feeMinor: number; taxMinor: number; netMinor: number };
  const normalized: NormalizedLine[] = [];
  const transactionIds = new Set<string>();
  for (const line of lines) {
    if (!line || typeof line !== "object" || Array.isArray(line)) return jsonError("أحد سطور التسوية غير صالح");
    const providerTransactionId = cleanText(line.providerTransactionId || line.chargeId, 180);
    const orderNumber = cleanText(line.orderNumber, 160) || null;
    const chargeId = cleanText(line.chargeId, 180) || null;
    const grossMinor = parseSettlementMinor(line.gross, currency);
    const refundMinor = parseSettlementMinor(line.refund, currency, { allowBlank: true });
    const feeMinor = parseSettlementMinor(line.fee, currency, { allowBlank: true });
    const taxMinor = parseSettlementMinor(line.tax, currency, { allowBlank: true });
    const netMinor = parseSettlementMinor(line.net, currency, { allowNegative: true });
    if (!/^[A-Za-z0-9._:-]{3,180}$/.test(providerTransactionId) || (orderNumber && !/^[A-Za-z0-9._:-]{3,160}$/.test(orderNumber)) || (chargeId && !/^chg_[A-Za-z0-9_-]+$/.test(chargeId))) return jsonError("أحد معرّفات سطور التسوية غير صالح");
    if (grossMinor == null || refundMinor == null || feeMinor == null || taxMinor == null || netMinor == null || (grossMinor === 0 && refundMinor === 0)) return jsonError("بعض سطور التسوية ناقصة أو تحتوي مبالغ غير صالحة");
    if (transactionIds.has(providerTransactionId)) return jsonError("يتكرر معرّف العملية داخل كشف التسوية", 409);
    transactionIds.add(providerTransactionId);
    normalized.push({ providerTransactionId, orderNumber, chargeId, grossMinor, refundMinor, feeMinor, taxMinor, netMinor });
  }
  const db = getDb();
  const referencedOrderNumbers = [...new Set(normalized.flatMap((line) => line.orderNumber ? [line.orderNumber] : []))];
  const referencedChargeIds = [...new Set(normalized.flatMap((line) => {
    const chargeId = tapChargeReference(line);
    return chargeId ? [chargeId] : [];
  }))];
  const [ordersByNumber, ordersByCharge] = await Promise.all([
    referencedOrderNumbers.length ? db.select().from(orders).where(inArray(orders.orderNumber, referencedOrderNumbers)) : Promise.resolve([]),
    referencedChargeIds.length ? db.select().from(orders).where(inArray(orders.tapChargeId, referencedChargeIds)) : Promise.resolve([]),
  ]);
  const orderRows = [...new Map([...ordersByNumber, ...ordersByCharge].map((order) => [order.id, order])).values()];
  const byNumber = new Map(orderRows.map((order) => [order.orderNumber, order]));
  const byCharge = new Map(orderRows.filter((order) => order.tapChargeId).map((order) => [order.tapChargeId!, order]));
  const matchedOrderNumbers = orderRows.map((order) => order.orderNumber);
  const refundEvents = matchedOrderNumbers.length
    ? await db.select({ orderNumber: paymentEvents.orderNumber, status: paymentEvents.status, payload: paymentEvents.payload }).from(paymentEvents).where(inArray(paymentEvents.orderNumber, matchedOrderNumbers))
    : [];
  const refundEventsByOrder = new Map<string, Array<{ status: string; payload: string | null }>>();
  for (const event of refundEvents) {
    if (!event.orderNumber) continue;
    const events = refundEventsByOrder.get(event.orderNumber) || [];
    events.push({ status: event.status, payload: event.payload });
    refundEventsByOrder.set(event.orderNumber, events);
  }
  const confirmedRefundsByOrder = new Map(orderRows.map((order) => [
    order.orderNumber,
    [...confirmedRefundMinorById(refundEventsByOrder.get(order.orderNumber) || []).values()].reduce((sum, amountMinor) => sum + amountMinor, 0),
  ]));
  const matchedOrders = new Set<number>();
  const resolved = normalized.map((line) => {
    const chargeId = tapChargeReference(line);
    const orderByNumber = line.orderNumber ? byNumber.get(line.orderNumber) as SettlementOrder | undefined : undefined;
    const orderByCharge = chargeId ? byCharge.get(chargeId) as SettlementOrder | undefined : undefined;
    const refundOrder = orderByNumber && orderByCharge && orderByNumber.id !== orderByCharge.id
      ? undefined
      : orderByNumber || orderByCharge;
    const match = resolveSettlementMatch({
      currency,
      orderNumber: line.orderNumber,
      chargeId,
      amounts: line,
      confirmedRefundMinor: refundOrder ? confirmedRefundsByOrder.get(refundOrder.orderNumber) ?? 0 : null,
      orderByNumber,
      orderByCharge,
    });
    if (match.status === "matched" && match.order) {
      if (matchedOrders.has(match.order.id)) return { ...line, order: match.order, status: "duplicate_order" as const };
      matchedOrders.add(match.order.id);
    }
    return { ...line, ...match };
  });
  const grossMinor = normalized.reduce((sum, line) => sum + line.grossMinor, 0);
  const refundMinor = normalized.reduce((sum, line) => sum + line.refundMinor, 0);
  const feeMinor = normalized.reduce((sum, line) => sum + line.feeMinor, 0);
  const taxMinor = normalized.reduce((sum, line) => sum + line.taxMinor, 0);
  const netMinor = normalized.reduce((sum, line) => sum + line.netMinor, 0);
  if (![grossMinor, refundMinor, feeMinor, taxMinor, netMinor].every(Number.isSafeInteger)) return jsonError("إجمالي التسوية أكبر من النطاق المالي الآمن");
  const now = new Date().toISOString();
  const actorEmail = user.email;
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('payment-settlement-import'))`);
      const [alreadyImported] = await tx.select({ providerTransactionId: paymentSettlementLines.providerTransactionId }).from(paymentSettlementLines).where(inArray(paymentSettlementLines.providerTransactionId, [...transactionIds])).limit(1);
      if (alreadyImported) throw new SettlementImportConflict(`عملية Tap ${alreadyImported.providerTransactionId} موجودة في تسوية سابقة`);
      const [settlement] = await tx.insert(paymentSettlements).values({ provider: "tap", providerSettlementId, periodStart, periodEnd, currency, grossMinor, refundMinor, feeMinor, taxMinor, netMinor, status: "imported", importedBy: actorEmail, createdAt: now }).returning();
      let matched = 0;
      const issueCounts: Record<string, number> = {};
      for (const line of resolved) {
        await tx.insert(paymentSettlementLines).values({ settlementId: settlement.id, orderNumber: line.order?.orderNumber || line.orderNumber, providerTransactionId: line.providerTransactionId, grossMinor: line.grossMinor, feeMinor: line.feeMinor, taxMinor: line.taxMinor, netMinor: line.netMinor, status: line.status, createdAt: now });
        if (line.status === "matched" && line.order) {
          matched += 1;
          await tx.update(orders).set({ providerFeeMinor: line.feeMinor, settledNetMinor: line.netMinor, settlementStatus: "reconciled", updatedAt: now }).where(eq(orders.id, line.order.id));
        } else issueCounts[line.status] = (issueCounts[line.status] || 0) + 1;
      }
      const status = matched === resolved.length ? "reconciled" : matched ? "partially_reconciled" : "needs_review";
      await tx.update(paymentSettlements).set({ status, reconciledAt: status === "reconciled" ? now : null }).where(eq(paymentSettlements.id, settlement.id));
      await tx.insert(auditLogs).values({ actorEmail, action: "import", entityType: "payment_settlement", entityId: String(settlement.id), afterJson: JSON.stringify({ providerSettlementId, currency, lines: resolved.length, matched, grossMinor, refundMinor, feeMinor, taxMinor, netMinor, status, issueCounts }), ipAddress: clientIp(request), createdAt: now });
      return { id: settlement.id, status, matched, unmatched: resolved.length - matched, issueCounts };
    });
    return Response.json({ ok: true, settlement: result }, { status: 201 });
  } catch (error) {
    if (error instanceof SettlementImportConflict) return jsonError(error.message, 409);
    const duplicate = error && typeof error === "object" && ((error as { code?: string }).code === "23505" || (error as { cause?: { code?: string } }).cause?.code === "23505");
    return jsonError(duplicate ? "استُوردت هذه التسوية مسبقًا" : "تعذر حفظ التسوية", duplicate ? 409 : 500);
  }
}
