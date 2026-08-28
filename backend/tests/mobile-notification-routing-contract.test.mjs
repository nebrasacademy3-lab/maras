import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const backendRoot = new URL("..", import.meta.url);
const mobileRoot = new URL("../../mobile/", import.meta.url);
const readBackend = (relative) => readFile(new URL(relative, backendRoot), "utf8");
const readMobile = (relative) => readFile(new URL(relative, mobileRoot), "utf8");

function localImports(source) {
  return [...source.matchAll(/from\s+["']@\/src\/([^"']+)["']/g)].map((match) => match[1]);
}

async function readMobileModule(specifier) {
  for (const extension of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    try { return await readMobile(`src/${specifier}${extension}`); } catch { /* Try the next supported source extension. */ }
  }
  throw new Error(`cannot read shared Expo module @/src/${specifier}`);
}

function assertMapped(source, serverRoute, appRoute, label) {
  const from = serverRoute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const to = appRoute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(
    source,
    new RegExp(`["']${from}["'][\\s\\S]{0,320}["']${to}["']`),
    `${label} is not mapped to ${appRoute}`,
  );
}

test("in-app notices and push taps share the complete Expo route mapper", async () => {
  const [noticeScreen, pushHook, webhook, requestRoute] = await Promise.all([
    readMobile("app/notifications.tsx"),
    readMobile("src/hooks/usePushNotifications.ts"),
    readBackend("app/api/webhooks/tap/route.ts"),
    readBackend("app/api/course-requests/route.ts"),
  ]);

  assert.match(webhook, /actionUrl:\s*["']\/dashboard\?view=learning["']/);
  assert.match(webhook, /route:\s*["']\/learning["']/);
  assert.match(requestRoute, /route:\s*["']\/supervisor["']/);

  const noticeImports = new Set(localImports(noticeScreen));
  const sharedSpecifier = localImports(pushHook).find((specifier) => noticeImports.has(specifier) && specifier !== "lib/api");
  assert.ok(sharedSpecifier, "notification screen and push hook duplicate routing instead of sharing one mapper");
  const mapper = await readMobileModule(sharedSpecifier);

  assertMapped(mapper, "/learning", "/(tabs)/learning", "Tap push learning route");
  assertMapped(mapper, "/supervisor", "/supervisor", "supervisor request push route");
  assertMapped(mapper, "/admin", "/admin", "admin notification route");
  assert.match(
    mapper,
    /(?:["']learning["']|\blearning)\s*:[\s\S]{0,120}["']\/\(tabs\)\/learning["']/,
    "dashboard?view=learning still falls through to the Expo home tab",
  );
  assert.match(
    mapper,
    /(?:["']account["']|\baccount)\s*:[\s\S]{0,120}["']\/\(tabs\)\/account["']/,
    "dashboard?view=account does not open the Expo account tab",
  );
  assert.match(mapper, /!value\.startsWith\(["']\/["']\)[\s\S]{0,160}value\.startsWith\(["']\/\/["']\)/,
    "notification mapper does not reject external or protocol-relative actions");
});
