import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const route = await readFile(new URL("../app/api/course-requests/route.ts", import.meta.url), "utf8");
const admin = await readFile(new URL("../app/api/admin/console/route.ts", import.meta.url), "utf8");

test("course requests enforce a 100MB aggregate attachment limit without a count limit", () => {
  assert.match(route, /const MAX_TOTAL_FILE_BYTES = 100 \* 1024 \* 1024/);
  assert.match(route, /form\.getAll\("files"\)/);
  assert.match(route, /totalFileBytes > MAX_TOTAL_FILE_BYTES/);
  assert.doesNotMatch(route, /files\.length > 5/);
});

test("admin request preparation persists the selected course and sends a direct material route", () => {
  assert.match(admin, /action === "prepareRequest"/);
  assert.match(admin, /preparedCourseSlug: course\.slug/);
  assert.match(admin, /actionUrl: `\/learn\/\$\{course\.slug\}`/);
  assert.match(admin, /actionLabel: "فتح المادة"/);
});
