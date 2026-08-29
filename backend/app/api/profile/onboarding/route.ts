import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { checkRateLimit, getSessionUser, sameOriginRequest } from "@/lib/auth";
import { jsonError } from "@/lib/api";

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  if (!await checkRateLimit("onboarding-complete", `user:${user.id}`, 10, 60 * 60)) return jsonError("محاولات كثيرة. حاول لاحقًا.", 429);
  const now = new Date().toISOString();
  await getDb().update(users).set({ onboardingCompletedAt: now, updatedAt: now }).where(eq(users.id, user.id));
  return Response.json({ ok: true, next: "/dashboard" });
}
