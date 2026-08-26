import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { lessonNotes } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { cleanText, jsonError } from "@/lib/api";
import { isMobileRequest, mobileNoStoreHeaders } from "@/lib/mobile-api";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  const lessonId = cleanText(new URL(request.url).searchParams.get("lesson"), 120);
  if (!lessonId) return jsonError("الدرس مطلوب");
  const [note] = await getDb().select().from(lessonNotes).where(and(eq(lessonNotes.userEmail, user.email), eq(lessonNotes.lessonId, lessonId))).limit(1);
  return Response.json({ ok: true, note: note || null }, { headers: mobileNoStoreHeaders });
}

export async function PUT(request: Request) {
  if (!isMobileRequest(request)) return jsonError("طلب تطبيق غير صالح", 403);
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات غير صالحة"); }
  const lessonId = cleanText(payload.lessonId, 120);
  const body = cleanText(payload.body, 8000);
  if (!lessonId) return jsonError("الدرس مطلوب");
  const now = new Date().toISOString();
  await getDb().insert(lessonNotes).values({ userEmail: user.email, lessonId, body, updatedAt: now }).onConflictDoUpdate({ target: [lessonNotes.userEmail, lessonNotes.lessonId], set: { body, updatedAt: now } });
  return Response.json({ ok: true, updatedAt: now }, { headers: mobileNoStoreHeaders });
}
