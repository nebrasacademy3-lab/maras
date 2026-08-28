import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveAuthReturnRoute } from "../src/lib/authReturnRoute.ts";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("learning-room login return route accepts safe slugs only", () => {
  assert.deepEqual(resolveAuthReturnRoute("/learn/discrete-math"), {
    href: { pathname: "/learn/[slug]", params: { slug: "discrete-math" } },
    path: "/learn/discrete-math",
  });
  for (const unsafe of ["/learn/", "/learn/../admin", "/learn/math?next=/admin", "/learn/%2F%2Fevil.test", "https://evil.test/learn/math"]) {
    assert.equal(resolveAuthReturnRoute(unsafe), null, unsafe);
  }
});

test("push logout always cancels registration and cleans OS and local token state", async () => {
  const push = await source("src/lib/pushRegistration.ts");
  const auth = await source("src/providers/AuthProvider.tsx");
  assert.match(push, /registrationGeneration \+= 1/);
  assert.match(push, /controller\.abort\(\)/);
  assert.match(push, /Notifications\.unregisterForNotificationsAsync\(\)/);
  assert.match(push, /SecureStore\.deleteItemAsync\(PUSH_TOKEN_KEY\)/);
  assert.match(auth, /cancelPendingPushRegistrations\(\);[\s\S]*revokeRememberedExpoPushToken\(\)/);
});

test("announcement dismissals and query cache are scoped and reset by identity", async () => {
  const campaign = await source("src/components/AnnouncementCampaign.tsx");
  const cache = await source("src/providers/RealtimeSyncProvider.tsx");
  assert.match(campaign, /queryKey: \["announcements", user\?\.id \?\? "guest"\]/);
  assert.match(campaign, /dismissalState\.identity === identity \? dismissalState\.ids : EMPTY_DISMISSED/);
  assert.match(campaign, /current\.identity === identity \? current\.ids : \[\]/);
  assert.match(cache, /USER_SCOPED_QUERY_ROOTS[\s\S]*"announcements"/);
});

test("student-facing status fallbacks never expose raw API enums", async () => {
  for (const path of ["app/requests.tsx", "app/orders.tsx", "app/support.tsx", "app/supervisor.tsx"]) {
    const text = await source(path);
    assert.match(text, /حالة غير معروفة/, `${path} needs an Arabic fallback`);
    assert.doesNotMatch(text, /(?:labels|orderLabels)\[[^\]]+\]\s*\|\|\s*(?:status|[A-Za-z_$][\w$]*\.status)\b/, `${path} exposes a raw status fallback`);
  }
});
