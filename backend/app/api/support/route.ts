import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { supportReplies, supportTickets } from "@/db/schema";
import { cleanText, isAdminRequest, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, getSessionUser, sameOriginRequest } from "@/lib/auth";

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  if (!await checkRateLimit("support", clientIp(request), 12, 60 * 60)) return jsonError("تم إرسال طلبات كثيرة. حاول لاحقًا.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات التذكرة غير صالحة"); }
  const category = cleanText(payload.category, 80);
  const priority = cleanText(payload.priority, 80) || "normal";
  const title = cleanText(payload.title, 180);
  const message = cleanText(payload.message, 4000);
  if (!category || !title || message.length < 10) return jsonError("أضف عنوانًا وتفاصيل كافية للمشكلة");
  const ticketNumber = `SP-${Date.now().toString().slice(-8)}`;
  const db = getDb();
  const current = await getSessionUser(request);
  const suppliedEmail = cleanText(payload.userEmail, 180).toLowerCase();
  const [ticket] = await db.insert(supportTickets).values({ ticketNumber, category, priority, title, message, userEmail: current?.email || suppliedEmail || null }).returning({ id: supportTickets.id, ticketNumber: supportTickets.ticketNumber, status: supportTickets.status });
  return Response.json({ ok: true, ticket }, { status: 201 });
}

export async function GET(request: Request) {
  const db = getDb();
  const current = await getSessionUser(request);
  if (current?.role === "admin" || isAdminRequest(request)) {
    const tickets = await db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt)).limit(100);
    return Response.json({ ok: true, tickets }, { headers: { "cache-control": "no-store" } });
  }
  if (!current) return jsonError("سجّل الدخول لمتابعة التذاكر", 401);
  const tickets = await db.select().from(supportTickets).where(eq(supportTickets.userEmail, current.email)).orderBy(desc(supportTickets.createdAt)).limit(100);
  const ids = new Set(tickets.map((ticket) => ticket.id));
  const replies = (await db.select().from(supportReplies).where(eq(supportReplies.internal, false)).orderBy(desc(supportReplies.createdAt)).limit(300)).filter((reply) => ids.has(reply.ticketId));
  return Response.json({ ok: true, tickets: tickets.map((ticket) => ({ ...ticket, replies: replies.filter((reply) => reply.ticketId === ticket.id) })) }, { headers: { "cache-control": "no-store" } });
}
