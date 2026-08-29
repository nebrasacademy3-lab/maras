import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(join(here, "..", relative), "utf8");

const settings = await read("lib/platform-settings.ts");
const admin = await read("components/admin-dashboard.tsx");
const home = await read("app/page.tsx");
const assistantApi = await read("app/api/assistant/route.ts");
const requestApi = await read("app/api/course-requests/route.ts");
const registerApi = await read("app/api/auth/register/route.ts");
const checkoutApi = await read("app/api/checkout/route.ts");
const mobileHome = await read("../mobile/app/(tabs)/index.tsx");
const mobileWelcome = await read("../mobile/app/(auth)/welcome.tsx");
const mobileTabs = await read("../mobile/app/(tabs)/_layout.tsx");

test("admin-controlled public appearance fields are shared by web and mobile", () => {
  for (const key of ["home_hero_kicker", "home_hero_title", "home_hero_highlight", "home_hero_subtitle", "mobile_welcome_title", "mobile_welcome_subtitle"]) {
    assert.match(settings, new RegExp(key));
    assert.match(admin, new RegExp(key));
  }
  assert.match(home, /settings\.home_hero_title/);
  assert.match(mobileHome, /settings\?\.home_hero_title/);
  assert.match(mobileWelcome, /mobile_welcome_title/);
});

test("admin feature switches are enforced at the API and app navigation layers", () => {
  for (const key of ["assistant_enabled", "course_requests_enabled", "guest_browsing_enabled", "student_registration_enabled", "payments_enabled"]) assert.match(settings, new RegExp(key));
  assert.match(assistantApi, /settingEnabled\(settings\.assistant_enabled\)/);
  assert.match(requestApi, /settingEnabled\(settings\.course_requests_enabled\)/);
  assert.match(mobileTabs, /guest_browsing_enabled === "false"/);
  assert.match(registerApi, /settingEnabled\(settings\.student_registration_enabled\)/);
  assert.match(checkoutApi, /settingEnabled\(settings\.payments_enabled\)/);
});
