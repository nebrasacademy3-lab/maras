import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import pg from "pg";
const fixture = JSON.parse(readFileSync(".data/qa-fixtures.json", "utf8"));
if (fixture.origin !== "http://127.0.0.1:3100") throw new Error("Loopback synthetic fixture required");
const origin = fixture.origin;
const admin = fixture.users.find(user => user.role === "admin");
const students = fixture.users.filter(user => user.role.startsWith("student"));
if (!admin || students.length < 2) throw new Error("Synthetic admin and two existing students required");
const state = existsSync(".data/qa-browser-state.json") ? JSON.parse(readFileSync(".data/qa-browser-state.json", "utf8")) : { cookies: [] };
const stepUp = state.cookies.find(cookie => cookie.name === "meras_admin_stepup")?.value;
const { url } = JSON.parse(readFileSync(".data/qa-database.json", "utf8"));
if (new URL(url).hostname !== "127.0.0.1" || !new URL(url).pathname.startsWith("/maras_qa")) throw new Error("Local synthetic database required");
const db = new pg.Client({ connectionString: url }); await db.connect();
const readiness = new Map();
try {
  await db.query("BEGIN READ ONLY");
  const result = await db.query("SELECT id,role,profile_completed_at IS NOT NULL AND length(trim(full_name))>=5 AND coalesce(phone,'')<>'' AND coalesce(university_slug,'')<>'' AND coalesce(specialty,'')<>'' AND coalesce(academic_level,'')<>'' AS profile_complete FROM users WHERE id=ANY($1::int[])", [fixture.users.map(user => user.id)]);
  for (const row of result.rows) readiness.set(row.id, row.role !== "student" || row.profile_complete);
  await db.query("COMMIT");
} finally { await db.end(); }
const skipped = [], checks = [], work = [];
function inventory(folder) { return readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? inventory(path.join(folder, entry.name)) : entry.name === "page.tsx" ? [path.join(folder, entry.name)] : []); }
for (const file of inventory("app/admin")) {
  let route = "/" + file.replaceAll("\\", "/").replace(/^app\//, "").replace(/\/page\.tsx$/, "");
  route = route.replace("[email]", encodeURIComponent(students[0].email)).replace("[slug]", "qa-physics");
  if (route.includes("[")) { skipped.push({ route, reason: "Dynamic identifier unavailable in existing synthetic fixtures" }); continue; }
  for (const user of [admin, ...students, null]) work.push({ route, role: user?.role || "anonymous", user, expectation: user === admin ? "render-admin" : "deny-admin" });
}
for (const route of ["/dashboard", "/dashboard?view=courses", "/dashboard?view=orders", "/dashboard?view=requests", "/dashboard?view=notifications", "/dashboard?view=profile", "/favorites", "/cart", "/support", "/request-course", "/study-tools", "/referrals"]) {
  for (const user of [...students, null]) work.push({ route, role: user?.role || "anonymous", user, expectation: user ? "render-student" : "login-required" });
}
for (const route of ["/notifications", "/onboarding", "/complete-profile", "/meras-ai"]) {
  for (const user of [students[0], null]) work.push({ route, role: user?.role || "anonymous", user, expectation: "account-redirect" });
}
for (const user of [admin, ...students, null]) work.push({ route: "/supervisor", role: user?.role || "anonymous", user, expectation: user === admin ? "render-admin" : "deny-admin" });
for (const user of [...students, null]) work.push({ route: "/learn/qa-physics", role: user?.role || "anonymous", user, expectation: user ? "learning-access-gate" : "login-required" });
const privateEmails = fixture.users.map(user => user.email);
async function inspect(item) {
  const { route, role, user } = item;
  const profileGate = Boolean(user && !readiness.get(user.id) && (item.expectation === "deny-admin" || item.expectation === "learning-access-gate" || item.expectation === "render-student" && route !== "/support"));
  const expectation = profileGate ? "profile-required" : item.expectation;
  try {
    const response = await fetch(origin + route, { redirect: "manual", headers: user ? { cookie: `meras_session=${encodeURIComponent(user.token)}${user === admin && stepUp ? `; meras_admin_stepup=${encodeURIComponent(stepUp)}` : ""}` } : {}, signal: AbortSignal.timeout(30000) });
    const body = await response.text(), location = response.headers.get("location") || "";
    const streamRedirect = body.match(/NEXT_REDIRECT;replace;([^;]+);(?:30[378]);/)?.[1] || body.match(/http-equiv="refresh"[^>]*content="[^;]+;url=([^"]+)"/)?.[1] || "";
    const destination = location || streamRedirect, isRedirect = Boolean(destination) && (response.status >= 300 && response.status < 400 || Boolean(streamRedirect));
    const digestError = /[\\]*"digest[\\]*":\s*[\\]*"[0-9]+/.test(body);
    const record = { route, role, expectation, status: response.status, redirect: destination || null, streamedRedirect: Boolean(streamRedirect), htmlBytes: Buffer.byteLength(body), result: "passed" };
    if (response.status >= 500 || digestError) record.result = "failed-server-render";
    else if (expectation.startsWith("render-") && (response.status !== 200 || isRedirect)) record.result = "failed-expected-render";
    else if (expectation === "deny-admin") {
      const allowed = user ? destination.startsWith("/dashboard?error=forbidden") : destination.startsWith("/login?");
      if (!isRedirect || !allowed) record.result = "failed-role-protection";
    } else if (expectation === "login-required" && (!isRedirect || !destination.startsWith("/login?"))) record.result = "failed-login-protection";
    else if (expectation === "profile-required" && (!isRedirect || !destination.startsWith("/complete-profile?"))) record.result = "failed-profile-protection";
    else if (expectation === "account-redirect" && !isRedirect) record.result = "failed-expected-redirect";
    else if (expectation === "learning-access-gate" && response.status !== 200 && !(isRedirect && /^\/courses\/qa-physics\?(access=required|status=preparing)/.test(destination))) record.result = "failed-learning-page";
    if (expectation === "render-student") {
      record.otherAccountEmailExposed = privateEmails.filter(email => email !== user.email).some(email => body.includes(email));
      if (record.otherAccountEmailExposed) record.result = "failed-cross-account-marker";
    }
    if (expectation === "deny-admin" || expectation === "login-required" || expectation === "profile-required") {
      record.protectedDataInDeniedBody = privateEmails.some(email => body.includes(email) && !route.includes(email) && !route.includes(encodeURIComponent(email)));
      if (record.protectedDataInDeniedBody) record.result = "failed-denied-body-marker";
    }
    checks.push(record);
  } catch (error) { checks.push({ route, role, expectation, status: null, result: "failed-request", error: error instanceof Error ? error.message : "Request failed" }); }
}
let cursor = 0;
await Promise.all(Array.from({ length: 3 }, async () => { while (cursor < work.length) await inspect(work[cursor++]); }));
checks.sort((a, b) => a.route.localeCompare(b.route) || a.role.localeCompare(b.role));
const failures = checks.filter(row => row.result !== "passed");
const report = { generatedAt: new Date().toISOString(), environment: "Loopback production HTTP; pre-existing synthetic admin and student sessions", mode: "GET only; no form submissions or account creation", coverage: "Page rendering, redirects, administrative role rejection, selected cross-account email markers; no button workflows or financial transaction tests", fixturePreconditions: fixture.users.map(user => ({ role: user.role, profileComplete: readiness.get(user.id) })), excluded: ["Financial transactions, invoice and checkout flows", "Button actions and browser hydration", "Actual supervisor account unavailable in existing fixtures"], administrativePageCount: new Set(work.filter(row => row.route.startsWith("/admin")).map(row => row.route)).size, requestCount: checks.length, passed: checks.length - failures.length, failed: failures.length, skipped, checks };
writeFileSync("verification/page-role-smoke.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ requests: checks.length, passed: report.passed, failed: report.failed, skipped: skipped.length, failures: failures.map(({ route, role, status, result, redirect }) => ({ route, role, status, result, redirect })) }, null, 2));
if (failures.length) process.exitCode = 1;
