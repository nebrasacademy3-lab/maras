import { existsSync } from "node:fs";
import { getPool, closeDb } from "../db";
import { createInitialAdmin, InitialAdminError } from "./lib/initial-admin";

async function readPassword() {
  if (!process.argv.includes("--password-stdin")) {
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    return password;
  }
  if (process.stdin.isTTY) throw new InitialAdminError("PASSWORD_INPUT", "مرر كلمة المرور عبر إدخال قياسي آمن أو متغير البيئة؛ لا تكتبها في وسيطات الأمر.");
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk.toString();
    if (Buffer.byteLength(input) > 2048) throw new InitialAdminError("PASSWORD_INPUT", "إدخال كلمة المرور أكبر من المسموح.");
  }
  return input.replace(/\r?\n$/, "");
}
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("تهيئة أول مدير فقط. اضبط BOOTSTRAP_ADMIN_EMAIL وBOOTSTRAP_ADMIN_NAME ومرر كلمة المرور عبر BOOTSTRAP_ADMIN_PASSWORD أو --password-stdin. راجع STAGING_AR.md. لا تقبل الأداة كلمة المرور في وسيطات الأمر.");
    return;
  }
  if (args.some(arg => arg !== "--password-stdin")) throw new InitialAdminError("INVALID_ARGUMENT", "وسيط غير مدعوم. استخدم --help.");
  if (existsSync(".env")) process.loadEnvFile(".env");
  if (!process.env.DATABASE_URL) throw new InitialAdminError("DATABASE_REQUIRED", "اضبط DATABASE_URL على قاعدة البيئة المطلوبة أولًا.");
  const password = await readPassword();
  await createInitialAdmin(getPool(), { email: process.env.BOOTSTRAP_ADMIN_EMAIL || "", fullName: process.env.BOOTSTRAP_ADMIN_NAME || "", password });
  console.log("تم إنشاء المدير الأول. سجّل الدخول ثم فعّل المصادقة متعددة العوامل من إعدادات الأمان.");
}
main().catch(error => {
  console.error(error instanceof InitialAdminError ? error.message : "تعذرت تهيئة المدير. تحقق من اتصال قاعدة البيانات وتطبيق الترحيلات؛ لم تُعرض أي أسرار.");
  process.exitCode = 1;
}).finally(closeDb);
