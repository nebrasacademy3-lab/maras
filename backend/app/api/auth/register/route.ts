import { eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { checkRateLimit, clientIp, createSession, hashPassword, sameOriginRequest, validEmail, validPassword, validSaudiPhone } from "@/lib/auth";
import { cleanText, jsonError, normalizePhone } from "@/lib/api";
import { getInstitutionCatalog, getProgramsCatalog } from "@/lib/catalog-store";
import { validAcademicLevel } from "@/lib/academic-levels";

function canonicalPhone(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^00966/, "966");
  if (digits.startsWith("966")) return `+${digits}`;
  if (digits.startsWith("0")) return `+966${digits.slice(1)}`;
  return `+966${digits}`;
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return jsonError("تعذر التحقق من مصدر الطلب", 403);
  if (!await checkRateLimit("register", clientIp(request), 6, 60 * 60)) return jsonError("محاولات كثيرة. حاول بعد ساعة.", 429);
  let payload: Record<string, unknown>;
  try { payload = await request.json() as Record<string, unknown>; } catch { return jsonError("بيانات التسجيل غير صالحة"); }

  const fullName = cleanText(payload.fullName, 120).replace(/\s+/g, " ");
  const email = cleanText(payload.email, 180).toLowerCase();
  const rawPhone = normalizePhone(payload.phone);
  const phone = canonicalPhone(rawPhone);
  const password = typeof payload.password === "string" ? payload.password : "";
  const universitySlug = cleanText(payload.universitySlug, 120);
  const specialty = cleanText(payload.specialty, 120);
  const academicLevel = cleanText(payload.academicLevel, 80);

  if (fullName.length < 5 || !validEmail(email) || !validSaudiPhone(rawPhone)) return jsonError("تحقق من الاسم والبريد ورقم الجوال السعودي");
  if (!validPassword(password)) return jsonError("كلمة المرور يجب أن تكون 10 أحرف على الأقل وتحتوي رقمًا ورمزًا خاصًا");
  if (!validAcademicLevel(academicLevel)) return jsonError("اختر المستوى الدراسي أو خريج من القائمة");
  const institution = await getInstitutionCatalog(universitySlug);
  if (!institution) return jsonError("اختر جامعة أو كلية معتمدة من القائمة");
  if (payload.termsAccepted !== true) return jsonError("يلزم الموافقة على الشروط وسياسة الخصوصية");
  const catalog = await getProgramsCatalog(institution.slug);
  if (!catalog.programs.some((program) => program.name === specialty)) return jsonError("هذا التخصص غير مرتبط بالجامعة أو الكلية المختارة");

  const db = getDb();
  const [existing] = await db.select({ id: users.id }).from(users).where(or(eq(users.email, email), eq(users.phone, phone))).limit(1);
  if (existing) return jsonError("يوجد حساب مرتبط بالبريد أو رقم الجوال", 409);
  const now = new Date().toISOString();
  const [created] = await db.insert(users).values({
    email,
    phone,
    fullName,
    passwordHash: await hashPassword(password),
    role: "student",
    universitySlug,
    specialty,
    academicLevel,
    profileCompletedAt: now,
    status: "active",
    createdAt: now,
    updatedAt: now,
  }).returning({ id: users.id, email: users.email, fullName: users.fullName });
  const session = await createSession(created.id, request, true);
  return Response.json({ ok: true, user: created, next: "/onboarding" }, { status: 201, headers: { "set-cookie": session.cookie, "cache-control": "no-store" } });
}
