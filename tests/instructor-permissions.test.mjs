import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { isolated, eq, tables, database } from "./helpers/business-fixtures.mjs";
const policy = await isolated("../lib/staff-policy.ts");
const navigation = await isolated("../lib/admin-navigation.ts", policy);
const paths = ["/api/admin/instructors", "/api/admin/instructors/contracts", "/api/admin/instructors/contracts/1/download", "/api/admin/instructors/documents/1", "/api/admin/instructors/assignments", "/api/admin/instructors/assignments/1", "/api/admin/instructors/courses"];
test("team permissions are delegatable, shared with native, and do not grant staff/finance/student powers", async () => {
 assert.equal(policy.validStaffGrants(["instructors.view", "instructors.manage"]), true);
 for (const name of ["staff-policy.ts", "admin-navigation.ts"]) assert.equal(await readFile(new URL("../lib/" + name, import.meta.url), "utf8"), await readFile(new URL("../mobile/src/lib/" + name, import.meta.url), "utf8"));
 for (const grant of ["instructors.view", "instructors.manage"]) {
  const grants = new Set([grant]);
  for (const path of paths) {
   assert.ok(policy.permissionsCover(grants, policy.requiredRoutePermissions(path, "GET")));
   assert.ok(policy.permissionsCover(grants, policy.requiredRoutePermissions(path, "HEAD")));
   for (const method of ["POST", "PATCH", "DELETE", "PUT"]) assert.equal(policy.permissionsCover(grants, policy.requiredRoutePermissions(path, method)), grant === "instructors.manage");
  }
  for (const path of ["/api/admin/staff", "/api/admin/finance", "/api/admin/analytics", "/api/admin/students/a/devices", "/api/admin/course-resources"]) assert.equal(policy.permissionsCover(grants, policy.requiredRoutePermissions(path)), false);
  assert.equal(navigation.visibleAdminNavigation([grant], false).flatMap(g => g.items).some(i => i.id === "instructors"), true);
 }
 assert.deepEqual(policy.adminPagePermissions("/admin/instructors"), ["instructors.view"]);
});

test("real grant lookup enforces view/manage, MFA, revocation and role boundaries", async () => {
 let user = { id: 72, role: "supervisor", isPlatformOwner: false }, verified = false, proofs = 0;
 const db = database({ staffPermissions: [{ userId: 72, permission: "instructors.view" }] });
 const permissions = await isolated("../lib/permissions.ts", { ...policy, ...tables, eq, getDb: () => db });
 const security = await isolated("../lib/instructor-security.ts", { getSessionUser: async () => user, hasPermission: permissions.hasPermission, requireAdminStepUp: async () => { proofs++; if (!verified) throw new Error("MFA_REQUIRED"); } });
 const req = method => new Request("https://qa.example/api/admin/instructors", { method });
 assert.equal((await security.instructorAdmin(req("GET"))).id, 72);
 await assert.rejects(security.instructorAdmin(req("GET"), true), /MFA_REQUIRED/);
 verified = true; assert.equal((await security.instructorAdmin(req("GET"), true)).id, 72);
 for (const verb of ["POST", "DELETE", "PUT", "PATCH"]) await assert.rejects(security.instructorAdmin(req(verb), true), { code: "INSTRUCTOR_PERMISSION_REQUIRED" });
 assert.equal(proofs, 2, "denied permissions do not prompt or bypass MFA");
 db.rows.staffPermissions[0].permission = "instructors.manage";
 assert.equal((await security.instructorAdmin(req("GET"))).id, 72);
 assert.equal((await security.instructorAdmin(req("POST"))).id, 72);
 verified = false; await assert.rejects(security.instructorAdmin(req("POST")), /MFA_REQUIRED/);
 db.rows.staffPermissions.length = 0;
 await assert.rejects(security.instructorAdmin(req("GET")), { code: "INSTRUCTOR_PERMISSION_REQUIRED" });
 db.rows.staffPermissions.push({ userId: 72, permission: "instructors.manage" });
 for (const role of ["student", "instructor", "admin"]) {
  user = { ...user, role };
  await assert.rejects(security.instructorAdmin(req("GET")), { code: "INSTRUCTOR_PERMISSION_REQUIRED" });
 }
 user = { ...user, role: "admin", isPlatformOwner: true };
 assert.equal((await security.instructorAdmin(req("GET"))).id, 72);
 await assert.rejects(security.instructorAdmin(req("POST")), /MFA_REQUIRED/);
});
