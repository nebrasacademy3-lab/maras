import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { courseRequestFiles, courseRequests, notificationsDb, supervisorAssignments, users } from "@/db/schema";
import { checkRateLimit, clientIp, getSessionUser, roleAllowed, sameOriginRequest } from "@/lib/auth";
import { cleanText, isAdminRequest, jsonError } from "@/lib/api";
import { getInstitutionCatalog } from "@/lib/catalog-store";
import { sendPushNotification } from "@/lib/push";
import { deleteStoredMultipartFiles, parseStoredMultipart } from "@/lib/multipart-upload";

const MAX_TOTAL_FILE_BYTES = 100 * 1024 * 1024;
const MAX_FILE_BYTES = MAX_TOTAL_FILE_BYTES;
const MAX_TOTAL_BODY_BYTES = 120 * 1024 * 1024;
const MAX_FILES = 100;
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
  if (!user.profileCompleted || !user.phone || !user.universitySlug || !user.specialty || !user.academicLevel) return jsonError("أكمل ملفك الدراسي ومستواك أولًا", 409);
  if (!await checkRateLimit("course-request", `user:${user.id}`, 10, 60 * 60)) return jsonError("طلبات كثيرة. حاول بعد ساعة.", 429);
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_TOTAL_BODY_BYTES) return jsonError("حجم الطلب أكبر من المسموح", 413);

  let parsed: Awaited<ReturnType<typeof parseStoredMultipart>>;
  try {
    parsed = await parseStoredMultipart(request, {
      fieldName: "files",
      maxFiles: MAX_FILES,
      maxFileBytes: MAX_FILE_BYTES,
      maxTotalBytes: MAX_TOTAL_FILE_BYTES,
      objectPrefix: `course-requests/${user.id}/staged`,
      allowedTypes,
      validSignature: matchesSignature,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "بيانات الطلب غير صالحة", 413);
  }
  const { fields, files } = parsed;
  const discardFiles = () => deleteStoredMultipartFiles(files);
  const courseName = cleanText(fields.courseName, 160);
  const courseCode = cleanText(fields.courseCode, 40);
  const notes = cleanText(fields.notes, 1500);
  if (courseName.length < 3) { await discardFiles(); return jsonError("أدخل اسم المادة بصورة صحيحة"); }

  const institution = await getInstitutionCatalog(user.universitySlug);
  if (!institution) { await discardFiles(); return jsonError("تعذر مطابقة الجامعة"); }
  const db = getDb();
  let assignedSupervisorId: number | null;
  try { assignedSupervisorId = await supervisorFor(user.universitySlug, user.specialty); }
  catch { await discardFiles(); return jsonError("تعذر إسناد الطلب حاليًا", 503); }
  const now = new Date().toISOString();
  let row: { id: number; status: string };
  try {
    row = await db.transaction(async (tx) => {
      const [created] = await tx.insert(courseRequests).values({ userId: user.id, university: institution.name, universitySlug: user.universitySlug!, specialty: user.specialty!, courseName: courseCode ? `${courseName} (${courseCode})` : courseName, name: user.fullName, phone: user.phone!, notes, notify: fields.notify !== undefined, status: assignedSupervisorId ? "assigned" : "new", assignedSupervisorId, attachmentsCount: files.length, createdAt: now, updatedAt: now }).returning({ id: courseRequests.id, status: courseRequests.status });
      if (files.length) await tx.insert(courseRequestFiles).values(files.map((file) => ({ requestId: created.id, userId: user.id, objectKey: file.objectKey, originalName: file.originalName, contentType: file.contentType, sizeBytes: file.sizeBytes })));
      return created;
    });
  } catch {
    await discardFiles();
    return jsonError("تعذر حفظ مرفقات الطلب", 500);
  }

  const studentTitle = "تم استلام طلب المادة";
  const studentBody = `استلمنا طلب «${courseName}»${files.length ? ` مع ${files.length} مرفقات` : ""}.`;
  await db.insert(notificationsDb).values({ userEmail: user.email, audience: "student", title: studentTitle, body: studentBody, actionUrl: "/dashboard?view=requests", actionLabel: "متابعة الطلب" }).catch(() => undefined);
  await sendPushNotification({ userEmail: user.email }, studentTitle, studentBody, { route: "/requests" });
  if (assignedSupervisorId) {
    try {
      const [supervisor] = await db.select({ email: users.email }).from(users).where(eq(users.id, assignedSupervisorId)).limit(1);
      if (supervisor) {
        const title = "طلب مادة جديد";
        const body = `${institution.name} · ${user.specialty} · ${courseName}`;
        await db.insert(notificationsDb).values({ userEmail: supervisor.email, audience: "supervisor", title, body, actionUrl: "/supervisor?view=requests", actionLabel: "فتح الطلبات" }).catch(() => undefined);
        await sendPushNotification({ userEmail: supervisor.email }, title, body, { route: "/supervisor" });
      }
    } catch { /* The saved request remains available in the supervisor workspace. */ }
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
