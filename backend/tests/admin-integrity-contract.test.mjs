import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const backendRoot = new URL("..", import.meta.url);
const mobileRoot = new URL("../../mobile/", import.meta.url);
const readBackend = (relative) => readFile(new URL(relative, backendRoot), "utf8");
const readMobile = (relative) => readFile(new URL(relative, mobileRoot), "utf8");

function actionBlock(source, action) {
  const marker = `if (action === "${action}")`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `missing ${action} action`);
  const next = source.indexOf("\n  if (action === ", start + marker.length);
  return source.slice(start, next < 0 ? source.length : next);
}

function functionBlock(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `missing ${name} function`);
  const next = source.indexOf("\nfunction ", start + marker.length);
  return source.slice(start, next < 0 ? source.length : next);
}

test("request preparation never links directly to learning without course access", async () => {
  const route = await readBackend("app/api/admin/console/route.ts");
  for (const action of ["prepareRequest", "updateRequest"]) {
    const block = actionBlock(route, action);
    if (!/\/learn\//.test(block)) continue;
    assert.match(block, /courseAccess/, `${action} emits a /learn link without consulting or granting course access`);
    assert.match(
      block,
      /(?:insert|select)[\s\S]{0,180}\(courseAccess\)|(?:insert|select)\(courseAccess\)/,
      `${action} mentions courseAccess but does not perform an access operation`,
    );
  }
});

test("admin API preserves every item in returned multi-course orders", async () => {
  const route = await readBackend("app/api/admin/console/route.ts");

  assert.match(route, /\borderItems\b/, "admin API does not read normalized order items");
  const normalizedItemQuery = /inArray\(orderItems\.orderNumber,\s*orderNumbers\)/.test(route);
  const allItemsQuery = /db\.select\(\)\.from\(orderItems\)(?![^;\n]*\.limit\()/.test(route);
  assert.ok(
    normalizedItemQuery || allItemsQuery,
    "admin API truncates or does not scope order items, so returned orders can silently lose courses",
  );
  assert.match(route, /orders:\s*orderRows\.map\(/, "admin API returns legacy single-course order rows unchanged");
  assert.match(route, /courseSlugs\s*:/, "admin API omits the complete course slug list");
  assert.match(route, /items\s*:/, "admin API omits item-level prices and course titles");
});

test("web admin displays normalized multi-course orders", async () => {
  const webAdmin = await readBackend("components/admin-dashboard.tsx");

  const webOverview = functionBlock(webAdmin, "Overview");
  const webOrders = functionBlock(webAdmin, "Orders");
  const webOrderHelper = functionBlock(webAdmin, "orderCourses");
  assert.match(webAdmin, /type OrderRow = \{[^}]*courseSlugs\??:/s);
  assert.match(webOrderHelper, /row\.(?:items|courseSlugs)/, "web order helper ignores normalized multi-course data");
  assert.match(webOverview, /row\.(?:items|courseSlugs)|orderCourses\(row/, "web admin overview still displays only row.courseSlug");
  assert.match(webOrders, /row\.(?:items|courseSlugs)|orderCourses\(row/, "web admin orders table still displays only row.courseSlug");
});

test("Expo admin displays normalized multi-course orders", async () => {
  const mobileAdmin = await readMobile("app/admin.tsx");

  const mobileCommerce = functionBlock(mobileAdmin, "Commerce");
  assert.match(mobileAdmin, /orders:\s*\{[^}]*courseSlugs\??:/s, "Expo admin order type is still single-course only");
  assert.match(mobileCommerce, /row\.(?:items|courseSlugs)/, "Expo admin still displays only row.courseSlug");
});

test("future-dated notifications are not recorded as pushed without a dispatcher", async () => {
  const route = await readBackend("app/api/admin/console/route.ts");
  const block = actionBlock(route, "createNotification");
  assert.match(block, /requestedPush/, "requested push intent is not distinguished from actual dispatch");
  assert.match(block, /new Date\(startsAt\)\.getTime\(\) <= Date\.now\(\)/, "future schedules are not excluded from immediate push dispatch");
  const stored = /pushEnabled\s*[,}]/.exec(block);
  const dispatched = /if \(pushEnabled\) await sendPushNotification/.exec(block);
  assert.ok(stored && dispatched, "the same actual-dispatch flag must control storage and sending");
  assert.ok(stored.index < dispatched.index, "push dispatch state must be decided before sending");
});

test("machine admin and upload tokens require strong, separate secrets", async () => {
  const [api, videoUpload] = await Promise.all([
    readBackend("lib/api.ts"),
    readBackend("app/api/admin/videos/route.ts"),
  ]);
  assert.match(
    api,
    /(?:expected|ADMIN_API_TOKEN)[^;\n]{0,160}(?:\.length\s*(?:>=\s*32|<\s*32)|strong|valid)/i,
    "ADMIN_API_TOKEN is accepted without an enforced minimum strength",
  );
  assert.match(
    videoUpload,
    /(?:uploadSecret|ADMIN_UPLOAD_TOKEN)[^;\n]{0,200}(?:\.length\s*(?:>=\s*32|<\s*32)|strong|valid)/i,
    "ADMIN_UPLOAD_TOKEN is accepted without an enforced minimum strength",
  );
  assert.match(videoUpload, /ADMIN_API_TOKEN/, "video upload does not compare its token with the management token");
  assert.match(
    videoUpload,
    /(?:uploadSecret|ADMIN_UPLOAD_TOKEN)[\s\S]{0,240}(?:!==|!secretEquals|different|separat)[\s\S]{0,120}(?:ADMIN_API_TOKEN|management|adminSecret)/i,
    "the upload token is not required to differ from ADMIN_API_TOKEN",
  );
});
