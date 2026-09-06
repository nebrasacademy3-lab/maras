import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function load(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, URL, URLSearchParams, ReadableStream, TransformStream, require: key => { if (!(key in imports)) throw new Error(`Unexpected import ${key}`); return imports[key]; } });
  return exports;
}
const navigation = load("lib/dashboard-navigation.ts");
const access = load("lib/course-access.ts", { "drizzle-orm": {}, "@/db/schema": {} });
const course = load("lib/course-update.ts", { "@/lib/course-access": access });
const ledger = load("lib/catalog-deletion-ledger.ts");
const fields = load("lib/security-form.ts");
const scanner = load("lib/file-scan-policy.ts");
const associations = load("lib/app-associations.ts");
const deeplinks = load("mobile/src/lib/deep-links.ts");
const pages = load("mobile/src/lib/catalog-pagination.ts");

test("dashboard header distinguishes overview, materials, account and returned payment", () => {
  for (const view of ["overview", "courses", "account", "requests", "orders", "notifications", "support"]) {
    const query = view === "overview" ? "" : `view=${view}`;
    const targets = ["/dashboard", "/dashboard?view=courses", "/dashboard?view=account"];
    for (const target of targets) assert.equal(navigation.navigationIsActive(target, "/dashboard", query), navigation.dashboardView(new URL(target, "https://test.example").searchParams.get("view")) === view);
  }
  assert.equal(navigation.navigationIsActive("/#faq", "/", ""), false);
  assert.equal(navigation.navigationIsActive("/courses", "/courses-next", ""), false);
  assert.equal(navigation.navigationIsActive("/courses", "/courses/algebra", ""), true);
  assert.equal(navigation.navigationIsActive("/dashboard", "/dashboard", "payment=return&order=X"), false);
  assert.equal(navigation.dashboardHref("not-a-tab"), "/dashboard");
});
test("partial material actions preserve shared scope and explicit duration", () => {
  const previous = { audienceScope: "institution", accessDurationDays: 180, accessLabel: "90 يومًا" };
  const next = course.coursePolicyForSave({ featured: true }, previous);
  assert.equal(next.audienceScope, "institution"); assert.equal(next.accessDurationDays, 180);
  assert.deepEqual(Object.keys(course.courseFlagPatch({ featured: true, audienceScope: "specialty", price: 0 })), ["featured"]);
  assert.equal(course.coursePolicyForSave({ accessDurationDays: 365 }, previous).accessDurationDays, 365);
  for (const bad of [0, -1, 3651, NaN, "text", 1.5]) assert.throws(() => course.coursePolicyForSave({ accessDurationDays: bad }, previous));
  assert.throws(() => course.courseFlagPatch({ featured: "false" }));
  assert.throws(() => course.courseFlagPatch({ status: "deleted" }));
  assert.throws(() => course.coursePolicyForSave({ audienceScope: "other" }, previous));
});
test("deletion ledger blocks course, university and specialty fallback independently", () => {
  const item = { slug: "biology", institutionSlug: "university", specialtySlug: "health" };
  for (const [entityType, entityId] of [["course", "biology"], ["institution", "university"], ["specialty", "health"]]) assert.equal(ledger.courseWasDeleted(ledger.catalogDeletionSet([{ entityType, entityId }]), item), true);
  assert.equal(ledger.courseWasDeleted(ledger.catalogDeletionSet([{ entityType: "course", entityId: "other" }]), item), false);
});
test("verification input keeps leading zeroes and accepts Arabic digits/pasted codes", () => {
  assert.equal(fields.normalizeVerificationCode("٠١٢٣٤٥"), "012345");
  assert.equal(fields.normalizeVerificationCode("۰۱۲۳۴۵"), "012345");
  assert.equal(fields.normalizeVerificationCode(" 01 23-45 789"), "012345");
  assert.equal(fields.acceptsNewPassword("password123!"), true);
  assert.equal(fields.acceptsNewPassword("passwordonly"), false);
});
test("malware verdict is fail-closed under contradictory, missing and unknown responses", () => {
  for (const value of [{ clean: true, status: "infected" }, { clean: false, status: "clean" }, { clean: true, threat: "test-threat" }]) assert.equal(scanner.scanVerdict(value, "now").status, "quarantined");
  for (const value of [null, [], {}, "OK", { clean: true, status: "pending" }, { status: "error" }]) assert.equal(scanner.scanVerdict(value, "now").status, "pending");
  assert.equal(scanner.scanVerdict({ clean: true, status: "clean" }, "now").status, "clean");
});
test("scanner streaming limit counts real chunks without trusting headers", async () => {
  const stream = () => new ReadableStream({ start(c) { c.enqueue(new Uint8Array(4)); c.enqueue(new Uint8Array(4)); c.close(); } });
  assert.equal((await new Response(scanner.limitByteStream(stream(), 8)).arrayBuffer()).byteLength, 8);
  await assert.rejects(new Response(scanner.limitByteStream(stream(), 7)).arrayBuffer(), /scan_size_limit/);
});
test("app associations require real formatted signing identities and never publish placeholders", () => {
  assert.equal(associations.androidAssociation(undefined), null);
  assert.equal(associations.androidAssociation("fake"), null);
  const fingerprint = Array(32).fill("AB").join(":");
  assert.equal(associations.androidAssociation(fingerprint)[0].target.sha256_cert_fingerprints[0], fingerprint);
  assert.equal(associations.appleAssociation("bad"), null);
  assert.equal(associations.appleAssociation("ABCDEF1234").applinks.details[0].appID, "ABCDEF1234.sa.merasalelm.app");
});
test("incoming material/account/reset links resolve to existing native routes", () => {
  assert.equal(deeplinks.resolveAppLink("https://marasalelm.com/courses/biology"), "/course/biology");
  assert.equal(deeplinks.resolveAppLink("/dashboard?view=account"), "/profile");
  assert.equal(deeplinks.resolveAppLink("merasalelm://oauth/callback?code=opaque"), "/oauth/callback?code=opaque");
  assert.equal(deeplinks.resolveAppLink("/reset-password?token=opaque"), "/reset-password?token=opaque");
  for (const bad of ["https://evil.example/courses/biology", "//evil.example", "/courses/%", "/courses/a%2fb", "javascript:alert(1)"]) assert.equal(deeplinks.resolveAppLink(bad), "/(tabs)");
});
test("mobile catalog pagination reaches every row and clamps deleted/search page offsets", () => {
  const rows = Array.from({ length: 101 }, (_, id) => ({ id, name: `Course ${id}` }));
  const seen = [];
  for (let index = 0; index < 5; index++) seen.push(...pages.catalogPage(rows, "", index, item => item.name).items.map(item => item.id));
  assert.deepEqual(seen, rows.map(item => item.id));
  assert.equal(pages.catalogPage(rows, "Course 100", 999, item => item.name).items[0].id, 100);
});
