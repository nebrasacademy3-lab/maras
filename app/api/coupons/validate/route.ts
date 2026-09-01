import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";
import { getCoursesCatalog } from "@/lib/catalog-store";
import { quoteCoupon, quoteCouponForCart } from "@/lib/coupons";

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول أولًا", 401);
  if (!await checkRateLimit("coupon-quote", `user:${user.id}`, 60, 60)) return jsonError("محاولات كوبون كثيرة. حاول بعد قليل.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; }
  catch { return jsonError("بيانات غير صالحة"); }
  const requestedSlugs = Array.isArray(payload.courseSlugs) ? payload.courseSlugs.map((slug) => cleanText(slug, 120)).filter(Boolean).slice(0, 30) : [cleanText(payload.courseSlug, 120)].filter(Boolean);
  const courses = await getCoursesCatalog();
  const selected = requestedSlugs.map((slug) => courses.find((course) => course.slug === slug)).filter((course): course is NonNullable<typeof course> => Boolean(course));
  if (!selected.length || selected.length !== requestedSlugs.length) return jsonError("إحدى المواد غير موجودة أو غير منشورة", 404);
  const quote = selected.length === 1 ? await quoteCoupon(cleanText(payload.code, 40), selected[0].slug, selected[0].price, user.id) : await quoteCouponForCart(cleanText(payload.code, 40), selected.map((course) => ({ courseSlug: course.slug, price: course.price })), user.id);
  if (!quote) return jsonError("الكود غير صالح أو منتهي أو غير مخصص لهذه المادة أو السلة", 404);
  return Response.json({ ok: true, ...quote });
}
