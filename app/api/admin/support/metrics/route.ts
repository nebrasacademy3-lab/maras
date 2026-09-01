import { desc, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { supportReplies, supportTickets } from "@/db/schema";
import { jsonError } from "@/lib/api";
import { getSessionUser, roleAllowed } from "@/lib/auth";

const responseHours: Record<string, number> = { urgent: 1, high: 4, normal: 12, low: 24 };
const resolutionHours: Record<string, number> = { urgent: 8, high: 24, normal: 48, low: 72 };

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!roleAllowed(user, ["admin"])) return jsonError("غير مصرح بعرض مؤشرات الدعم", 403);
  const tickets = await getDb().select().from(supportTickets).orderBy(desc(supportTickets.createdAt)).limit(2_000);
  const ids = tickets.map((ticket) => ticket.id);
  const replies = ids.length ? await getDb().select().from(supportReplies).where(inArray(supportReplies.ticketId, ids)).orderBy(supportReplies.createdAt).limit(10_000) : [];
  const now = Date.now();
  const rows = tickets.map((ticket) => {
    const created = Date.parse(ticket.createdAt);
    const firstStaffReply = replies.find((reply) => reply.ticketId === ticket.id && reply.authorRole !== "student" && !reply.internal);
    const firstResponseDueAt = new Date(created + (responseHours[ticket.priority] || responseHours.normal) * 3_600_000).toISOString();
    const resolutionDueAt = new Date(created + (resolutionHours[ticket.priority] || resolutionHours.normal) * 3_600_000).toISOString();
    const closed = ["resolved", "closed"].includes(ticket.status);
    const recordedFirstResponse = ticket.firstResponseAt || firstStaffReply?.createdAt || null;
    const responseBreached = !recordedFirstResponse && now > Date.parse(firstResponseDueAt);
    const resolutionBreached = !closed && now > Date.parse(resolutionDueAt);
    return { ...ticket, firstResponseAt: recordedFirstResponse, firstResponseDueAt, resolutionDueAt, responseBreached, resolutionBreached };
  });
  const resolved = rows.filter((row) => ["resolved", "closed"].includes(row.status));
  const responseMinutes = rows.flatMap((row) => row.firstResponseAt ? [(Date.parse(row.firstResponseAt) - Date.parse(row.createdAt)) / 60_000] : []);
  return Response.json({
    ok: true,
    summary: {
      total: rows.length,
      open: rows.length - resolved.length,
      responseBreached: rows.filter((row) => row.responseBreached).length,
      resolutionBreached: rows.filter((row) => row.resolutionBreached).length,
      averageFirstResponseMinutes: responseMinutes.length ? Math.round(responseMinutes.reduce((sum, value) => sum + value, 0) / responseMinutes.length) : null,
      resolved: resolved.length,
      satisfactionAverage: (() => { const ratings = rows.flatMap((row) => row.satisfactionRating ? [row.satisfactionRating] : []); return ratings.length ? Math.round(ratings.reduce((sum, value) => sum + value, 0) / ratings.length * 10) / 10 : null; })(),
    },
    queues: Object.entries(Object.groupBy(rows.filter((row) => !["resolved", "closed"].includes(row.status)), (row) => row.category)).map(([category, queue]) => ({ category, count: queue?.length || 0, overdue: queue?.filter((row) => row.responseBreached || row.resolutionBreached).length || 0 })),
    tickets: rows,
  }, { headers: { "cache-control": "no-store" } });
}
