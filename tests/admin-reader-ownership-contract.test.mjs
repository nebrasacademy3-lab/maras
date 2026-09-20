import { nativeSource } from "./helpers/native-source.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const source = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("administrative rosters correlate students and scope predicates through stable IDs", async () => {
  const text = await source("app/api/admin/courses/[slug]/route.ts");
  for (const table of ["courseAccess", "courseWaitlist"]) {
    assert.ok(text.includes(`eq(users.id, ${table}.userId)`));
    assert.ok(text.includes(`scopedStudentSql(scopeId, ${table}.userId, "id")`));
    assert.ok(!text.includes(`eq(users.email, ${table}.userEmail)`));
  }
  assert.doesNotMatch(text, /scopedStudentSql\([^\n]*user_email/);
});

test("support metrics and overview counters use the same stable-ID scope as ticket lists", async () => {
  const metrics = await source("app/api/admin/support/metrics/route.ts");
  const overview = await source("app/api/admin/console/route.ts");
  assert.ok(metrics.includes('supportTickets.userId, "id"'));
  assert.ok(overview.includes('scopedStudentSql(scopeId, sql`support_tickets.user_id`, "id")'));
  assert.ok(!overview.includes('scopedStudentSql(scopeId, sql`support_tickets.user_email`)'));
});


test("support metrics enforce the action permission before reading scoped data", async () => {
  for (const role of ["supervisor", "student"]) {
    const route = await nativeSource("app/api/admin/support/metrics/route.ts", {
      getSessionUser: async () => ({ id: 11, role }), roleAllowed: (_user, roles) => roles.includes(role),
      ADMIN_PERMISSIONS: { SUPPORT_MANAGE: "support.manage" }, hasPermission: async () => false,
      getDb: () => { throw new Error("unauthorized ticket lookup"); },
      jsonError: (error, status) => Response.json({ error }, { status }),
    });
    assert.equal((await route.GET(new Request("https://maras-qa.example/api/admin/support/metrics"))).status, 403);
  }
});
