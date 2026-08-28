import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const backendRoot = new URL("..", import.meta.url);
const mobileRoot = new URL("../../mobile/", import.meta.url);
const readBackend = (relative) => readFile(new URL(relative, backendRoot), "utf8");
const readMobile = (relative) => readFile(new URL(relative, mobileRoot), "utf8");
const controlKeys = [
  "registration_enabled",
  "purchases_enabled",
  "course_requests_enabled",
  "support_enabled",
  "onboarding_enabled",
  "maintenance_message",
];

test("web and Expo admin surfaces expose every operational platform control", async () => {
  const [settings, webAdmin, mobileAdmin] = await Promise.all([
    readBackend("lib/platform-settings.ts"),
    readBackend("components/admin-dashboard.tsx"),
    readMobile("app/admin.tsx"),
  ]);
  for (const key of controlKeys) {
    assert.match(settings, new RegExp(`\\b${key}\\b`), `${key} is missing from the settings contract`);
    assert.match(webAdmin, new RegExp(`\\b${key}\\b`), `${key} is missing from the web admin UI`);
    assert.match(mobileAdmin, new RegExp(`\\b${key}\\b`), `${key} is missing from the Expo admin UI`);
  }
});

test("Expo admin resynchronizes settings and never submits unrelated dirty fields", async () => {
  const mobileAdmin = await readMobile("app/admin.tsx");
  assert.match(mobileAdmin, /useState\(\(\)\s*=>\s*communicationSettings\(data\.settings\)\)/);
  assert.match(mobileAdmin, /useEffect\(\(\)\s*=>\s*\{[\s\S]{0,700}\},\s*\[data\.settings\]\)/,
    "Expo admin does not merge refreshed server settings into its draft");
  assert.match(mobileAdmin, /if\s*\(nextDirty\[key\]\s*&&\s*nextSettings\[key\]\s*!==\s*incoming\[key\]\)\s*continue/,
    "a realtime settings refresh can overwrite an unsaved local edit");
  assert.match(mobileAdmin, /serverSettingsRef\.current\s*=\s*incoming/);
  assert.match(mobileAdmin, /value\s*===\s*serverSettingsRef\.current\[key\][^\n]*delete nextDirty\[key\];\s*else nextDirty\[key\]\s*=\s*true/,
    "editing a setting does not track whether it differs from the server payload");

  const operationKeys = /const operationSettingKeys[^=]*=\s*\[([^\]]+)\]/.exec(mobileAdmin)?.[1] || "";
  for (const key of controlKeys) {
    assert.match(operationKeys, new RegExp(`["']${key}["']`), `operation settings group omits ${key}`);
  }
  assert.doesNotMatch(operationKeys, /whatsapp_|support_email|social_/,
    "saving operational controls can overwrite an unsaved contact draft");

  const contactKeys = /const contactSettingKeys[^=]*=\s*\[([^\]]+)\]/.exec(mobileAdmin)?.[1] || "";
  assert.match(contactKeys, /whatsapp_number/);
  assert.match(contactKeys, /support_email/);
  assert.match(contactKeys, /social_(?:x|instagram)/);
  assert.doesNotMatch(contactKeys, /registration_enabled|purchases_enabled|maintenance_message/,
    "saving contact settings can overwrite an unsaved operational draft");

  assert.match(mobileAdmin, /changedKeys\s*=\s*keys\.filter\([^\n]*dirtySettingsRef\.current\[key\]/);
  assert.match(mobileAdmin, /Object\.fromEntries\(changedKeys\.map\(/,
    "settings save still submits clean or unrelated keys");
  assert.match(mobileAdmin, /settingsRef\.current\[key\]\s*===\s*values\[key\][^\n]*delete (?:next|nextDirty)\[key\]/,
    "an edit made while a save is in flight can be cleared as if it were saved");
  assert.match(mobileAdmin, /disabled=\{!operationSettingsChanged\}[^\n]*saveSettingsGroup\(operationSettingKeys/);
  assert.match(mobileAdmin, /disabled=\{!contactSettingsChanged\}[^\n]*saveSettingsGroup\(contactSettingKeys/);
});

test("Expo feature surfaces explain disabled operations before the API rejects them", async () => {
  const surfaces = [
    ["app/(auth)/register.tsx", "registration"],
    ["app/cart.tsx", "purchases"],
    ["app/course/[slug].tsx", "purchases"],
    ["app/requests.tsx", "courseRequests"],
    ["app/support.tsx", "support"],
  ];
  for (const [relative, feature] of surfaces) {
    const source = await readMobile(relative);
    assert.match(source, /usePlatformControls/, `${relative} does not consume live platform controls`);
    assert.match(source, new RegExp(`enabled\\(["']${feature}["']\\)`), `${relative} does not gate ${feature}`);
  }
});

test("first-run onboarding is not shown again unconditionally after registration", async () => {
  const [entry, onboarding, registration, sync] = await Promise.all([
    readMobile("app/index.tsx"),
    readMobile("app/onboarding.tsx"),
    readMobile("app/(auth)/register.tsx"),
    readMobile("src/lib/onboardingSync.ts"),
  ]);
  assert.match(entry, /FIRST_RUN_ONBOARDING_KEY/);
  assert.match(onboarding, /completeGuestOnboarding|syncOnboardingCompletion/);
  assert.match(sync, /setItemAsync\(FIRST_RUN_ONBOARDING_KEY/);
  assert.match(registration, /FIRST_RUN_ONBOARDING_KEY/);
  assert.match(registration, /getItemAsync\(FIRST_RUN_ONBOARDING_KEY/);
  assert.doesNotMatch(registration, /await register\([^;]+;\s*router\.replace\(["']\/onboarding["']\)\s*;/s,
    "registration still routes every new account through the same onboarding a second time");
});

test("web support keeps history readable but blocks reply and reopen mutations when controls fail closed", async () => {
  const support = await readBackend("components/support-form.tsx");
  assert.match(support, /supportMutationsDisabled\s*=\s*controls\.loading \|\| Boolean\(controls\.error\) \|\| !controls\.support/);
  assert.match(support, /const sendReply[\s\S]{0,260}if \(supportMutationsDisabled\)/);
  assert.match(support, /const changeStatus[\s\S]{0,240}if \(supportMutationsDisabled\)/);
  assert.match(support, /disabled=\{supportMutationsDisabled\}[\s\S]{0,300}aria-label=["']رد على المحادثة["']/);
  assert.match(support, /disabled=\{supportMutationsDisabled \|\| replyBusy/);
  assert.match(support, /disabled=\{supportMutationsDisabled\}[\s\S]{0,300}onClick=\{\(\) => void changeStatus\(["']reopen["']\)\}/);
  assert.match(support, /loadTickets\(\)/,
    "support history is not retained as a read-only surface while mutations are disabled");
});
