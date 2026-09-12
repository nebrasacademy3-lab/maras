import { readBoundedJsonObject } from "@/lib/request-body";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { analyticsEvents, courseWaitlist, notificationsDb } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { getCourseCatalog, invalidateCatalogCache } from "@/lib/catalog-store";
import { queueCourseLaunchNotifications } from "@/lib/course-launch-notifications";

function validSlug(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,120}$/.test(value.trim()) ? value.trim() : "";
}

async function courseFromPayload(payload: Record<string, unknown>) {
  const courseSlug = validSlug(payload.courseSlug);
  return { courseSlug, course: courseSlug ? await getCourseCatalog(courseSlug) : null };
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول لإدارة تنبيهات الإطلاق", 401);
  const courseSlug = validSlug(new URL(request.url).searchParams.get("courseSlug"));
  if (!courseSlug) return jsonError("المادة مطلوبة");
  const [row] = await getDb().select({ status: courseWaitlist.status, createdAt: courseWaitlist.createdAt }).from(courseWaitlist).where(and(eq(courseWaitlist.userEmail, user.email), eq(courseWaitlist.courseSlug, courseSlug))).limit(1);
  return Response.json({ ok: true, active: row?.status === "active", status: row?.status || null, createdAt: row?.createdAt || null }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول ليصلك إشعار عند إطلاق المادة", 401);
  if (user.role !== "student") return jsonError("هذه الميزة مخصصة لحساب الطالب",403);
  if (!await checkRateLimit("waitlist-write", `user:${user.id}`, 20, 60)) return jsonError("محاولات كثيرة. حاول بعد دقيقة.", 429);
  let payload: Record<string, unknown>;
  try { payload = await readBoundedJsonObject(request, 32 * 1024); } catch { return jsonError("الطلب غير صالح"); }
  const { courseSlug, course } = await courseFromPayload(payload);
  if (!course) return jsonError("المادة غير موجودة أو غير منشورة", 404);
  if (course.availableForPurchase) return jsonError("المادة متاحة الآن ويمكنك الاشتراك مباشرة", 409);
  const now = new Date().toISOString();
  const source = cleanText(payload.source, 40).replace(/[^a-z0-9_-]/gi, "") || "course_page";
  await getDb().transaction(async (tx) => {
    const changed = await tx.insert(courseWaitlist).values({ userEmail: user.email, courseSlug, source, status: "active", notifiedAt: null, convertedAt: null, createdAt: now, updatedAt: now }).onConflictDoUpdate({
      target: [courseWaitlist.userEmail, courseWaitlist.courseSlug],
      set: { source, status: "active", notifiedAt: null, convertedAt: null, updatedAt: now, activationVersion: sql`${courseWaitlist.activationVersion} + 1` },
      setWhere: ne(courseWaitlist.status, "active"),
    }).returning({ id: courseWaitlist.id });
    if (changed.length) await tx.insert(analyticsEvents).values({ event: "waitlist_join", userEmail: user.email, courseSlug, metadataJson: JSON.stringify({ source }), createdAt: now });
  });
  // Close the race where enrollment opened after the initial catalog read.
  invalidateCatalogCache();
  await queueCourseLaunchNotifications(courseSlug).catch(() => undefined); // durable scheduler retries the saved opt-in
  const [current] = await getDb().select({ status: courseWaitlist.status }).from(courseWaitlist).where(and(eq(courseWaitlist.userEmail, user.email), eq(courseWaitlist.courseSlug, courseSlug))).limit(1);
  return Response.json({ ok: true, active: current?.status === "active", status: current?.status || null, message: current?.status === "notified" ? "فُتح الاشتراك بالفعل وأضفنا إشعارًا إلى حسابك" : "سنعلمك عند فتح الاشتراك في المادة" }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول أولًا", 401);
  if (user.role !== "student") return jsonError("هذه الميزة مخصصة لحساب الطالب",403);
  if (!await checkRateLimit("waitlist-write", `user:${user.id}`, 20, 60)) return jsonError("محاولات كثيرة. حاول بعد دقيقة.", 429);
  let payload: Record<string, unknown>;
  try { payload = await readBoundedJsonObject(request, 32 * 1024); } catch { return jsonError("الطلب غير صالح"); }
  const courseSlug = validSlug(payload.courseSlug);
  if (!courseSlug) return jsonError("المادة مطلوبة");
  const now = new Date().toISOString();
  await getDb().transaction(async tx => {
    const [row] = await tx.select().from(courseWaitlist).where(and(eq(courseWaitlist.userEmail,user.email),eq(courseWaitlist.courseSlug,courseSlug))).limit(1).for("update");
    if (!row || !["active","notified"].includes(row.status)) return;
    await tx.update(courseWaitlist).set({status:"cancelled",updatedAt:now}).where(eq(courseWaitlist.id,row.id));
    await tx.update(notificationsDb).set({pushEnabled:false,pushStatus:"cancelled",expiresAt:now}).where(and(eq(notificationsDb.userEmail,user.email),eq(notificationsDb.dedupeKey,`waitlist:${row.id}:v${row.activationVersion}:launched`),inArray(notificationsDb.pushStatus,["pending","failed"])));
  });
  return Response.json({ ok: true, active: false }, { headers: { "cache-control": "no-store" } });
}
