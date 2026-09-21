import { studentWorkspaceRequirementResponse } from "@/lib/student-workspace-policy";
import { readBoundedJsonObject } from "@/lib/request-body";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { favorites } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { getCourseCatalog, getCoursesCatalog } from "@/lib/catalog-store";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (user?.role === "instructor") return studentWorkspaceRequirementResponse(user)!;
  if (!user) return jsonError("سجّل الدخول", 401);
  const rows = await getDb().select().from(favorites).where(eq(favorites.userId, user.id));
  const available = new Set((await getCoursesCatalog()).map((course) => course.slug));
  return Response.json({ ok: true, courseSlugs: rows.map((row) => row.courseSlug).filter((slug) => available.has(slug)) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (user?.role === "instructor") return studentWorkspaceRequirementResponse(user)!;
  if (!user) return jsonError("سجّل الدخول", 401);
  if (!await checkRateLimit("favorite-write", `user:${user.id}`, 120, 60)) return jsonError("تحديثات كثيرة للمفضلة. حاول بعد قليل.", 429);
  let payload: Record<string, unknown>;
  try { payload = await readBoundedJsonObject(request, 32 * 1024); } catch { return jsonError("بيانات غير صالحة"); }
  const courseSlug = cleanText(payload.courseSlug, 120);
  if (!courseSlug || !await getCourseCatalog(courseSlug)) return jsonError("المادة غير موجودة", 404);
  const db = getDb();
  if (payload.active === false) await db.delete(favorites).where(and(eq(favorites.userId, user.id), eq(favorites.courseSlug, courseSlug)));
  else await db.insert(favorites).values({ userId: user.id, userEmail: user.email, courseSlug }).onConflictDoNothing({ target: [favorites.userId, favorites.courseSlug] });
  const rows = await db.select({ courseSlug: favorites.courseSlug }).from(favorites).where(eq(favorites.userId, user.id));
  return Response.json({ ok: true, courseSlugs: rows.map((row) => row.courseSlug) }, { headers: { "cache-control": "no-store" } });
}
