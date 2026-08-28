import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { getPublicSettings, settingEnabled } from "@/lib/platform-settings";

export async function GET(request: Request) {
  let user = await getSessionUser(request);
  if (!user) return jsonError("غير مسجل", 401);
  if (user.profileCompleted && !user.onboardingCompleted && !settingEnabled((await getPublicSettings()).onboarding_enabled)) {
    const now = new Date().toISOString();
    await getDb().update(users).set({ onboardingCompletedAt: now, updatedAt: now }).where(eq(users.id, user.id));
    user = { ...user, onboardingCompleted: true };
  }
  return Response.json({ ok: true, user }, { headers: { "cache-control": "no-store" } });
}
