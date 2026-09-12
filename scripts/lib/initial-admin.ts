import type { Pool } from "pg";
import { hashPassword, validEmail, validPassword } from "../../lib/auth";

export class InitialAdminError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export async function createInitialAdmin(pool: Pool, input: { email: string; fullName: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (email.length > 180 || !validEmail(email)) throw new InitialAdminError("INVALID_EMAIL", "أدخل بريد المدير بصورة صحيحة.");
  if (fullName.length < 5 || fullName.length > 120) throw new InitialAdminError("INVALID_NAME", "أدخل اسم المدير من 5 إلى 120 حرفًا.");
  if (input.password.length > 128 || !validPassword(input.password)) throw new InitialAdminError("INVALID_PASSWORD", "كلمة المرور لا تحقق متطلبات المنصة؛ استخدم من 10 إلى 128 حرفًا مع رقم ورمز.");
  const client = await pool.connect();
  let began = false;
  try {
    await client.query("BEGIN");
    began = true;
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["active-admin-membership"]);
    // Any existing admin, including a suspended one, closes this bootstrap path.
    const admins = await client.query("SELECT id FROM users WHERE role='admin' LIMIT 1");
    if (admins.rows.length) throw new InitialAdminError("ADMIN_EXISTS", "يوجد حساب إداري بالفعل. استخدم إدارة الموظفين أو استعادة الحساب؛ لا تعيد التهيئة.");
    const existing = await client.query("SELECT id FROM users WHERE lower(email)=$1 LIMIT 1", [email]);
    if (existing.rows.length) throw new InitialAdminError("USER_EXISTS", "البريد مرتبط بحساب موجود. التهيئة لا ترفع صلاحية حساب قائم؛ استخدم بريد مدير جديد.");
    const passwordHash = await hashPassword(input.password);
    const now = new Date().toISOString();
    const created = await client.query<{ id: number }>(
      "INSERT INTO users(email,full_name,password_hash,role,status,email_verified_at,profile_completed_at,onboarding_completed_at,created_at,updated_at) VALUES($1,$2,$3,'admin','active',$4,$4,$4,$4,$4) RETURNING id",
      [email, fullName, passwordHash, now],
    );
    const id = created.rows[0]?.id;
    if (!id) throw new Error("Initial admin insert failed");
    await client.query("INSERT INTO audit_logs(actor_email,action,entity_type,entity_id,after_json,created_at) VALUES('local-bootstrap','initial-admin-create','user',$1,$2,$3)",
      [String(id), JSON.stringify({ role: "admin", source: "trusted-server-cli" }), now]);
    await client.query("COMMIT");
    began = false;
    return { id };
  } catch (error) {
    if (began) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
