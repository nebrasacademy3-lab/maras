import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { courseAccess, courseReviews, lessonProgress, users } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { activeCourseAccessWhere } from "@/lib/course-access";
import { getCourseCatalog } from "@/lib/catalog-store";

function displayName(value: string) {
  const parts = value.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts.at(-1)?.[0] || ""}.` : parts[0] || "طالب مراس";
}

export async function GET(request: Request) {
  const courseSlug = cleanText(new URL(request.url).searchParams.get("course"), 80);
  const db = getDb();
  const rows = courseSlug
    ? await db.select().from(courseReviews).where(and(eq(courseReviews.courseSlug, courseSlug), eq(courseReviews.status, "published"))).orderBy(desc(courseReviews.createdAt)).limit(60)
    : await db.select().from(courseReviews).where(eq(courseReviews.status, "published")).orderBy(desc(courseReviews.createdAt)).limit(100);
  const names = rows.length ? await db.select({ email: users.email, fullName: users.fullName, universitySlug: users.universitySlug, specialty: users.specialty }).from(users) : [];
  const byEmail = new Map(names.map((row) => [row.email, row]));
  return Response.json({ ok: true, reviews: rows.map((row) => ({ id: row.id, courseSlug: row.courseSlug, rating: row.rating, body: row.body, createdAt: row.createdAt, author: displayName(byEmail.get(row.userEmail)?.fullName || "طالب مراس"), specialty: byEmail.get(row.userEmail)?.specialty || "طالب جامعي", verifiedPurchase: true })) }, { headers: { "cache-control": "public, max-age=120, stale-while-revalidate=600" } });
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول لكتابة تقييم", 401);
  if (!await checkRateLimit("review", user.email, 8, 60 * 60)) return jsonError("محاولات كثيرة. حاول لاحقًا.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات التقييم غير صالحة"); }
  const courseSlug = cleanText(payload.courseSlug, 80);
  const rating = Math.floor(Number(payload.rating));
  const body = cleanText(payload.body, 1200);
  if (!await getCourseCatalog(courseSlug) || rating < 1 || rating > 5 || body.length < 10) return jsonError("اختر تقييمًا من 1 إلى 5 واكتب رأيًا مفيدًا");
  const db = getDb();
  const now = new Date().toISOString();
  const [access] = await db.select().from(courseAccess).where(activeCourseAccessWhere(user.email, courseSlug, now)).limit(1);
  if (!access) return jsonError("يمكن تقييم المادة بعد شرائها", 403);
  const [progress] = await db.select({ id: lessonProgress.id }).from(lessonProgress).where(and(eq(lessonProgress.userEmail, user.email), eq(lessonProgress.courseSlug, courseSlug))).limit(1);
  if (!progress) return jsonError("ابدأ مشاهدة المادة قبل كتابة تقييم", 403);
  await db.insert(courseReviews).values({ userEmail: user.email, courseSlug, rating, body, status: "pending", createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: [courseReviews.userEmail, courseReviews.courseSlug], set: { rating, body, status: "pending", updatedAt: now } });
  return Response.json({ ok: true, message: "وصل تقييمك للمراجعة وسيظهر بعد اعتماده" }, { status: 201 });
}
