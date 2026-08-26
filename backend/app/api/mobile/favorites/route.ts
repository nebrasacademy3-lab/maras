import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { favorites } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";
import { getCourseCatalog } from "@/lib/catalog-store";
import { isMobileRequest, mobileNoStoreHeaders } from "@/lib/mobile-api";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  const rows = await getDb().select().from(favorites).where(eq(favorites.userEmail, user.email));
  return Response.json({ ok: true, courseSlugs: rows.map((row) => row.courseSlug) }, { headers: mobileNoStoreHeaders });
}

export async function POST(request: Request) {
  if (!isMobileRequest(request)) return jsonError("طلب تطبيق غير صالح", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات غير صالحة"); }
  const courseSlug = cleanText(payload.courseSlug, 120);
  if (!await getCourseCatalog(courseSlug)) return jsonError("المادة غير موجودة", 404);
  const db = getDb();
  if (payload.active === false) await db.delete(favorites).where(and(eq(favorites.userEmail, user.email), eq(favorites.courseSlug, courseSlug)));
  else await db.insert(favorites).values({ userEmail: user.email, courseSlug }).onConflictDoNothing();
  return Response.json({ ok: true }, { headers: mobileNoStoreHeaders });
}
