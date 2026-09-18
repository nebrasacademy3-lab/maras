import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { pureSource } from "./helpers/pure-source.mjs";
const policy = await pureSource("lib/staff-policy.ts");
const match = await pureSource("lib/supervisor-scope.ts");
const scope = await pureSource("lib/supervisor-data-scope.ts", { sql, ...policy, hasPermission: async (actor, permission) => actor.permissions?.includes(permission) === true });
const compile = value => new PgDialect().sqlToQuery(value);
test("data scope is explicit, never inferred from a broad action capability", async () => {
  const supervisor = { id: 11, role: "supervisor", permissions: ["catalog.manage", "students.manage", "finance.manage"] };
  assert.equal(await scope.supervisorScopeId(supervisor), 11);
  assert.equal(await scope.supervisorScopeId({ ...supervisor, permissions: ["*"] }), 11);
  assert.equal(await scope.supervisorScopeId({ ...supervisor, permissions: ["data.all"] }), null);
  for (const path of ["/api/admin/finance", "/api/admin/purchases", "/api/admin/ai", "/api/admin/operations/summary", "/api/admin/files/scan", "/api/admin/bundles"]) {
    const required = policy.requiredRoutePermissions(path, "GET");
    assert.ok(required.includes("data.all"), path);
    assert.equal(policy.permissionsCover(new Set(["data.all"]), required), false, path);
    assert.equal(policy.permissionsCover(new Set(required.filter(key => key !== "data.all")), required), false, path);
  }
});
test("only null scope fields are wildcards; empty scope is fail closed and institution-wide courses need institution-wide scope", () => {
  const subject = { universitySlug: "u", specialty: "Science", specialtySlug: "science", audienceScope: "specialty" };
  assert.equal(match.supervisorScopesAllow([], subject), false);
  for (const assignment of [{ institutionSlug: "", specialty: "" }, { institutionSlug: "wrong", specialty: null }, { institutionSlug: "u", specialty: "other" }]) assert.equal(match.supervisorScopesAllow([assignment], subject), false);
  for (const assignment of [{ institutionSlug: "u", specialty: "Science" }, { institutionSlug: "u", specialty: "science" }, { institutionSlug: null, specialty: null }]) assert.equal(match.supervisorScopesAllow([assignment], subject), true);
  assert.equal(match.supervisorScopesAllow([{ institutionSlug: "u", specialty: "Science" }], { ...subject, audienceScope: "institution" }), false);
  assert.equal(match.supervisorScopesAllow([{ institutionSlug: "u", specialty: null }], { ...subject, audienceScope: "institution" }), true);
});
test("scope SQL binds hostile identifiers as values rather than interpolating executable text", () => {
  const hostile = "x'); DELETE FROM users; --";
  for (const expression of [scope.scopedCourseSql(7, sql`${hostile}`), scope.scopedStudentSql(7, sql`${hostile}`), scope.scopedOrderSql(7, sql`${hostile}`), scope.scopedRequestSql(7, sql`${hostile}`), scope.scopedLessonSql(7, sql`${hostile}`)]) {
    const query = compile(expression);
    assert.equal(query.sql.includes(hostile), false);
    assert.ok(query.params.includes(hostile)); assert.ok(query.params.includes(7));
    assert.match(query.sql, /supervisor_assignments/); assert.match(query.sql, /active = true/);
  }
});
test("mixed-order predicate checks the customer, primary course and every order line", () => {
  const query = compile(scope.scopedOrderSql(7, sql`orders.order_number`));
  assert.match(query.sql, /su\.id = so\.user_id/); assert.match(query.sql, /so\.course_slug/);
  assert.match(query.sql, /NOT EXISTS \(SELECT 1 FROM order_items/);
  assert.match(query.sql, /si\.course_slug/);
});
test("scoped mutation policy rejects malformed numeric coercion without executing user objects", async () => {
  let captured;
  const compiled = await pureSource("lib/supervisor-console-policy.ts", { ...scope, sql, getDb: () => ({ execute: async expression => { captured = compile(expression); return { rows: [{ allowed: false }] }; } }) });
  const actor = { id: 7, role: "supervisor", permissions: [] };
  for (const id of [JSON.parse('{"toString":null,"valueOf":null}'), [1], true, 1.5, "1e400"]) {
    assert.equal(await compiled.supervisorConsoleMutationAllowed(actor, { action: "updateUser", id }), false);
    assert.ok(captured.params.includes(-1));
  }
  assert.equal(await compiled.supervisorConsoleMutationAllowed(actor, { action: "unsupported-future-action" }), false);
});
test("global console operations and destructive global catalogue edits require explicit global data authorization", () => {
  for (const action of ["saveInstitution", "saveSpecialty", "syncCatalogTemplates", "syncOfficialPrograms", "createNotification", "dispatchNotifications"]) assert.ok(policy.consoleActionPermissions(action).includes("data.all"), action);
  for (const entity of ["institution", "specialty", "notification"]) assert.ok(policy.consoleActionPermissions("deleteEntity", entity).includes("data.all"), entity);
  assert.equal(policy.consoleActionPermissions("saveCourse").includes("data.all"), false, "per-record policy, not blanket global access, authorizes course edits");
});
test("both clients hide global-only editing controls rather than displaying an actionable denied form", async () => {
  const web = await readFile(new URL("../components/admin-dashboard.tsx", import.meta.url), "utf8");
  const mobile = await readFile(new URL("../mobile/app/admin.tsx", import.meta.url), "utf8");
  assert.match(web, /\["institutions","specialties"\]\.includes\(active\).*can\(\["data\.all"\]\)/);
  assert.match(mobile, /\["institutions", "specialties"\]\.includes\(destinationId\).*capabilities\.can\(\["data\.all"\]\)/);
});
