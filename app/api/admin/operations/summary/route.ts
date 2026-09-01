import { and, count, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { courseAccess, courseBundles, courseRequestFiles, courseWaitlist, notificationsDb, orders, paymentSettlementLines, refundRequests, supportReplyFiles } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { getSessionUser, roleAllowed } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!roleAllowed(user, ["admin"])) return jsonError("غير مصرح بعرض مركز التشغيل", 403);
  const db = getDb();
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 3_600_000).toISOString();
  const inFourteenDays = new Date(now.getTime() + 14 * 86_400_000).toISOString();
  const openOrders = ["pending", "initiated", "in_progress", "authorized", "verification_pending", "payment_review"];
  const [waitlist, bundles, requestScans, supportScans, pendingOrders, expiringAccess, pendingPush, pendingRefunds, unmatchedSettlements] = await Promise.all([
    db.select({ status: courseWaitlist.status, total: count() }).from(courseWaitlist).groupBy(courseWaitlist.status),
    db.select({ status: courseBundles.status, total: count() }).from(courseBundles).groupBy(courseBundles.status),
    db.select({ total: count() }).from(courseRequestFiles).where(eq(courseRequestFiles.scanStatus, "pending")),
    db.select({ total: count() }).from(supportReplyFiles).where(eq(supportReplyFiles.scanStatus, "pending")),
    db.select({ total: count() }).from(orders).where(and(inArray(orders.status, openOrders), lte(orders.createdAt, twoHoursAgo))),
    db.select({ total: count() }).from(courseAccess).where(and(isNull(courseAccess.revokedAt), sql`${courseAccess.expiresAt} IS NOT NULL`, lte(courseAccess.expiresAt, inFourteenDays))),
    db.select({ total: count() }).from(notificationsDb).where(and(eq(notificationsDb.pushEnabled, true), inArray(notificationsDb.pushStatus, ["pending", "failed"]))),
    db.select({ total: count() }).from(refundRequests).where(inArray(refundRequests.status, ["pending", "first_approved", "approved_pending_provider", "provider_pending"])),
    db.select({ total: count() }).from(paymentSettlementLines).where(eq(paymentSettlementLines.status, "unmatched")),
  ]);
  return Response.json({
    ok: true,
    waitlist: Object.fromEntries(waitlist.map((row) => [row.status, Number(row.total)])),
    bundles: Object.fromEntries(bundles.map((row) => [row.status, Number(row.total)])),
    queues: {
      filesPendingScan: Number(requestScans[0]?.total || 0) + Number(supportScans[0]?.total || 0),
      abandonedCheckout: Number(pendingOrders[0]?.total || 0),
      expiringAccess: Number(expiringAccess[0]?.total || 0),
      pushPending: Number(pendingPush[0]?.total || 0),
      refundPending: Number(pendingRefunds[0]?.total || 0),
      settlementUnmatched: Number(unmatchedSettlements[0]?.total || 0),
    },
    generatedAt: now.toISOString(),
  }, { headers: { "cache-control": "no-store" } });
}
