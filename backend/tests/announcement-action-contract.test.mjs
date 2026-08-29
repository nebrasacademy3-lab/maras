import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";
import { INTERNAL_ACTION_OPTIONS, normalizeInternalActionPath } from "../lib/internal-action-route.ts";

const root = new URL("..", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");
const mobileRouteSource = await read("../mobile/src/lib/notificationRoute.ts");
const mobileRouteModule = ts.transpileModule(mobileRouteSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { resolveNotificationRoute } = await import(`data:text/javascript;base64,${Buffer.from(mobileRouteModule).toString("base64")}`);

test("announcement actions accept only canonical web/native destinations", () => {
  for (const option of INTERNAL_ACTION_OPTIONS) {
    assert.equal(normalizeInternalActionPath(option.value), option.value, `admin option is invalid: ${option.value}`);
    assert.ok(resolveNotificationRoute(option.value), `admin option has no native destination: ${option.value}`);
  }
  assert.equal(normalizeInternalActionPath("/courses/cs-101"), "/courses/cs-101");
  assert.equal(normalizeInternalActionPath("/universities/ksu"), "/universities/ksu");
  assert.equal(normalizeInternalActionPath("/learn/cs-101"), "/learn/cs-101");
  assert.ok(resolveNotificationRoute("/courses/cs-101"));
  assert.ok(resolveNotificationRoute("/universities/ksu"));
  assert.ok(resolveNotificationRoute("/learn/cs-101"));
  assert.equal(normalizeInternalActionPath("/dashboard?view=%72equests"), "/dashboard?view=requests");

  for (const invalid of [
    "https://evil.example/courses",
    "//evil.example",
    "/\\evil.example",
    "/requests",
    "/unknown",
    "/dashboard?view=unknown",
    "/dashboard?view=orders&next=/admin",
    "/support#reply",
    "/learn/%",
    "/learn/../admin",
    "/courses/a/b",
    "/support\u0000",
  ]) assert.equal(normalizeInternalActionPath(invalid), null, `unsafe action was accepted: ${invalid}`);
});

test("campaign API validates actions and repairs unsafe legacy rows", async () => {
  const [adminApi, publicApi, campaign] = await Promise.all([
    read("app/api/admin/console/route.ts"),
    read("app/api/public/announcements/route.ts"),
    read("components/announcement-campaign.tsx"),
  ]);
  assert.match(adminApi, /normalizeInternalActionPath\(requestedActionUrl\)/);
  assert.match(adminApi, /!dismissible && !actionUrl/);
  assert.match(publicApi, /visibleNotificationFilter\(user, now\)/);
  assert.match(publicApi, /eq\(notificationsDb\.audience, ["']public["']\)/);
  assert.match(publicApi, /lte\(notificationsDb\.startsAt, now\)/);
  assert.match(publicApi, /gt\(notificationsDb\.expiresAt, now\)/);
  assert.match(publicApi, /dismissible:\s*row\.dismissible \|\| !actionUrl/);
  assert.match(campaign, /onClick=\{\(\) => close\(item\)\}/);
  assert.match(campaign, /item\.dismissible \|\| !normalizeInternalActionPath\(item\.actionUrl\)/);
});

test("Expo never traps the user in a non-dismissible campaign with an unsafe legacy action", async () => {
  const mobileCampaign = await read("../mobile/src/components/AnnouncementCampaign.tsx");
  assert.match(mobileCampaign, /resolveNotificationRoute\(item\.actionUrl\)/,
    "Expo campaign navigation bypasses the shared native route allowlist");
  assert.match(mobileCampaign, /item\.dismissible \|\| Boolean\(resolveNotificationRoute\(item\.actionUrl\)\)/,
    "an unsafe legacy campaign can still render as a non-dismissible Expo modal");
  assert.doesNotMatch(mobileCampaign, /return url as never/,
    "Expo campaigns still cast arbitrary server paths into router destinations");
  assert.match(mobileCampaign, /const identity = user \? `user:\$\{user\.id\}` : ["']guest["']/);
  assert.match(mobileCampaign, /dismissalState\.identity === identity \? dismissalState\.ids : EMPTY_DISMISSED/,
    "a dismissal from the previous account can hide the same announcement for a new account");
  assert.match(mobileCampaign, /setDismissalState\(\(current\) => \(\{ identity, ids: new Set\(current\.identity === identity \? current\.ids : \[\]\)\.add\(id\) \}\)\)/,
    "closing a campaign after an account change can reuse the previous identity's dismissals");
  assert.match(mobileCampaign, /queryKey:\s*\[["']announcements["'],\s*user\?\.id \?\? ["']guest["']\]/,
    "campaign query cache is shared by guest and authenticated identities");
});

test("admin composer and history use the canonical action contract", async () => {
  const admin = await read("components/admin-dashboard.tsx");
  assert.match(admin, /INTERNAL_ACTION_OPTIONS\.map/);
  assert.match(admin, /const href=normalizeInternalActionPath\(row\.actionUrl\)/);
  assert.doesNotMatch(admin, /placeholder=["']\/courses أو \/requests["']/);
  assert.doesNotMatch(admin, /<Link href=\{row\.actionUrl\}/);
});
