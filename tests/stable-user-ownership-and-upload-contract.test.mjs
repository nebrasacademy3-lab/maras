import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) { return readFile(new URL("../" + path, import.meta.url), "utf8"); }

test("stable user ownership migration covers every account-scoped legacy email table", async () => {
  const schema = await source("db/schema.ts");
  for (const table of ["supportTickets","courseAccess","courseAccessEvents","lessonProgress","favorites","cartItems","lessonNotes","courseReviews","courseWaitlist","storeCourseGrants"]) {
    const start = schema.indexOf(`export const ${table} =`);
    assert.ok(start >= 0, table);
    assert.match(schema.slice(start, start + 1800), /userId:\s*integer\("user_id"\)/, table);
  }
  const migration = await source("drizzle/0037_stable_user_ownership.sql");
  assert.match(migration, /user_ownership_reviews/);
  const executable = migration.replace(/--[^\n]*/g, "");
  assert.doesNotMatch(executable, /FROM\s+"users"|email_change_requests|lower\(/i);
  assert.match(migration, /p\.access_owner=p\.order_owner/);
  for (const table of ["support_tickets","course_access","course_access_events","lesson_progress","favorites","cart_items","lesson_notes","course_reviews","course_waitlist","store_course_grants"]) {
    assert.match(migration, new RegExp(`FROM "${table}" WHERE "user_id" IS NULL`), table);
  }
  assert.match(migration, /store_transactions/);
  assert.match(migration, /course_access_owner_course_unique/);
});

test("student HTTP ownership paths no longer authorize by mutable session email", async () => {
  const files = [
    "app/api/cart/route.ts","app/api/favorites/route.ts","app/api/waitlist/route.ts",
    "app/api/progress/route.ts","app/api/reviews/route.ts","app/api/mobile/notes/route.ts",
    "app/api/support/route.ts","app/api/mobile/favorites/route.ts",
    "app/api/mobile/dashboard/route.ts","app/dashboard/page.tsx","app/api/mobile/account/route.ts",
  ];
  const tables = ["cartItems","favorites","courseWaitlist","lessonProgress","courseReviews","lessonNotes","supportTickets","courseAccess","storeCourseGrants"];
  for (const file of files) {
    const value = await source(file);
    for (const table of tables) {
      assert.doesNotMatch(value, new RegExp(`eq\\(${table}\\.userEmail,\\s*(?:user|current|fresh)\\.email`), file + ":" + table);
    }
  }
});

test("email change preserves historical snapshots instead of rewriting ownership by email", async () => {
  const value = await source("lib/email-change.ts");
  assert.doesNotMatch(value, /migrateEmailReferences/);
  for (const table of ["support_tickets","course_access","lesson_progress","favorites","cart_items","lesson_notes","course_reviews","course_waitlist","store_course_grants"]) {
    assert.doesNotMatch(value, new RegExp(`UPDATE ["']?${table}["']? SET ["']?user_email`), table);
  }
});

test("store purchase and order fulfillment use stable owner IDs for access, cart and waitlist", async () => {
  const store = await source("lib/store-purchases.ts");
  const fulfillment = await source("lib/order-fulfillment.ts");
  assert.doesNotMatch(store, /WHERE user_email=\$1 AND course_slug/);
  assert.match(store, /store_course_grants\(transaction_id,user_id,user_email/);
  assert.match(store, /course_access\(user_id,user_email/);
  assert.doesNotMatch(fulfillment, /eq\((?:courseAccess|cartItems|courseWaitlist)\.userEmail,\s*owner\.email\)/);
});

test("large uploads are bounded and direct video finalization verifies exact stored metadata", async () => {
  const direct = await source("app/api/admin/videos/direct/route.ts");
  const multipart = await source("lib/multipart-upload.ts");
  const client = await source("lib/upload-client.ts");
  assert.match(direct, /MAX_VIDEO_BYTES = 200 \* 1024 \* 1024/);
  assert.match(direct, /stored\.size !== sizeBytes/);
  assert.match(direct, /storedType && storedType !== contentType/);
  assert.match(direct, /normalizeStorageKey\(objectKey\)/);
  assert.match(multipart, /maxFileBytes/);
  assert.match(multipart, /maxTotalBytes/);
  assert.match(multipart, /boundedRequestBody/);
  assert.match(client, /Math\.min\(timeoutMs, 30 \* 60_000\)/);
  assert.match(client, /signal\?\.addEventListener\("abort"/);
});

test("resumable S3 multipart upload is not claimed or silently half-implemented", async () => {
  const storage = await source("lib/storage.ts");
  const direct = await source("lib/railway-direct-upload.ts");
  assert.doesNotMatch(storage + direct, /CreateMultipartUploadCommand|UploadPartCommand|CompleteMultipartUploadCommand/);
  // Current large-file support is one bounded presigned PUT plus exact HEAD/finalization checks.
  assert.match(direct, /PutObjectCommand/);
  assert.match(direct, /signedUploadTtlSeconds/);
});
