/** Reviewed, one-use source edits. No production data, migrations or secrets are touched. */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
if (process.env.GITHUB_REPOSITORY !== "nebrasacademy3-lab/maras" || process.env.GITHUB_REF !== "refs/heads/implement/plan-v7-20260916") throw new Error("Implementation branch required");
function patch(path, before, after) {
  const text = readFileSync(path, "utf8");
  if (text.includes(after)) return;
  if (text.split(before).length !== 2) throw new Error(`Reviewed anchor mismatch: ${path}`);
  writeFileSync(path, text.replace(before, after));
}
patch("tests/auth-device-enrollment-behavior.test.mjs", 'const devices = await isolated("../lib/auth-devices.ts", { ...tables, eq, and, isNull, sql });', 'const devicePolicy = await isolated("../lib/device-access-policy.ts");\nconst devices = await isolated("../lib/auth-devices.ts", { ...tables, ...devicePolicy, eq, and, isNull, sql });');
patch("tests/auth-device-enrollment-behavior.test.mjs", '...bodies, ...devices, eq, and, asc:', '...bodies, ...devices, ...devicePolicy, eq, and, sql, desc: value => value, asc:');
patch("lib/auth-devices.ts", 'blockedUntil: policy?.blockedUntil || null, revision:', 'blockedUntil: policy ? policy.blockedUntil : device.blockedUntil || null, revision:');
patch("app/api/admin/students/[email]/devices/route.ts", 'import { and, asc, eq }', 'import { and, desc, eq, sql }');
patch("app/api/admin/students/[email]/devices/route.ts", '.orderBy(asc(authDevices.firstSeenAt)).limit(500)', '.orderBy(sql`(${authDevices.revokedAt} IS NULL) DESC`, desc(authDevices.lastSeenAt), desc(authDevices.id)).limit(500)');
patch("app/api/admin/students/[email]/route.ts", 'if (!can("students.manage")) { result.sessions = []; result.pushDevices = [];', 'if (!can("students.devices.view")) { result.sessions = []; result.pushDevices = [];');
patch("components/admin-registered-devices.tsx", 'await onChanged?.();', 'try { await onChanged?.(); } catch { setNotice("تم تنفيذ الإجراء، لكن تحديث ملخص الطالب تعثر؛ حدّث الملخص دون تكرار العملية."); }');
patch("scripts/qa-study-ci.mjs", 'import { mkdirSync, writeFileSync, openSync }', 'import { mkdirSync, writeFileSync, readFileSync, openSync }');
patch("scripts/qa-study-ci.mjs", 'await run(["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/qa-platform-security.ts"]);', 'await run(["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/qa-platform-security.ts"]);\nawait run(["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "scripts/qa-device-return.ts"]);');
patch("scripts/qa-study-ci.mjs", '  let ready = false;', '  let ready = false;\n  await run(["--import", "./scripts/ai-worker-runtime.mjs", "--import", "tsx", "--input-type=module", "--eval", \'const m=await import("./lib/seo.ts"); console.log("PUBLIC_SOURCE_ORIGIN", JSON.stringify({ site: process.env.NEXT_PUBLIC_SITE_URL, app: process.env.APP_URL, node: process.env.NODE_ENV, resolved: m.seoSiteOrigin(), canonical: m.seoUrl("/about") }));\']);');
patch("scripts/qa-study-ci.mjs", '  if (!ready) throw new Error("Synthetic web server did not start successfully");', '  if (!ready || server.exitCode !== null) throw new Error(`Synthetic server failed to own its listener: ${readFileSync(".data/study-server.log", "utf8").slice(-3000)}`);\n  console.log("SYNTHETIC_SERVER_LISTENER", JSON.stringify({ pid: server.pid, exitCode: server.exitCode }));');
patch("scripts/qa-study-ci.mjs", '  const html = await response.text();', '  const html = await response.text();\n  if (server.exitCode !== null) throw new Error(`A stale listener answered instead of this server: ${readFileSync(".data/study-server.log", "utf8").slice(-3000)}`);');
unlinkSync("scripts/finalize-device-review.mjs");
unlinkSync(".github/workflows/finalize-device-review.yml");
console.log("Persisted shared policy test bindings and final device review; temporary source editor removed.");
