import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { courseAccess, courseAccessEvents, creditNotes, invoices, orders, paymentEvents, refundRequests } from "@/db/schema";

const TAP_REFUND_FAILURE_STATUSES = new Set([
  "ABANDONED",
  "CANCELED",
  "CANCELLED",
  "DECLINED",
  "FAILED",
  "REJECTED",
  "RESTRICTED",
  "TIMEDOUT",
  "TIMED_OUT",
]);

export const REFUND_RESERVING_STATUSES = new Set([
  "pending",
  "first_approved",
  "approved_pending_provider",
  "provider_processing",
  "provider_pending",
  "provider_failed",
  "completed",
]);

export type RefundProviderRequestStatus = "completed" | "provider_failed" | "provider_pending";

export function majorAmountToMinor(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const scaled = amount * 100;
  const rounded = Math.round(scaled);
  if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > 1e-7) return null;
  return rounded;
}

export function requestedRefundMinor(input: { amountMinor?: unknown; amount?: unknown }) {
  const hasMinor = input.amountMinor !== undefined
    && input.amountMinor !== null
    && String(input.amountMinor).trim() !== "";
  if (!hasMinor) return majorAmountToMinor(input.amount);
  if (typeof input.amountMinor !== "number" && typeof input.amountMinor !== "string") return null;
  const amountMinor = typeof input.amountMinor === "number" ? input.amountMinor : Number(input.amountMinor);
  return Number.isSafeInteger(amountMinor) && amountMinor > 0 ? amountMinor : null;
}

export function tapRefundRequestStatus(status: unknown): RefundProviderRequestStatus {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "REFUNDED") return "completed";
  if (TAP_REFUND_FAILURE_STATUSES.has(normalized)) return "provider_failed";
  // PENDING, ACCEPTED, IN_PROGRESS, and UNKNOWN remain non-retryable until
  // Tap sends a conclusive status. Tap's timeout response is terminal.
  return "provider_pending";
}

export function confirmedRefundMinorById(events: Array<{ status: string; payload: string | null }>) {
  const amounts = new Map<string, number>();
  for (const event of events) {
    if (event.status.toUpperCase() !== "REFUND_REFUNDED" || !event.payload) continue;
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(event.payload) as Record<string, unknown>; } catch { continue; }
    const refundId = String(payload.id || "").trim();
    const amountMinor = majorAmountToMinor(payload.amount);
    if (!refundId.startsWith("re_") || !amountMinor || String(payload.status || "").toUpperCase() !== "REFUNDED") continue;
    amounts.set(refundId, Math.max(amounts.get(refundId) || 0, amountMinor));
  }
  return amounts;
}

function mergeProviderStatus(current: string, incoming: RefundProviderRequestStatus) {
  if (current === "completed" || incoming === "completed") return "completed";
  if (current === "rejected") return current;
  if (current === "provider_failed" || incoming === "provider_failed") return "provider_failed";
  return "provider_pending";
}

export async function reconcileRefundRequest(input: {
  id: number;
  providerRefundId?: string | null;
  status: RefundProviderRequestStatus;
  reviewNote?: string | null;
  completedAt?: string | null;
}) {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`refund:${input.id}`}))`);
    const [current] = await tx.select().from(refundRequests).where(eq(refundRequests.id, input.id)).limit(1);
    if (!current) return { ok: false as const, reason: "missing" as const, request: null };
    if (current.providerRefundId && input.providerRefundId && current.providerRefundId !== input.providerRefundId) {
      return { ok: false as const, reason: "provider_conflict" as const, request: current };
    }
    const status = mergeProviderStatus(current.status, input.status);
    const now = new Date().toISOString();
    const [updated] = await tx.update(refundRequests).set({
      providerRefundId: current.providerRefundId || input.providerRefundId || null,
      status,
      reviewNote: input.reviewNote === undefined ? current.reviewNote : input.reviewNote,
      completedAt: status === "completed" ? current.completedAt || input.completedAt || now : current.completedAt,
      updatedAt: now,
    }).where(eq(refundRequests.id, current.id)).returning();
    return { ok: true as const, reason: null, request: updated };
  });
}

export async function applyConfirmedRefundToOrder(input: { orderNumber: string; chargeId: string }) {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.orderNumber}))`);
    const [current] = await tx.select().from(orders).where(eq(orders.orderNumber, input.orderNumber)).limit(1);
    if (!current) return { ok: false as const, error: "missing_order", status: null };
    if (current.tapChargeId !== input.chargeId || current.currency.toUpperCase() !== "SAR" || !["paid", "partially_refunded", "payment_review", "refunded"].includes(current.status)) {
      return { ok: false as const, error: "invalid_order_state", status: current.status };
    }

    const refundEvents = await tx.select({ status: paymentEvents.status, payload: paymentEvents.payload }).from(paymentEvents).where(eq(paymentEvents.chargeId, input.chargeId));
    const refundedAmountMinor = [...confirmedRefundMinorById(refundEvents).values()].reduce((sum, amountMinor) => sum + amountMinor, 0);
    const currentTotalMinor = current.totalMinor ?? majorAmountToMinor(current.total) ?? 0;
    if (currentTotalMinor <= 0 || refundedAmountMinor <= 0 || refundedAmountMinor > currentTotalMinor) {
      return { ok: false as const, error: "invalid_refund_total", status: current.status };
    }

    const fullyRefunded = refundedAmountMinor >= currentTotalMinor;
    const status = fullyRefunded ? "refunded" : "partially_refunded";
    const newlyFullyRefunded = fullyRefunded && current.status !== "refunded";
    const changed = status !== current.status;
    const now = new Date().toISOString();
    if (changed) await tx.update(orders).set({ status, updatedAt: now }).where(eq(orders.id, current.id));

    if (fullyRefunded) {
      const affected = await tx.select().from(courseAccess).where(sql`${courseAccess.orderNumber} = ${current.orderNumber} AND lower(${courseAccess.userEmail}) = lower(${current.customerEmail})`);
      for (const access of affected) {
        if (!access.revokedAt) await tx.update(courseAccess).set({ revokedAt: now, revocationReason: "payment_refunded", suspendedAt: null, suspensionReason: null, updatedAt: now }).where(eq(courseAccess.id, access.id));
        await tx.insert(courseAccessEvents).values({
          eventKey: `order:${current.orderNumber}:refund:${access.courseSlug}`,
          accessId: access.id,
          userEmail: access.userEmail,
          courseSlug: access.courseSlug,
          action: "refund_revoked",
          actorEmail: "tap-webhook",
          reason: "payment_refunded",
          orderNumber: current.orderNumber,
          beforeJson: JSON.stringify(access),
          afterJson: JSON.stringify({ revokedAt: access.revokedAt || now }),
          createdAt: now,
        }).onConflictDoNothing({ target: courseAccessEvents.eventKey });
      }
    }

    return {
      ok: true as const,
      error: null,
      status,
      changed,
      fullyRefunded,
      newlyFullyRefunded,
      refundedAmountMinor,
      customerEmail: current.customerEmail,
      currency: current.currency,
    };
  });
}

