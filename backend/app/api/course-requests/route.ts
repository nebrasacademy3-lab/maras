import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { courseRequestFiles, courseRequests, notificationsDb, supervisorAssignments, users } from "@/db/schema";
import { checkRateLimit, clientIp, getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { cleanText, isAdminRequest, jsonError } from "@/lib/api";
import { getInstitutionCatalog } from "@/lib/catalog-store";
import { sendPushNotification } from "@/lib/push";
import { deleteObject, putObject } from "@/lib/storage";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_BODY_BYTES = 5 * MAX_FILE_BYTES + 2 * 1024 * 1024;
const allowedTypes = new Set(["application/pdf", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png", "image/jpeg"]);

function matchesSignature(type: string, bytes: Uint8Array) {
  if (type === "application/pdf") return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  if (type === "image/png") return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "application/msword" || type === "application/vnd.ms-powerpoint") return bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0 && bytes[4] === 0xa1 && bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1;
  if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || type === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  return false;
}

async function supervisorFor(institutionSlug: string, specialty: string) {
  const db = getDb();
  const assignments = await db.select().from(supervisorAssignments).where(eq(supervisorAssignments.active, true));
  const match = assignments.find((item) => (!item.institutionSlug || item.institutionSlug === institutionSlug) && (!item.specialty || item.specialty === specialty));
  if (match) return match.supervisorId;
  const [staff] = await db.select({ id: users.id }).from(users).where(inArray(users.role, ["supervisor", "admin"])).limit(1);
  return staff?.id || null;
}


export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول لطلب مادة", 401);
  if (!user.profileCompleted || !user.phone || !user.universitySlug || !user.specialty) return jsonError("أكمل ملفك الدراسي أولًا", 409);
  if (!await checkRateLimit("course-request", `user:${user.id}`, 10, 60 * 60)) return jsonError("طلبات كثيرة. حاول بعد ساعة.", 429);
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_TOTAL_BODY_BYTES) return jsonError("حجم الطلب أكبر من المسموح", 413);

  let form: FormData;
  try { form = await request.formData(); } catch { return jsonError("بيانات الطلب غير صالحة"); }
  const courseName = cleanText(form.get("courseName"), 160);
  const courseCode = cleanText(form.get("courseCode"), 40);
  const notes = cleanText(form.get("notes"), 1500);
  if (courseName.length < 3) return jsonError("أدخل اسم المادة بصورة صحيحة");
  const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
  if (files.length > 5) return jsonError("الحد الأقصى 5 ملفات", 413);
  for (const file of files) {
    const type = file.type.toLowerCase();
    if (file.size > MAX_FILE_BYTES) return jsonError(`الملف ${file.name} أكبر من 15 ميجابايت`, 413);
    if (!allowedTypes.has(type)) return jsonError(`نوع الملف ${file.name} غير مدعوم`, 413);
    if (!matchesSignature(type, new Uint8Array(await file.slice(0, 64).arrayBuffer()))) return jsonError(`محتوى الملف ${file.name} لا يطابق نوعه`, 413);
  }

  const institution = await getInstitutionCatalog(user.universitySlug);
  if (!institution) return jsonError("تعذر مطابقة الجامعة");
  const db = getDb();
  const assignedSupervisorId = await supervisorFor(user.universitySlug, user.specialty);
  const now = new Date().toISOString();
  const [row] = await db.insert(courseRequests).values({ userId: user.id, university: institution.name, universitySlug: user.universitySlug, specialty: user.specialty, courseName: courseCode ? `${courseName} (${courseCode})` : courseName, name: user.fullName, phone: user.phone, notes, notify: form.get("notify") !== null, status: assignedSupervisorId ? "assigned" : "new", assignedSupervisorId, attachmentsCount: 0, createdAt: now, updatedAt: now }).returning({ id: courseRequests.id, status: courseRequests.status });
  const uploadedKeys: string[] = [];
  try {
    for (const file of files) {
      const type = file.type.toLowerCase();
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "attachment";
      const objectKey = `course-requests/${user.id}/${row.id}/${crypto.randomUUID()}-${safe}`;
      await putObject(objectKey, file.stream(), type);
      uploadedKeys.push(objectKey);
      await db.insert(courseRequestFiles).values({ requestId: row.id, userId: user.id, objectKey, originalName: file.name.slice(0, 180), contentType: type, sizeBytes: file.size });
    }
    if (files.length) await db.update(courseRequests).set({ attachmentsCount: files.length, updatedAt: new Date().toISOString() }).where(eq(courseRequests.id, row.id));
  } catch {
    await Promise.all(uploadedKeys.map((key) => deleteObject(key).catch(() => undefined)));
    await db.delete(courseRequestFiles).where(eq(courseRequestFiles.requestId, row.id)).catch(() => undefined);
    await db.delete(courseRequests).where(eq(courseRequests.id, row.id)).catch(() => undefined);
    return jsonError("تعذر حفظ مرفقات الطلب", 500);
  }

  const studentTitle = "تم استلام طلب المادة";
  const studentBody = `استلمنا طلب «${courseName}»${files.length ? ` مع ${files.length} مرفقات` : ""}.`;
  await db.insert(notificationsDb).values({ userEmail: user.email, audience: "student", title: studentTitle, body: studentBody, actionUrl: "/dashboard?view=requests", actionLabel: "متابعة الطلب" });
  await sendPushNotification({ userEmail: user.email }, studentTitle, studentBody, { route: "/requests" });
  if (assignedSupervisorId) {
    const [supervisor] = await db.select({ email: users.email }).from(users).where(eq(users.id, assignedSupervisorId)).limit(1);
    if (supervisor) {
      const title = "طلب مادة جديد";
      const body = `${institution.name} · ${user.specialty} · ${courseName}`;
      await db.insert(notificationsDb).values({ userEmail: supervisor.email, audience: "supervisor", title, body, actionUrl: "/supervisor?view=requests", actionLabel: "فتح الطلبات" });
      await sendPushNotification({ userEmail: supervisor.email }, title, body, { route: "/supervisor" });
    }
  }
  return Response.json({ ok: true, request: { ...row, attachmentsCount: files.length } }, { status: 201, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const machineAuthorized = isAdminRequest(request);
  const user = machineAuthorized ? null : await getSessionUser(request);
  if (!machineAuthorized && !roleAllowed(user, ["admin", "supervisor"])) return jsonError("غير مصرح", 401);
  const identity = machineAuthorized ? `machine:${clientIp(request)}` : `user:${user!.id}`;
  if (!await checkRateLimit("course-request-read", identity, 30, 60)) return jsonError("طلبات كثيرة. حاول بعد قليل.", 429);
  const rows = machineAuthorized || user?.role === "admin"
    ? await getDb().select().from(courseRequests).orderBy(desc(courseRequests.createdAt)).limit(100)
    : await getDb().select().from(courseRequests).where(eq(courseRequests.assignedSupervisorId, user!.id)).orderBy(desc(courseRequests.createdAt)).limit(100);
  return Response.json({ ok: true, requests: rows }, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
