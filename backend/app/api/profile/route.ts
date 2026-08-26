import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser, sameOriginRequest, validSaudiPhone } from "@/lib/auth";
import { cleanText, jsonError, normalizePhone } from "@/lib/api";
import { getInstitutionCatalog, getProgramsCatalog } from "@/lib/catalog-store";

function canonicalPhone(value: string) {
  const digits = normalizePhone(value).replace(/\D/g, "");
  if (digits.startsWith("966")) return `+${digits}`;
  if (digits.startsWith("0")) return `+966${digits.slice(1)}`;
  return `+966${digits}`;
}

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return jsonError("سجّل الدخول", 401);
  return Response.json({ ok: true, user }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  const current = await getSessionUser(request);
  if (!current) return jsonError("سجّل الدخول", 401);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات الملف غير صالحة"); }
  const fullName = cleanText(payload.fullName, 120).replace(/\s+/g, " ");
  const rawPhone = normalizePhone(payload.phone);
  const phone = canonicalPhone(rawPhone);
  const universitySlug = cleanText(payload.universitySlug, 120);
  const specialty = cleanText(payload.specialty, 120);
  if (fullName.length < 5 || !validSaudiPhone(rawPhone)) return jsonError("تحقق من الاسم ورقم الجوال");
  const institution = await getInstitutionCatalog(universitySlug);
  if (!institution) return jsonError("اختر الجامعة أو الكلية من القائمة المعتمدة");
  const catalog = await getProgramsCatalog(institution.slug);
  if (!catalog.programs.some((program) => program.name === specialty)) return jsonError("هذا التخصص غير مرتبط بالجامعة أو الكلية المختارة");
  const db = getDb();
  const [duplicatePhone] = await db.select({ id: users.id }).from(users).where(and(eq(users.phone, phone), ne(users.id, current.id))).limit(1);
  if (duplicatePhone) return jsonError("رقم الجوال مستخدم في حساب آخر", 409);
  const now = new Date().toISOString();
  await db.update(users).set({ fullName, phone, universitySlug, specialty, profileCompletedAt: now, updatedAt: now }).where(eq(users.id, current.id));
  return Response.json({ ok: true, next: current.onboardingCompleted ? "/dashboard" : "/onboarding" });
}
