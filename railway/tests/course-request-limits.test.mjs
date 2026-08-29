import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const route = await readFile(new URL("../app/api/course-requests/route.ts", import.meta.url), "utf8");
const admin = await readFile(new URL("../app/api/admin/console/route.ts", import.meta.url), "utf8");

test("course requests stream attachments with aggregate, file, and count limits", () => {
  assert.match(route, /const MAX_TOTAL_FILE_BYTES = 100 \* 1024 \* 1024/);
  assert.match(route, /parseStoredMultipart\(request/);
  assert.match(route, /maxTotalBytes: MAX_TOTAL_FILE_BYTES/);
  assert.match(route, /maxFileBytes: MAX_FILE_BYTES/);
  assert.match(route, /maxFiles: MAX_FILES/);
  assert.doesNotMatch(route, /request\.formData\(\)/);
});

test("admin request preparation persists the selected course and sends a direct material route", () => {
  assert.match(admin, /action === "prepareRequest"/);
  assert.match(admin, /preparedCourseSlug: course\.slug/);
  assert.match(admin, /actionUrl: `\/learn\/\$\{course\.slug\}`/);
  assert.match(admin, /actionLabel: "فتح المادة"/);
});
