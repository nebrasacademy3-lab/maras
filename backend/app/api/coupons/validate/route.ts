import { getSessionUser, sameOriginRequest } from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";
import { getCourseCatalog } from "@/lib/catalog-store";
import { quoteCoupon } from "@/lib/coupons";

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول أولًا", 401);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; }
  catch { return jsonError("بيانات غير صالحة"); }
  const course = await getCourseCatalog(cleanText(payload.courseSlug, 120));
  if (!course) return jsonError("المادة غير موجودة", 404);
  const quote = await quoteCoupon(cleanText(payload.code, 40), course.slug, course.price);
  if (!quote) return jsonError("الكود غير صالح أو منتهي أو غير مخصص لهذه المادة", 404);
  return Response.json({ ok: true, ...quote });
}
