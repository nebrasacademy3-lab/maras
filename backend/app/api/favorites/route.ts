import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { favorites } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { getSessionUser, sameOriginRequest } from "@/lib/auth";
import { getCourseCatalog, getCoursesCatalog } from "@/lib/catalog-store";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  const rows = await getDb().select().from(favorites).where(eq(favorites.userEmail, user.email));
  const available = new Set((await getCoursesCatalog()).map((course) => course.slug));
  return Response.json({ ok: true, courseSlugs: rows.map((row) => row.courseSlug).filter((slug) => available.has(slug)) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات غير صالحة"); }
  const courseSlug = cleanText(payload.courseSlug, 120);
  if (!courseSlug || !await getCourseCatalog(courseSlug)) return jsonError("المادة غير موجودة", 404);
  const db = getDb();
  if (payload.active === false) await db.delete(favorites).where(and(eq(favorites.userEmail, user.email), eq(favorites.courseSlug, courseSlug)));
  else await db.insert(favorites).values({ userEmail: user.email, courseSlug }).onConflictDoNothing();
  const rows = await db.select({ courseSlug: favorites.courseSlug }).from(favorites).where(eq(favorites.userEmail, user.email));
  return Response.json({ ok: true, courseSlugs: rows.map((row) => row.courseSlug) }, { headers: { "cache-control": "no-store" } });
}
