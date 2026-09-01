import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("CI gates web and mobile production quality", async () => {
  const workflow = await read(".github/workflows/quality.yml");
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /node --test --test-concurrency=1 tests\/\*\.test\.mjs/);
  assert.match(workflow, /npm run typecheck/);
  assert.match(workflow, /working-directory: mobile/);
});

test("health readiness reports bounded service states without returning secrets", async () => {
  const health = await read("app/api/health/route.ts");
  assert.match(health, /databaseReadiness/);
  assert.match(health, /storageReadiness/);
  assert.match(health, /requiredConfiguration/);
  assert.match(health, /optionalConfiguration/);
  assert.match(health, /strongSecret\("SESSION_SECRET"\)/);
  assert.match(health, /scheduledTasks/);
  assert.match(health, /capabilities/);
  assert.match(health, /observeRequest/);
  assert.match(health, /Object\.values\(requiredConfiguration\)\.every/);
  assert.doesNotMatch(health, /Object\.values\(configuration\)\.every/);
  assert.match(health, /degraded \? "degraded" : "ready"/);
  assert.doesNotMatch(health, /message:\s*error|String\(error\)|error\.message/);
});

test("scheduled notification dispatch has an independent machine credential", async () => {
  const [api, route, script] = await Promise.all([
    read("lib/api.ts"),
    read("app/api/admin/notifications/dispatch/route.ts"),
    read("scripts/dispatch-notifications.sh"),
  ]);
  assert.match(api, /isScheduledTaskRequest/);
  assert.match(api, /SCHEDULED_TASK_TOKEN/);
  assert.match(api, /x-scheduled-task-token/);
  assert.match(route, /isScheduledTaskRequest\(request\)/);
  assert.doesNotMatch(route, /isAdminRequest/);
  assert.match(script, /SCHEDULED_TASK_TOKEN/);
  assert.doesNotMatch(script, /ADMIN_API_TOKEN/);
});

test("every API request receives a safe correlation identifier", async () => {
  const [proxy, observability, instrumentation] = await Promise.all([
    read("proxy.ts"),
    read("lib/observability.ts"),
    read("instrumentation.ts"),
  ]);
  assert.match(proxy, /NextResponse\.next\(\{ request: \{ headers: forwardedHeaders \} \}\)/);
  assert.match(proxy, /REQUEST_ID_HEADER/);
  assert.match(observability, /http\.request\.completed/);
  assert.match(instrumentation, /onRequestError/);
  assert.doesNotMatch(instrumentation, /error\.message/);
});

test("store builds cannot expose or call Tap checkout while direct builds retain it", async () => {
  const [api, cart, course, header, account, eas] = await Promise.all([
    read("mobile/src/lib/api.ts"),
    read("mobile/app/cart.tsx"),
    read("mobile/app/course/[slug].tsx"),
    read("mobile/src/components/AppHeader.tsx"),
    read("mobile/app/(tabs)/account.tsx"),
    read("mobile/eas.json"),
  ]);
  assert.match(api, /STORE_COMMERCE_ENABLED/);
  assert.match(api, /pathname === "\/api\/checkout"/);
  for (const surface of [cart, course, header, account]) assert.match(surface, /STORE_COMMERCE_ENABLED/);
  assert.match(eas, /"production"[\s\S]*"EXPO_PUBLIC_STORE_MODE": "reader"/);
  assert.match(eas, /"production-direct"[\s\S]*"EXPO_PUBLIC_STORE_MODE": "direct"/);
});
