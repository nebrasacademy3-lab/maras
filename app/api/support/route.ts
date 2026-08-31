import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, supportReplyFiles, supportReplies, supportTickets } from "@/db/schema";
import { cleanText, isAdminRequest, jsonError } from "@/lib/api";
import { checkRateLimit, clientIp, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { deleteObject } from "@/lib/storage";
import { deleteStoredMultipartFiles, parseStoredMultipart, type StoredMultipartFile } from "@/lib/multipart-upload";
import { createAndSendNotification } from "@/lib/notifications";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 8;
const allowedTypes = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain",
  "application/msword", "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac", "audio/mpeg", "audio/webm", "audio/3gpp",
]);

function isManager(user: Awaited<ReturnType<typeof getSessionUser>>) {
  return Boolean(user && (user.role === "admin" || user.role === "supervisor"));
}

function hasValidSignature(type: string, bytes: Uint8Array) {
  if (type === "application/pdf") return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  if (type === "image/png") return bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/webp") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (type === "text/plain") return true;
  if (type === "application/msword" || type === "application/vnd.ms-powerpoint") return bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  if (type.includes("openxmlformats")) return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (["audio/mp4", "audio/m4a", "audio/x-m4a", "audio/3gpp"].includes(type)) return bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  if (type === "audio/webm") return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (type === "audio/mpeg") return bytes.length >= 3 && (String.fromCharCode(...bytes.slice(0, 3)) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
  if (type === "audio/aac") return bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0;
  return false;
}

type ReplyRow = typeof supportReplies.$inferSelect;
type FileRow = typeof supportReplyFiles.$inferSelect;
type TicketRow = typeof supportTickets.$inferSelect;

function normalizedReplies(ticket: TicketRow, sourceReplies: ReplyRow[], sourceFiles: FileRow[]) {
  const rows = sourceReplies.filter((reply) => reply.ticketId === ticket.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
  const filesFor = (replyId: number) => sourceFiles.filter((file) => file.replyId === replyId).map((file) => ({
    id: file.id,
    originalName: file.originalName,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    createdAt: file.createdAt,
  }));

  // New conversations persist their first message as a real reply. For legacy
  // conversations, merge the old "ticket.message" with the attachment-only
  // reply created at the same time, or synthesize a read-only first message.
  const firstStudent = rows.find((reply) => reply.authorRole === "student" && !reply.internal);
  const firstIsInitial = Boolean(firstStudent && firstStudent.body.trim() === ticket.message.trim());
  if (!firstIsInitial) {
    const attachmentOnlyInitial = rows.find((reply) => reply.authorRole === "student" && !reply.internal && !reply.body.trim() && Math.abs(new Date(reply.createdAt).getTime() - new Date(ticket.createdAt).getTime()) < 10_000);
    if (attachmentOnlyInitial) {
      return rows.map((reply) => ({
        ...reply,
        body: reply.id === attachmentOnlyInitial.id ? ticket.message : reply.body,
        files: filesFor(reply.id),
      }));
    }
    return [{
      id: -ticket.id,
      ticketId: ticket.id,
      authorEmail: ticket.userEmail || "",
      authorRole: "student",
      body: ticket.message,
      internal: false,
      replyToId: null,
      createdAt: ticket.createdAt,
      files: [],
    }, ...rows.map((reply) => ({ ...reply, files: filesFor(reply.id) }))];
  }
  return rows.map((reply) => ({ ...reply, files: filesFor(reply.id) }));
}

async function notifySupportTeam(ticket: TicketRow, body: string) {
  const title = `دعم: ${ticket.title}`;
  const text = body.slice(0, 240) || "أرسل الطالب مرفقًا جديدًا";
  await Promise.all([
    createAndSendNotification({
      values: { audience: "admin", title, body: text, actionUrl: "/admin", actionLabel: "فتح الدعم" },
      target: { audience: "admin" },
      data: { route: "/admin" },
    }),
    createAndSendNotification({
      values: { audience: "supervisor", title, body: text, actionUrl: "/supervisor", actionLabel: "فتح الدعم" },
      target: { audience: "supervisor" },
      data: { route: "/supervisor" },
    }),
  ]);
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const current = await getSessionUser(request);
  if (!current) return jsonError("سجّل الدخول أولًا للدعم", 401);
  if (!await checkRateLimit("support-write", `${current.id}:${clientIp(request)}`, 60, 60 * 60)) return jsonError("تم إرسال طلبات كثيرة. حاول لاحقًا.", 429);
  const db = getDb();
  const multipart = (request.headers.get("content-type") || "").includes("multipart/form-data");
  let values: Record<string, unknown> = {};
  let files: StoredMultipartFile[] = [];
  try {
    if (multipart) {
      const parsed = await parseStoredMultipart(request, {
        fieldName: "files",
        maxFiles: MAX_FILES,
        maxFileBytes: MAX_FILE_BYTES,
        maxTotalBytes: MAX_FILES * MAX_FILE_BYTES,
        objectPrefix: `support/${current.id}/staged`,
        allowedTypes,
        validSignature: hasValidSignature,
      });
      values = parsed.fields;
      files = parsed.files;
    } else values = await request.json() as Record<string, unknown>;
  } catch (error) { return jsonError(error instanceof Error ? error.message : "بيانات الدعم غير صالحة", multipart ? 413 : 400); }
  const discardFiles = () => deleteStoredMultipartFiles(files);

  const ticketId = Math.floor(Number(values.ticketId));
  const body = cleanText(values.message ?? values.body, 4000);
  if (ticketId) {
    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
    if (!ticket) { await discardFiles(); return jsonError("التذكرة غير موجودة", 404); }
    if (!isManager(current) && ticket.userEmail !== current.email) { await discardFiles(); return jsonError("غير مصرح", 403); }
    if (!body && !files.length) { await discardFiles(); return jsonError("اكتب رسالة أو أرفق ملفًا"); }
    const internal = isManager(current) && (values.internal === true || values.internal === "true");
    const requestedReplyToId = Math.floor(Number(values.replyToId));
    let replyToId: number | null = null;
    if (requestedReplyToId > 0) {
      const [target] = await db.select({ id: supportReplies.id, ticketId: supportReplies.ticketId, internal: supportReplies.internal }).from(supportReplies).where(eq(supportReplies.id, requestedReplyToId)).limit(1);
      if (!target || target.ticketId !== ticketId || (!isManager(current) && target.internal)) { await discardFiles(); return jsonError("الرسالة التي تريد الرد عليها غير متاحة", 400); }
      replyToId = target.id;
    }
    const nextStatus = !isManager(current) && ["closed", "resolved"].includes(ticket.status) ? "open" : ticket.status;
    let replyId = 0;
    const now = new Date().toISOString();
    try {
      replyId = await db.transaction(async (tx) => {
        const [reply] = await tx.insert(supportReplies).values({ ticketId, authorEmail: current.email, authorRole: current.role, body, internal, replyToId, createdAt: now }).returning({ id: supportReplies.id });
        if (files.length) await tx.insert(supportReplyFiles).values(files.map((file) => ({ replyId: reply.id, ticketId, objectKey: file.objectKey, originalName: file.originalName, contentType: file.contentType, sizeBytes: file.sizeBytes, createdAt: now })));
        await tx.update(supportTickets).set({ status: nextStatus, assignedTo: isManager(current) ? current.email : ticket.assignedTo, updatedAt: now }).where(eq(supportTickets.id, ticketId));
        return reply.id;
      });
    } catch {
      await discardFiles();
      return jsonError("تعذر حفظ رسالة الدعم أو مرفقاتها", 500);
    }
    if (ticket.userEmail && isManager(current) && !internal) {
      const title = "رد جديد من دعم مراس";
      const text = body.slice(0, 240) || (files.some((file) => file.contentType.startsWith("audio/")) ? "أرسل فريق مراس رسالة صوتية" : "أُضيف مرفق جديد إلى تذكرتك");
      await createAndSendNotification({
        values: { userEmail: ticket.userEmail, audience: "student", title, body: text, actionUrl: "/support", actionLabel: "فتح المحادثة" },
        target: { userEmail: ticket.userEmail },
        data: { route: "/support", ticketId },
      });
    } else if (!isManager(current)) {
      await notifySupportTeam(ticket, body || (files.some((file) => file.contentType.startsWith("audio/")) ? "رسالة صوتية" : "مرفق جديد"));
    }
    return Response.json({ ok: true, replyId, status: nextStatus }, { headers: { "cache-control": "no-store" } });
  }

  const category = cleanText(values.category, 80);
  const priorityValue = cleanText(values.priority, 80);
  const priority = priorityValue === "عالية" ? "high" : priorityValue.includes("عاجل") ? "urgent" : ["low", "normal", "high", "urgent"].includes(priorityValue) ? priorityValue : "normal";
  const title = cleanText(values.title, 180);
  const contactChannel = ["in_app", "email", "whatsapp"].includes(String(values.contactChannel)) ? String(values.contactChannel) : "in_app";
  if (!category || title.length < 3 || (!body && !files.length) || (body && body.length < 3)) { await discardFiles(); return jsonError("أضف عنوانًا ورسالة أو مرفقًا للمحادثة"); }
  const now = new Date().toISOString();
  const ticketNumber = `SP-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  let ticket: { id: number; ticketNumber: string; status: string };
  try {
    ticket = await db.transaction(async (tx) => {
      const [created] = await tx.insert(supportTickets).values({ ticketNumber, category, priority, title, message: body || "مرفق", contactChannel, userEmail: current.email, createdAt: now, updatedAt: now }).returning({ id: supportTickets.id, ticketNumber: supportTickets.ticketNumber, status: supportTickets.status });
      const [initialReply] = await tx.insert(supportReplies).values({ ticketId: created.id, authorEmail: current.email, authorRole: current.role, body, createdAt: now }).returning({ id: supportReplies.id });
      if (files.length) await tx.insert(supportReplyFiles).values(files.map((file) => ({ replyId: initialReply.id, ticketId: created.id, objectKey: file.objectKey, originalName: file.originalName, contentType: file.contentType, sizeBytes: file.sizeBytes, createdAt: now })));
      return created;
    });
  } catch {
    await discardFiles();
    return jsonError("تعذر فتح المحادثة أو حفظ المرفقات", 500);
  }
  const [fullTicket] = await db.select().from(supportTickets).where(eq(supportTickets.id, ticket.id)).limit(1);
  if (fullTicket) await notifySupportTeam(fullTicket, body || "مرفق جديد");
  return Response.json({ ok: true, ticket: { ...ticket, contactChannel } }, { status: 201, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const current = await getSessionUser(request);
  if (!current && !isAdminRequest(request)) return jsonError("سجّل الدخول لمتابعة التذاكر", 401);
  const db = getDb();
  const manager = current?.role === "admin" || current?.role === "supervisor" || isAdminRequest(request);
  const tickets = manager
    ? await db.select().from(supportTickets).orderBy(desc(supportTickets.updatedAt)).limit(300)
    : current
      ? await db.select().from(supportTickets).where(eq(supportTickets.userEmail, current.email)).orderBy(desc(supportTickets.updatedAt)).limit(100)
      : [];
  const ids = new Set(tickets.map((ticket) => ticket.id));
  const allReplies = manager
    ? await db.select().from(supportReplies).orderBy(asc(supportReplies.createdAt), asc(supportReplies.id)).limit(3000)
    : (await db.select().from(supportReplies).where(eq(supportReplies.internal, false)).orderBy(asc(supportReplies.createdAt), asc(supportReplies.id)).limit(2000)).filter((reply) => ids.has(reply.ticketId));
  const replies = allReplies.filter((reply) => ids.has(reply.ticketId));
  const files = (await db.select().from(supportReplyFiles).orderBy(asc(supportReplyFiles.createdAt), asc(supportReplyFiles.id)).limit(5000)).filter((file) => ids.has(file.ticketId));
  return Response.json({ ok: true, tickets: tickets.map((ticket) => ({ ...ticket, replies: normalizedReplies(ticket, replies, files) })) }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const current = await getSessionUser(request);
  const machineAuthorized = isAdminRequest(request);
  if (!machineAuthorized && !isManager(current)) return jsonError("غير مصرح بحذف التذاكر", 403);
  const actor = current?.email || "admin-api-token";
  if (!await checkRateLimit("support-delete", `${actor}:${clientIp(request)}`, 10, 60 * 60)) return jsonError("طلبات حذف كثيرة. حاول لاحقًا.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات غير صالحة"); }
  const ticketId = Math.floor(Number(payload.ticketId));
  if (!ticketId) return jsonError("معرّف التذكرة غير صالح");
  const db = getDb();
  const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
  if (!ticket) return jsonError("التذكرة غير موجودة", 404);
  const files = await db.select({ objectKey: supportReplyFiles.objectKey }).from(supportReplyFiles).where(eq(supportReplyFiles.ticketId, ticketId));
  await db.transaction(async (tx) => {
    await tx.delete(supportReplyFiles).where(eq(supportReplyFiles.ticketId, ticketId));
    await tx.delete(supportReplies).where(eq(supportReplies.ticketId, ticketId));
    await tx.delete(supportTickets).where(eq(supportTickets.id, ticketId));
    await tx.insert(auditLogs).values({ actorEmail: actor, action: "delete", entityType: "support_ticket", entityId: String(ticketId), beforeJson: JSON.stringify({ ticketNumber: ticket.ticketNumber, userEmail: ticket.userEmail, title: ticket.title }), afterJson: null, ipAddress: clientIp(request) });
  });
  await Promise.all(files.map((file) => deleteObject(file.objectKey).catch(() => undefined)));
  return Response.json({ ok: true, deleted: true }, { headers: { "cache-control": "no-store" } });
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
    await createAndSendNotification({
      values: { userEmail: ticket.userEmail, audience: "student", title, body, actionUrl: "/support", actionLabel: "فتح المحادثة" },
      target: { userEmail: ticket.userEmail },
      data: { route: "/support", ticketId },
    });
  }
  return Response.json({ ok: true, status }, { headers: { "cache-control": "no-store" } });
}
