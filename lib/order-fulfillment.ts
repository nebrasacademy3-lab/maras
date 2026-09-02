import { and, eq, ne } from "drizzle-orm";
import type { getDb } from "@/db";
import { analyticsEvents, cartItems, courseAccess, courseAccessEvents, courseWaitlist, invoices, notificationsDb, orders } from "@/db/schema";
import { accessExpiryIso, normalizeAccessDurationDays } from "@/lib/course-access";
import { qualifyReferralForPaidOrderTx } from "@/lib/referrals";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type OrderRow = typeof orders.$inferSelect;

export type FulfillmentItem = { courseSlug: string; accessDurationDays: number | null };
export type FulfillmentNotice = { id: number; title: string; body: string; route: string };

export type FulfillmentOptions = {
  chargeId: string | null;
  actorEmail: string;
  now: string;
  extendDuplicates?: boolean;
};

// Shared "order became paid" transition used by the Tap webhook and by the
// admin payment-review resolution, so both paths grant access, issue the
// invoice, clear the cart/waitlist and notify the student identically.
export async function fulfillPaidOrderTx(tx: Tx, current: OrderRow, purchaseItems: FulfillmentItem[], options: FulfillmentOptions) {
  const { chargeId, actorEmail, now } = options;
  const changed = await tx.update(orders).set({ status: "paid", tapChargeId: chargeId ?? current.tapChargeId, updatedAt: now, paidAt: current.paidAt || now }).where(and(eq(orders.id, current.id), ne(orders.status, "paid"), ne(orders.status, "refunded"))).returning({ id: orders.id });
  const newlyPaid = changed.length > 0;
  const startsAt = current.paidAt || now;

  for (const item of purchaseItems) {
    const durationDays = normalizeAccessDurationDays(item.accessDurationDays);
    const expiresAt = accessExpiryIso(durationDays, new Date(startsAt));
    const [existing] = await tx.select().from(courseAccess).where(and(eq(courseAccess.userEmail, current.customerEmail), eq(courseAccess.courseSlug, item.courseSlug))).limit(1);
    let accessId = existing?.id;
    const activeElsewhere = Boolean(existing && !existing.revokedAt && existing.orderNumber !== current.orderNumber && (!existing.expiresAt || Date.parse(existing.expiresAt) > Date.now()));
    const canRepair = !existing || existing.orderNumber === current.orderNumber || Boolean(existing.revokedAt) || Boolean(existing.expiresAt && Date.parse(existing.expiresAt) <= Date.now());
    if (!existing) {
      const [created] = await tx.insert(courseAccess).values({ userEmail: current.customerEmail, courseSlug: item.courseSlug, source: "tap", orderNumber: current.orderNumber, startsAt, expiresAt, suspendedAt: null, suspensionReason: null, revokedAt: null, revocationReason: null, updatedAt: now }).returning({ id: courseAccess.id });
      accessId = created?.id;
    } else if (canRepair) {
      await tx.update(courseAccess).set({ source: "tap", orderNumber: current.orderNumber, startsAt, expiresAt, suspendedAt: null, suspensionReason: null, revokedAt: null, revocationReason: null, updatedAt: now }).where(eq(courseAccess.id, existing.id));
    } else if (activeElsewhere && options.extendDuplicates) {
      const base = existing!.expiresAt && Date.parse(existing!.expiresAt) > Date.parse(startsAt) ? new Date(existing!.expiresAt) : new Date(startsAt);
      const extendedExpiry = existing!.expiresAt ? accessExpiryIso(durationDays, base) : null;
      await tx.update(courseAccess).set({ expiresAt: extendedExpiry, suspendedAt: null, suspensionReason: null, updatedAt: now }).where(eq(courseAccess.id, existing!.id));
      await tx.insert(courseAccessEvents).values({ eventKey: `order:${current.orderNumber}:extend:${item.courseSlug}`, accessId, userEmail: current.customerEmail, courseSlug: item.courseSlug, action: "purchase_extended", actorEmail, orderNumber: current.orderNumber, beforeJson: JSON.stringify({ expiresAt: existing!.expiresAt, orderNumber: existing!.orderNumber }), afterJson: JSON.stringify({ expiresAt: extendedExpiry, durationDays }), createdAt: now }).onConflictDoNothing({ target: courseAccessEvents.eventKey });
    }
    if (canRepair) await tx.insert(courseAccessEvents).values({ eventKey: `order:${current.orderNumber}:grant:${item.courseSlug}`, accessId, userEmail: current.customerEmail, courseSlug: item.courseSlug, action: newlyPaid ? "purchase_granted" : "purchase_reconciled", actorEmail, orderNumber: current.orderNumber, afterJson: JSON.stringify({ startsAt, expiresAt, durationDays }), createdAt: now }).onConflictDoNothing({ target: courseAccessEvents.eventKey });
  }

  const invoiceTax = Math.round((current.total * 15 / 115) * 100) / 100;
  await tx.insert(invoices).values({
    invoiceNumber: `INV-${current.orderNumber}`,
    orderNumber: current.orderNumber,
    customerEmail: current.customerEmail,
    total: current.total,
    taxAmount: invoiceTax,
    currency: current.currency,
    status: "issued",
    version: 1,
    subtotalMinor: current.subtotalMinor ?? Math.round(current.subtotal * 100),
    discountMinor: current.discountMinor ?? Math.round(current.discount * 100),
    taxAmountMinor: Math.round(invoiceTax * 100),
    totalMinor: current.totalMinor ?? Math.round(current.total * 100),
    snapshotJson: JSON.stringify({ orderNumber: current.orderNumber, customer: { name: current.customerName, email: current.customerEmail, phone: current.customerPhone }, items: purchaseItems, paymentMethod: current.paymentMethod, bundleSlug: current.bundleSlug, issuedAt: startsAt }),
    issuedAt: startsAt,
  }).onConflictDoNothing({ target: invoices.orderNumber });
  for (const item of purchaseItems) {
    await tx.delete(cartItems).where(and(eq(cartItems.userEmail, current.customerEmail), eq(cartItems.courseSlug, item.courseSlug)));
    await tx.update(courseWaitlist).set({ status: "converted", convertedAt: now, updatedAt: now }).where(and(eq(courseWaitlist.userEmail, current.customerEmail), eq(courseWaitlist.courseSlug, item.courseSlug)));
  }
  if (newlyPaid) await tx.insert(analyticsEvents).values({ event: "payment_paid", userEmail: current.customerEmail, courseSlug: purchaseItems[0]?.courseSlug || current.courseSlug, metadataJson: JSON.stringify({ orderNumber: current.orderNumber, method: current.paymentMethod, value: current.total, currency: current.currency }), createdAt: now });
  if (newlyPaid) await qualifyReferralForPaidOrderTx(tx, current.customerEmail, now);
  const title = "تم تفعيل اشتراكك";
  const body = purchaseItems.length > 1 ? `تم تفعيل ${purchaseItems.length} مواد ضمن الطلب ${current.orderNumber}.` : "أصبحت المادة متاحة الآن في مساحة التعلم الخاصة بك.";
  const [notice] = await tx.insert(notificationsDb).values({ userEmail: current.customerEmail, audience: "student", title, body, actionUrl: "/dashboard?view=courses", actionLabel: "ابدأ التعلم", template: "success", dedupeKey: `order:${current.orderNumber}:paid`, pushStatus: "processing", pushClaimedAt: now, createdAt: now }).onConflictDoNothing({ target: notificationsDb.dedupeKey }).returning({ id: notificationsDb.id });
  return { newlyPaid, notice: notice ? { id: notice.id, title, body, route: "/dashboard?view=courses" } as FulfillmentNotice : null };
}
