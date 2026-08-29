import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { favorites } from "@/db/schema";
import { checkRateLimit, getSessionUser } from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";
import { getCourseCatalog, getCoursesCatalog } from "@/lib/catalog-store";
import { isMobileRequest, mobileNoStoreHeaders } from "@/lib/mobile-api";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  const rows = await getDb().select().from(favorites).where(eq(favorites.userEmail, user.email));
  const available = new Set((await getCoursesCatalog()).map((course) => course.slug));
  return Response.json({ ok: true, courseSlugs: rows.map((row) => row.courseSlug).filter((slug) => available.has(slug)) }, { headers: mobileNoStoreHeaders });
}

export async function POST(request: Request) {
  if (!isMobileRequest(request)) return jsonError("طلب تطبيق غير صالح", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  if (!await checkRateLimit("favorite-write", `user:${user.id}`, 120, 60)) return jsonError("تحديثات كثيرة للمفضلة. حاول بعد قليل.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات غير صالحة"); }
  const courseSlug = cleanText(payload.courseSlug, 120);
  if (!await getCourseCatalog(courseSlug)) return jsonError("المادة غير موجودة", 404);
  const db = getDb();
  if (payload.active === false) await db.delete(favorites).where(and(eq(favorites.userEmail, user.email), eq(favorites.courseSlug, courseSlug)));
  else await db.insert(favorites).values({ userEmail: user.email, courseSlug }).onConflictDoNothing();
  const rows = await db.select().from(favorites).where(eq(favorites.userEmail, user.email));
  const available = new Set((await getCoursesCatalog()).map((course) => course.slug));
  return Response.json({ ok: true, courseSlugs: rows.map((row) => row.courseSlug).filter((slug) => available.has(slug)) }, { headers: mobileNoStoreHeaders });
}
