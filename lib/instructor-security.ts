import { getDb } from "@/db";
import { platformSettings } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { requireAdminStepUp } from "@/lib/admin-mfa";

export class InstructorError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "INSTRUCTOR_INVALID") { super(message); this.name = "InstructorError"; }
}

export async function instructorActor(request: Request): Promise<SessionUser> {
  const user = await getSessionUser(request);
  if (!user) throw new InstructorError("سجّل الدخول إلى حساب الشارح أولاً", 401, "INSTRUCTOR_LOGIN_REQUIRED");
  if (user.role !== "instructor") throw new InstructorError("هذه المساحة لحسابات الشارحين فقط", 403, "INSTRUCTOR_ROLE_REQUIRED");
  if (!user.emailVerified) throw new InstructorError("أكّد بريدك الإلكتروني قبل المتابعة", 403, "EMAIL_VERIFICATION_REQUIRED");
  return user;
}

export async function instructorOwner(request: Request, stepUp = false): Promise<SessionUser> {
  const user = await getSessionUser(request);
  if (!user || user.role !== "admin" || !user.isPlatformOwner) throw new InstructorError("إدارة الشارحين للمدير الأعلى فقط", 403, "INSTRUCTOR_OWNER_REQUIRED");
  if (stepUp) await requireAdminStepUp(request, user);
  return user;
}

function encryptionKey() {
  const raw = process.env.INSTRUCTOR_DATA_ENCRYPTION_KEY?.trim() || "";
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : /^[A-Za-z0-9+/]{43}=$/.test(raw) ? Buffer.from(raw, "base64") : null;
  if (!key || key.length !== 32) throw new InstructorError("خدمة حفظ بيانات الشارحين غير مهيأة؛ تواصل مع الإدارة", 503, "INSTRUCTOR_ENCRYPTION_UNAVAILABLE");
  return createHmac("sha256", key).update("maras:instructor-data:v1").digest();
}

// AAD binds ciphertext to its owner and purpose, preventing row/key substitution.
export function encryptInstructorData(value: string, context: string) {
  if (!context || context.length > 200 || Buffer.byteLength(value) > 15 * 1024 * 1024) throw new InstructorError("بيانات الحفظ غير صالحة");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

export function decryptInstructorData(value: string, context: string) {
  const key = encryptionKey();
  try {
    if (value.length > 22 * 1024 * 1024 || !context || context.length > 200) throw new Error("Invalid encrypted value");
    const parts = value.split(".");
    if (parts.length !== 4 || parts[0] !== "v1" || !parts.slice(1).every(part => /^[A-Za-z0-9_-]*$/.test(part))) throw new Error("Invalid envelope");
    const iv = Buffer.from(parts[1], "base64url"), tag = Buffer.from(parts[3], "base64url");
    if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid nonce or tag");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(parts[2], "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new InstructorError("تعذر التحقق من سلامة البيانات المحفوظة", 503, "INSTRUCTOR_DATA_UNAVAILABLE");
  }
}

export async function instructorIdentityCollectionPolicy() {
  const saved: Record<string, string> = {};
  if (process.env.DATABASE_URL) {
    const rows = await getDb().select({ key: platformSettings.key, value: platformSettings.value }).from(platformSettings).where(inArray(platformSettings.key, ["instructor_identity_legal_basis", "instructor_identity_retention_days"]));
    for (const row of rows) saved[row.key] = row.value;
  }
  const basis = (saved.instructor_identity_legal_basis ?? process.env.INSTRUCTOR_IDENTITY_LEGAL_BASIS ?? "").trim();
  const retentionDays = Number(saved.instructor_identity_retention_days ?? process.env.INSTRUCTOR_IDENTITY_RETENTION_DAYS ?? 0);
  const enabled = basis.length >= 20 && basis.length <= 2000 && Number.isInteger(retentionDays) && retentionDays >= 1 && retentionDays <= 365;
  return { enabled, basis: enabled ? basis : "", retentionDays: enabled ? retentionDays : 0 };
}
