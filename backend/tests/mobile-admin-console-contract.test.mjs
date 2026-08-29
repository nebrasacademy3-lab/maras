import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { INTERNAL_ACTION_OPTIONS } from "../lib/internal-action-route.ts";
import { ADMIN_ACTION_ROUTE_OPTIONS } from "../../mobile/src/lib/admin-action-routes.ts";

const backendRoot = new URL("..", import.meta.url);
const mobileRoot = new URL("../../mobile/", import.meta.url);
const readBackend = (relative) => readFile(new URL(relative, backendRoot), "utf8");
const readMobile = (relative) => readFile(new URL(relative, mobileRoot), "utf8");

test("Expo admin notification composer follows the complete campaign contract", async () => {
  const source = await readMobile("app/admin.tsx");
  assert.match(source, /audience:\s*targetedEmail \? "user" : notice\.audience/);
  assert.match(source, /values=\{\["public", "student", "supervisor", "admin", "user"\]\}/);
  assert.match(source, /<SearchPicker label="وجهة الزر داخل المنصة"/);
  assert.doesNotMatch(source, /<Field label="الرابط الداخلي"/);
  for (const field of ["actionLabel", "presentation", "pushEnabled", "startsAt", "expiresAt", "dismissible"]) {
    assert.match(source, new RegExp(`\\b${field}\\b`), `campaign composer omits ${field}`);
  }
  assert.match(source, /announcement:\s*source\.announcement/);
  assert.match(source, /update\("announcement", value\)/);
  assert.match(source, /التنبيه العام الثابت/);
});

test("Expo action picker is an exact copy of the server allowlist", () => {
  assert.deepEqual(
    ADMIN_ACTION_ROUTE_OPTIONS.map((item) => ({ value: item.key, label: item.label })),
    INTERNAL_ACTION_OPTIONS.map((item) => ({ value: item.value, label: item.label })),
  );
});

test("catalog uploads are awaited, restricted, and report partial failure", async () => {
  const source = await readMobile("app/admin.tsx");
  assert.match(source, /type:\s*\["image\/png", "image\/jpeg", "image\/webp"\]/);
  assert.match(source, /await api\("\/api\/admin\/logos",[\s\S]{0,300}await refresh\(\)/);
  assert.match(source, /await api\("\/api\/admin\/covers",[\s\S]{0,300}await refresh\(\)/);
  assert.match(source, /حُفظت الجهة، لكن تعذر رفع الشعار/);
  assert.match(source, /حُفظت المادة، لكن تعذر رفع الغلاف/);
  assert.match(source, /row\.institutionSlug === course\.institutionSlug && row\.status === "published"/);
  assert.match(source, /row\.role === "student" && row\.status === "active"/);
  assert.match(source, /course\.status === "published" && course\.university === row\.university/);
});

test("Expo content editor uses the unit and lesson API actions for create and edit", async () => {
  const source = await readMobile("app/admin.tsx");
  assert.match(source, /function ContentEditor/);
  assert.match(source, /action:\s*"saveUnit"/);
  assert.match(source, /id:\s*unit\.id \? Number\(unit\.id\) : undefined/);
  assert.match(source, /action:\s*"saveLesson"/);
  assert.match(source, /freePreview:\s*lesson\.freePreview/);
  assert.match(source, /values=\{\["draft", "published", "hidden"\]\}/);
});

test("managed catalog assets and request access transitions are safe on the server", async () => {
  const source = await readBackend("app/api/admin/console/route.ts");
  assert.match(source, /managedAssetInput\(requestedLogoUrl, `\/api\/logos\/\$\{slug\}`\)/);
  assert.match(source, /managedAssetInput\(requestedCoverImageUrl, `\/api\/covers\/\$\{slug\}`\)/);
  assert.match(source, /before\?\.sortOrder \|\| 0/);
  assert.match(source, /before\.status === "deleted"/);
  assert.match(source, /status === "available" && !matchedCourse/);
  assert.match(source, /preparedCourseSlug:\s*nextPreparedCourseSlug/);
  assert.match(source, /eq\(courseAccess\.source, "request"\)/);
  assert.match(source, /accessEmail = student\?\.email \|\| ""/);
  assert.match(source, /otherAvailableRequest/);
  assert.match(source, /key\.endsWith\("_enabled"\) \? cleaned\.toLowerCase\(\) : cleaned/);
  const requestHandlers = source.slice(source.indexOf('if (action === "prepareRequest")'), source.indexOf('if (action === "updateTicket")'));
  assert.equal(requestHandlers.match(/onConflictDoUpdate/g)?.length, 2,
    "both request transitions must resolve concurrent access inserts atomically");
  assert.equal(requestHandlers.match(/setWhere:\s*eq\(courseAccess\.source, "request"\)/g)?.length, 2,
    "request upserts may update request-owned access only");
  assert.equal(requestHandlers.match(/if \(!requestAccess\)/g)?.length, 2,
    "a conflicting paid or administrative access must be re-read explicitly");
  assert.match(requestHandlers, /competingAccess/);
  assert.match(requestHandlers, /eq\(courseAccess\.source, "request"\)/);
  assert.match(requestHandlers, /!accessIsActive\(competingAccess/);
  assert.match(requestHandlers, /لم نغيّر مصدره أو نعتمد الطلب شكليًا/);
  assert.match(requestHandlers, /student\.status !== "deleted"\) grantEmail = student\.email/);
  assert.match(requestHandlers, /student\.status === "active"\) studentEmail = student\.email/);
  const grantHandler = source.slice(source.indexOf('if (action === "grantAccess")'), source.indexOf('if (action === "prepareRequest")'));
  assert.doesNotMatch(grantHandler, /onConflictDoUpdate/,
    "an administrative grant must not overwrite paid, checkout, or request access provenance");
  assert.match(grantHandler, /existingAccess\.source !== "admin"/);
  assert.match(grantHandler, /لن تستبدله المنحة الإدارية/);
});

test("admin-only device appearance and service labels are described accurately in Arabic", async () => {
  const [admin, appearance] = await Promise.all([
    readMobile("app/admin.tsx"),
    readMobile("src/components/AppearanceSettings.tsx"),
  ]);
  assert.match(admin, /label:\s*"مظهر الجهاز"/);
  assert.match(admin, /payments:\s*"بوابة Tap للدفع"/);
  assert.match(admin, /\|\| "خدمة غير معروفة"/);
  assert.match(admin, /بانتظار إنشاء الدفع/);
  assert.match(appearance, /title="مظهر هذا الجهاز"/);
  assert.match(appearance, /تُحفظ الألوان وحجم النص على هذا الجهاز فقط/);
});
