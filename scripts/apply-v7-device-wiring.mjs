/** One-use source migration on the authorized implementation branch, not an application startup task. */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
if (process.env.GITHUB_REPOSITORY !== "nebrasacademy3-lab/maras" || process.env.GITHUB_REF !== "refs/heads/implement/plan-v7-20260916") throw new Error("Implementation branch only");
function patch(path, before, after) {
  const text = readFileSync(path, "utf8");
  if (text.includes(after)) return;
  if (text.split(before).length !== 2) throw new Error(`Ambiguous or missing reviewed anchor: ${path}`);
  writeFileSync(path, text.replace(before, after));
}
patch("db/schema.ts", '  revokedBy: text("revoked_by"),\n  revocationReason: text("revocation_reason"),', '  revokedBy: text("revoked_by"),\n  revocationReason: text("revocation_reason"),\n  returnPolicy: text("return_policy").notNull().default("blocked"),\n  blockedUntil: text("blocked_until"),\n  policyVersion: integer("policy_version").notNull().default(0),');
patch("db/schema.ts", 'import { boolean, foreignKey,', 'import { boolean, check, foreignKey,');
patch("db/schema.ts", '[uniqueIndex("auth_devices_user_device_unique").on(table.userId, table.deviceId), index("auth_devices_user_active_idx").on(table.userId, table.revokedAt)]', '[uniqueIndex("auth_devices_user_device_unique").on(table.userId, table.deviceId), index("auth_devices_user_active_idx").on(table.userId, table.revokedAt), check("auth_devices_return_policy_check", sql`${table.returnPolicy} IN (\'blocked\', \'allowed\', \'approval\')`), check("auth_devices_policy_version_check", sql`${table.policyVersion} >= 0`), check("auth_devices_block_expiry_policy_check", sql`${table.blockedUntil} IS NULL OR ${table.returnPolicy} = \'allowed\'`)]');
patch("lib/staff-policy.ts", '  STUDENTS_VIEW: "students.view", STUDENTS_MANAGE: "students.manage",', '  STUDENTS_VIEW: "students.view", STUDENTS_MANAGE: "students.manage",\n  DEVICES_VIEW: "students.devices.view", DEVICES_MANAGE: "students.devices.manage",');
patch("lib/staff-policy.ts", '"students.manage": "إدارة الطلاب والأجهزة",', '"students.manage": "تعديل بيانات الطلاب", "students.devices.view": "عرض أجهزة الطلاب", "students.devices.manage": "إدارة أجهزة الطلاب والجلسات وسياسة العودة",');
patch("lib/staff-policy.ts", '  if (/^\\/api\\/admin\\/students\\//.test(path)) return [read ? "students.view" : "students.manage"];', '  if (/^\\/api\\/admin\\/students\\/[^/]+\\/devices$/.test(path)) return [read ? "students.devices.view" : "students.devices.manage"];\n  if (/^\\/api\\/admin\\/students\\//.test(path)) return [read ? "students.view" : "students.manage"];');
patch("lib/staff-policy.ts", 'revokeUserSession: ["students.manage"]', 'revokeUserSession: ["students.devices.manage"]');
writeFileSync("mobile/src/lib/staff-policy.ts", readFileSync("lib/staff-policy.ts"));
writeFileSync("mobile/src/lib/device-access-policy.ts", readFileSync("lib/device-access-policy.ts"));
for (const path of ["app/api/auth/login/route.ts", "app/api/mobile/auth/login/route.ts", "lib/account-mfa-login.ts"]) {
  const text = readFileSync(path, "utf8");
  const pattern = /if \(error instanceof DeviceLimitError\) return jsonError\([^;\n]+\);/g;
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(`Expected one reviewed device error handler in ${path}`);
  writeFileSync(path, text.replace(pattern, 'if (error instanceof DeviceLimitError) return jsonError(error.userMessage, error.status, error.code);'));
}
unlinkSync("scripts/apply-v7-device-wiring.mjs");
unlinkSync(".github/workflows/materialize-v7-device-source.yml");
console.log("Applied reviewed schema, capability and authentication wiring; temporary materializer removed.");
