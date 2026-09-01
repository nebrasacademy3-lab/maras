import { and, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { analyticsEvents, cartItems, courseAccess } from "@/db/schema";
import { cleanText, jsonError } from "@/lib/api";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { getCoursesCatalog } from "@/lib/catalog-store";

async function cartFor(userEmail: string) {
  const [rows, accessRows, courses] = await Promise.all([
    getDb().select().from(cartItems).where(eq(cartItems.userEmail, userEmail)),
    getDb().select({ courseSlug: courseAccess.courseSlug }).from(courseAccess).where(and(eq(courseAccess.userEmail, userEmail), isNull(courseAccess.revokedAt), or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, new Date().toISOString())))),
    getCoursesCatalog(),
  ]);
  const owned = new Set(accessRows.map((row) => row.courseSlug));
  const available = new Map(courses.filter((course) => course.availableForPurchase).map((course) => [course.slug, course]));
  const validRows = rows.filter((row) => !owned.has(row.courseSlug) && available.has(row.courseSlug));
  const items = validRows.map((row) => available.get(row.courseSlug)!).filter(Boolean);
  return { items, courseSlugs: items.map((course) => course.slug), subtotal: items.reduce((sum, course) => sum + course.price, 0), count: items.length };
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول لاستخدام السلة", 401);
  return Response.json({ ok: true, ...(await cartFor(user.email)) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول لإضافة المواد إلى السلة", 401);
  if (!await checkRateLimit("cart-write", `user:${user.id}`, 120, 60)) return jsonError("تحديثات كثيرة للسلة. حاول بعد قليل.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات السلة غير صالحة"); }
  const db = getDb();
  if (payload.clear === true) {
    await db.delete(cartItems).where(eq(cartItems.userEmail, user.email));
    return Response.json({ ok: true, ...(await cartFor(user.email)) }, { headers: { "cache-control": "no-store" } });
  }
  const courseSlug = cleanText(payload.courseSlug, 120);
  const course = (await getCoursesCatalog()).find((item) => item.slug === courseSlug);
  if (!course) return jsonError("المادة غير موجودة أو غير منشورة", 404);
  if (payload.active !== false && !course.availableForPurchase) return jsonError("المادة تُجهّز للإطلاق وتُفتح للسلة عند نشر أول درس متاح", 409);
  const [owned] = await db.select({ id: courseAccess.id }).from(courseAccess).where(and(eq(courseAccess.userEmail, user.email), eq(courseAccess.courseSlug, courseSlug), isNull(courseAccess.revokedAt), or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, new Date().toISOString())))).limit(1);
  if (owned) return jsonError("هذه المادة مفعلة في حسابك بالفعل", 409);
  if (payload.active === false) await db.delete(cartItems).where(and(eq(cartItems.userEmail, user.email), eq(cartItems.courseSlug, courseSlug)));
  else await db.insert(cartItems).values({ userEmail: user.email, courseSlug, createdAt: new Date().toISOString() }).onConflictDoUpdate({ target: [cartItems.userEmail, cartItems.courseSlug], set: { createdAt: new Date().toISOString() } });
  await db.insert(analyticsEvents).values({ event: payload.active === false ? "remove_from_cart" : "add_to_cart", userEmail: user.email, courseSlug, metadataJson: JSON.stringify({ source: "cart_api" }), createdAt: new Date().toISOString() });
  return Response.json({ ok: true, ...(await cartFor(user.email)) }, { headers: { "cache-control": "no-store" } });
}
