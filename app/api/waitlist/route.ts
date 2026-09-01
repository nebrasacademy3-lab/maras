import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { analyticsEvents, courseWaitlist } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { getCourseCatalog } from "@/lib/catalog-store";

async function courseFromPayload(payload: Record<string, unknown>) {
  const courseSlug = cleanText(payload.courseSlug, 120).replace(/[^A-Za-z0-9_-]/g, "");
  return { courseSlug, course: courseSlug ? await getCourseCatalog(courseSlug) : null };
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول لإدارة تنبيهات الإطلاق", 401);
  const courseSlug = cleanText(new URL(request.url).searchParams.get("courseSlug"), 120).replace(/[^A-Za-z0-9_-]/g, "");
  if (!courseSlug) return jsonError("المادة مطلوبة");
  const [row] = await getDb().select({ status: courseWaitlist.status, createdAt: courseWaitlist.createdAt }).from(courseWaitlist).where(and(eq(courseWaitlist.userEmail, user.email), eq(courseWaitlist.courseSlug, courseSlug))).limit(1);
  return Response.json({ ok: true, active: row?.status === "active", createdAt: row?.createdAt || null }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول ليصلك إشعار عند إطلاق المادة", 401);
  if (!await checkRateLimit("waitlist-write", `user:${user.id}`, 20, 60)) return jsonError("محاولات كثيرة. حاول بعد دقيقة.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("الطلب غير صالح"); }
  const { courseSlug, course } = await courseFromPayload(payload);
  if (!course) return jsonError("المادة غير موجودة أو غير منشورة", 404);
  if (course.availableForPurchase) return jsonError("المادة متاحة الآن ويمكنك الاشتراك مباشرة", 409);
  const now = new Date().toISOString();
  const source = cleanText(payload.source, 40).replace(/[^a-z0-9_-]/gi, "") || "course_page";
  await getDb().transaction(async (tx) => {
    await tx.insert(courseWaitlist).values({ userEmail: user.email, courseSlug, source, status: "active", notifiedAt: null, convertedAt: null, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: [courseWaitlist.userEmail, courseWaitlist.courseSlug], set: { source, status: "active", notifiedAt: null, updatedAt: now } });
    await tx.insert(analyticsEvents).values({ event: "waitlist_join", userEmail: user.email, courseSlug, metadataJson: JSON.stringify({ source }), createdAt: now });
  });
  return Response.json({ ok: true, active: true, message: "سنعلمك فور فتح الاشتراك في المادة" }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول أولًا", 401);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("الطلب غير صالح"); }
  const courseSlug = cleanText(payload.courseSlug, 120).replace(/[^A-Za-z0-9_-]/g, "");
  if (!courseSlug) return jsonError("المادة مطلوبة");
  await getDb().update(courseWaitlist).set({ status: "cancelled", updatedAt: new Date().toISOString() }).where(and(eq(courseWaitlist.userEmail, user.email), eq(courseWaitlist.courseSlug, courseSlug)));
  return Response.json({ ok: true, active: false }, { headers: { "cache-control": "no-store" } });
}
