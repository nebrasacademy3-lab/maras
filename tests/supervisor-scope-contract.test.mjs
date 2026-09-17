import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("configured supervisor assignments are an allow-list across rosters, console data and student profiles", async () => {
  const [scope, roster, consoleRoute, studentRoute, workspaceRoute] = await Promise.all([
    read("lib/supervisor-scope.ts"),
    read("app/api/admin/courses/[slug]/route.ts"),
    read("app/api/admin/console/route.ts"),
    read("app/api/admin/students/[email]/route.ts"),
    read("app/api/supervisor/workspace/route.ts"),
  ]);
  assert.match(scope, /supervisorAssignments/);
  assert.match(scope, /supervisorScopesAllow/);
  assert.match(scope, /scopes\.length > 0/);
  assert.match(roster, /getSupervisorScopes/);
  assert.match(roster, /هذه المادة خارج نطاق إشرافك المحدد/);
  assert.match(consoleRoute, /visibleCourses/);
  assert.match(consoleRoute, /visibleStudentRows/);
  assert.match(consoleRoute, /visibleOrderRows/);
  assert.match(consoleRoute, /visibleRequestRows/);
  assert.match(consoleRoute, /visibleReviewRows/);
  assert.match(consoleRoute, /visibleTicketRows/);
  assert.match(consoleRoute, /scopedSupervisor/);
  assert.match(studentRoute, /هذا الطالب خارج نطاق إشرافك المحدد/);
  assert.doesNotMatch(workspaceRoute, /scope\.assignments\.length === 0/);
  assert.match(workspaceRoute, /scope\.globalData/);
  assert.match(workspaceRoute, /scope\.user\.role === "admin"/);
  assert.match(workspaceRoute, /configured supervisor assignment is an allow-list/);
});
