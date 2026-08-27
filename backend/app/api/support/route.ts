import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { notificationsDb, supportReplyFiles, supportReplies, supportTickets } from "@/db/schema";
import { cleanText, isAdminRequest, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { deleteObject, putObject } from "@/lib/storage";
import { sendPushNotification } from "@/lib/push";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 5;
const allowedTypes = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain",
  "application/msword", "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

function isManager(user: Awaited<ReturnType<typeof getSessionUser>>) {
  return Boolean(user && (user.role === "admin" || user.role === "supervisor"));
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "attachment";
}

function hasValidSignature(type: string, bytes: Uint8Array) {
  if (type === "application/pdf") return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  if (type === "image/png") return bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/webp") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (type === "text/plain") return true;
  if (type === "application/msword" || type === "application/vnd.ms-powerpoint") return bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  if (type.includes("openxmlformats")) return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  return false;
}

async function uploadFiles(files: File[], ticketId: number, replyId: number) {
  if (files.length > MAX_FILES) throw new Error("الحد الأقصى 5 مرفقات في الرسالة");
  const db = getDb();
  const uploaded: string[] = [];
  try {
    for (const file of files) {
      const type = file.type.toLowerCase();
      if (!allowedTypes.has(type)) throw new Error(`نوع الملف ${file.name} غير مدعوم`);
      if (file.size <= 0 || file.size > MAX_FILE_BYTES) throw new Error(`الملف ${file.name} يجب ألا يتجاوز 15 ميجابايت`);
      if (!hasValidSignature(type, new Uint8Array(await file.slice(0, 64).arrayBuffer()))) throw new Error(`محتوى الملف ${file.name} لا يطابق نوعه`);
      const objectKey = `support/${ticketId}/${crypto.randomUUID()}-${safeName(file.name)}`;
      await putObject(objectKey, file.stream(), type);
      uploaded.push(objectKey);
      await db.insert(supportReplyFiles).values({ replyId, ticketId, objectKey, originalName: file.name.slice(0, 180), contentType: type, sizeBytes: file.size });
    }
  } catch (error) {
    await db.delete(supportReplyFiles).where(eq(supportReplyFiles.replyId, replyId)).catch(() => undefined);
    await Promise.all(uploaded.map((key) => deleteObject(key).catch(() => undefined)));
    throw error;
  }
  return uploaded.length;
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const current = await getSessionUser(request);
  if (!current) return jsonError("سجّل الدخول أولًا للدعم", 401);
  if (!await checkRateLimit("support-write", `${current.id}:${clientIp(request)}`, 30, 60 * 60)) return jsonError("تم إرسال طلبات كثيرة. حاول لاحقًا.", 429);
  const db = getDb();
  const multipart = (request.headers.get("content-type") || "").includes("multipart/form-data");
  let values: Record<string, FormDataEntryValue | unknown> = {};
  let files: File[] = [];
  try {
    if (multipart) {
      const form = await request.formData();
      values = Object.fromEntries(form.entries());
      files = form.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    } else values = await request.json() as Record<string, unknown>;
  } catch { return jsonError("بيانات الدعم غير صالحة"); }

  const ticketId = Math.floor(Number(values.ticketId));
  const body = cleanText(values.message ?? values.body, 4000);
  if (ticketId) {
    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
    if (!ticket) return jsonError("التذكرة غير موجودة", 404);
    if (!isManager(current) && ticket.userEmail !== current.email) return jsonError("غير مصرح", 403);
    if (!body && !files.length) return jsonError("اكتب رسالة أو أرفق ملفًا");
    const internal = isManager(current) && values.internal === true;
    const [reply] = await db.insert(supportReplies).values({ ticketId, authorEmail: current.email, authorRole: current.role, body, internal, createdAt: new Date().toISOString() }).returning({ id: supportReplies.id });
    try { await uploadFiles(files, ticketId, reply.id); } catch (error) { await db.delete(supportReplies).where(eq(supportReplies.id, reply.id)); return jsonError(error instanceof Error ? error.message : "تعذر رفع المرفقات", 413); }
    const nextStatus = !isManager(current) && ["closed", "resolved"].includes(ticket.status) ? "open" : ticket.status;
    await db.update(supportTickets).set({ status: nextStatus, assignedTo: isManager(current) ? current.email : ticket.assignedTo, updatedAt: new Date().toISOString() }).where(eq(supportTickets.id, ticketId));
    if (ticket.userEmail && isManager(current) && !internal) {
      const title = "رد جديد من دعم مراس";
      await db.insert(notificationsDb).values({ userEmail: ticket.userEmail, audience: "student", title, body: body.slice(0, 240) || "أُضيف مرفق جديد إلى تذكرتك", actionUrl: "/support", actionLabel: "فتح المحادثة" });
      await sendPushNotification({ userEmail: ticket.userEmail }, title, body.slice(0, 240) || "أُضيف مرفق جديد إلى تذكرتك", { route: "/support" });
    }
    return Response.json({ ok: true, replyId: reply.id, status: nextStatus }, { headers: { "cache-control": "no-store" } });
  }

  const category = cleanText(values.category, 80);
  const priorityValue = cleanText(values.priority, 80);
  const priority = priorityValue === "عالية" ? "high" : priorityValue.includes("عاجل") ? "urgent" : ["low", "normal", "high", "urgent"].includes(priorityValue) ? priorityValue : "normal";
  const title = cleanText(values.title, 180);
  const contactChannel = ["in_app", "email", "whatsapp"].includes(String(values.contactChannel)) ? String(values.contactChannel) : "in_app";
  if (!category || !title || body.length < 10) return jsonError("أضف عنوانًا وتفاصيل كافية للمشكلة");
  const now = new Date().toISOString();
  const ticketNumber = `SP-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const [ticket] = await db.insert(supportTickets).values({ ticketNumber, category, priority, title, message: body, contactChannel, userEmail: current.email, createdAt: now, updatedAt: now }).returning({ id: supportTickets.id, ticketNumber: supportTickets.ticketNumber, status: supportTickets.status });
  if (files.length) {
    const [initialReply] = await db.insert(supportReplies).values({ ticketId: ticket.id, authorEmail: current.email, authorRole: current.role, body: "", createdAt: now }).returning({ id: supportReplies.id });
    try { await uploadFiles(files, ticket.id, initialReply.id); } catch (error) { await db.delete(supportReplies).where(eq(supportReplies.id, initialReply.id)); await db.delete(supportTickets).where(eq(supportTickets.id, ticket.id)); return jsonError(error instanceof Error ? error.message : "تعذر رفع المرفقات", 413); }
  }
  return Response.json({ ok: true, ticket: { ...ticket, contactChannel } }, { status: 201, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const current = await getSessionUser(request);
  if (!current && !isAdminRequest(request)) return jsonError("سجّل الدخول لمتابعة التذاكر", 401);
  const db = getDb();
  if (current?.role === "admin" || current?.role === "supervisor" || isAdminRequest(request)) {
    const tickets = await db.select().from(supportTickets).orderBy(desc(supportTickets.updatedAt)).limit(300);
    const replies = await db.select().from(supportReplies).orderBy(desc(supportReplies.createdAt)).limit(1000);
    const files = await db.select().from(supportReplyFiles).limit(2000);
    return Response.json({ ok: true, tickets: tickets.map((ticket) => ({ ...ticket, replies: replies.filter((reply) => reply.ticketId === ticket.id).map((reply) => ({ ...reply, files: files.filter((file) => file.replyId === reply.id).map((file) => ({ id: file.id, originalName: file.originalName, contentType: file.contentType, sizeBytes: file.sizeBytes, createdAt: file.createdAt })) })) })) }, { headers: { "cache-control": "no-store" } });
  }
  if (!current) return jsonError("سجّل الدخول لمتابعة التذاكر", 401);
  const tickets = await db.select().from(supportTickets).where(eq(supportTickets.userEmail, current.email)).orderBy(desc(supportTickets.updatedAt)).limit(100);
  const ids = new Set(tickets.map((ticket) => ticket.id));
  const replies = (await db.select().from(supportReplies).where(eq(supportReplies.internal, false)).orderBy(desc(supportReplies.createdAt)).limit(600)).filter((reply) => ids.has(reply.ticketId));
  const files = await db.select().from(supportReplyFiles).limit(1200);
  return Response.json({ ok: true, tickets: tickets.map((ticket) => ({ ...ticket, replies: replies.filter((reply) => reply.ticketId === ticket.id).map((reply) => ({ ...reply, files: files.filter((file) => file.replyId === reply.id).map((file) => ({ id: file.id, originalName: file.originalName, contentType: file.contentType, sizeBytes: file.sizeBytes, createdAt: file.createdAt })) })) })) }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const current = await getSessionUser(request);
  if (!current) return jsonError("سجّل الدخول أولًا", 401);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات غير صالحة"); }
  const ticketId = Math.floor(Number(payload.ticketId));
  const action = cleanText(payload.action, 20);
  if (!ticketId || !["reopen", "close"].includes(action)) return jsonError("إجراء التذكرة غير صالح");
  const db = getDb();
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
  if (!ticket) return jsonError("التذكرة غير موجودة", 404);
  if (!isManager(current) && ticket.userEmail !== current.email) return jsonError("غير مصرح", 403);
  if (action === "close" && !isManager(current)) return jsonError("إغلاق التذكرة من صلاحية المشرف", 403);
  const status = action === "close" ? "closed" : "open";
  const now = new Date().toISOString();
  await db.update(supportTickets).set({ status, updatedAt: now, assignedTo: isManager(current) ? current.email : ticket.assignedTo }).where(eq(supportTickets.id, ticketId));
  if (ticket.userEmail && isManager(current)) {
    const title = status === "closed" ? "أُغلقت تذكرة الدعم" : "أُعيد فتح تذكرة الدعم";
    const body = `${ticket.ticketNumber}: ${status === "closed" ? "تم إنهاء المحادثة ويمكنك إعادة فتحها عند الحاجة." : "أصبحت المحادثة مفتوحة من جديد."}`;
    await db.insert(notificationsDb).values({ userEmail: ticket.userEmail, audience: "student", title, body, actionUrl: "/support", actionLabel: "فتح المحادثة" });
    await sendPushNotification({ userEmail: ticket.userEmail }, title, body, { route: "/support" });
  }
  return Response.json({ ok: true, status }, { headers: { "cache-control": "no-store" } });
}