export async function issueCreditNote(input: { orderNumber: string; reference: string; amountMinor: number; reason: string }) {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) return null;
  const normalizedReference = input.reference.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80) || crypto.randomUUID().replace(/-/g, "");
  const creditNoteNumber = `CN-${normalizedReference}`;
  const db = getDb();

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`credit-note:${input.orderNumber}`}))`);
    const [existing] = await tx.select().from(creditNotes).where(eq(creditNotes.creditNoteNumber, creditNoteNumber)).limit(1);
    if (existing) return existing.orderNumber === input.orderNumber && existing.amountMinor === input.amountMinor ? existing : null;

    const [invoice] = await tx.select().from(invoices).where(eq(invoices.orderNumber, input.orderNumber)).limit(1);
    const [order] = await tx.select().from(orders).where(eq(orders.orderNumber, input.orderNumber)).limit(1);
    if (!invoice || !order || invoice.currency.toUpperCase() !== "SAR" || order.currency.toUpperCase() !== "SAR") return null;

    const invoiceTotalMinor = invoice.totalMinor ?? majorAmountToMinor(invoice.total) ?? 0;
    const invoiceTaxMinor = Math.max(0, invoice.taxAmountMinor ?? majorAmountToMinor(invoice.taxAmount) ?? 0);
    if (!Number.isSafeInteger(invoiceTotalMinor) || invoiceTotalMinor <= 0 || input.amountMinor > invoiceTotalMinor) return null;

    const issued = await tx.select({ amountMinor: creditNotes.amountMinor, taxAmountMinor: creditNotes.taxAmountMinor }).from(creditNotes).where(eq(creditNotes.orderNumber, input.orderNumber));
    const issuedAmountMinor = issued.reduce((sum, note) => sum + Math.max(0, note.amountMinor), 0);
    const issuedTaxMinor = issued.reduce((sum, note) => sum + Math.max(0, note.taxAmountMinor), 0);
    const remainingAmountMinor = Math.max(0, invoiceTotalMinor - issuedAmountMinor);
    const remainingTaxMinor = Math.max(0, invoiceTaxMinor - issuedTaxMinor);
    if (input.amountMinor > remainingAmountMinor) return null;

    const proportionalTaxMinor = Math.round(invoiceTaxMinor * input.amountMinor / invoiceTotalMinor);
    const taxAmountMinor = input.amountMinor === remainingAmountMinor
      ? remainingTaxMinor
      : Math.min(remainingTaxMinor, proportionalTaxMinor);
    const issuedAt = new Date().toISOString();
    const [created] = await tx.insert(creditNotes).values({
      creditNoteNumber,
      invoiceNumber: invoice.invoiceNumber,
      orderNumber: input.orderNumber,
      refundRequestNumber: input.reference,
      amountMinor: input.amountMinor,
      taxAmountMinor,
      currency: invoice.currency,
      reason: input.reason,
      snapshotJson: JSON.stringify({
        invoiceNumber: invoice.invoiceNumber,
        orderNumber: input.orderNumber,
        customerEmail: order.customerEmail,
        amountMinor: input.amountMinor,
        taxAmountMinor,
        currency: invoice.currency,
        issuedAt,
      }),
      issuedAt,
    }).onConflictDoNothing({ target: creditNotes.creditNoteNumber }).returning();
    return created || null;
  });
}
