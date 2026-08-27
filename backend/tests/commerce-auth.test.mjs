import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("assistant is excluded from web and Expo admin surfaces", async () => {
  const [webEnhancements, mobileAssistant, webAdmin] = await Promise.all([
    read("components/deferred-enhancements.tsx"),
    read(new URL("../mobile/src/components/AssistantFab.tsx", root)),
    read("components/admin-dashboard.tsx"),
  ]);
  assert.match(webEnhancements, /pathname === "/);
  assert.match(webEnhancements, /!isAdmin && <DeferredAssistant/);
  assert.match(mobileAssistant, /route\.includes\("admin"\)/);
  assert.doesNotMatch(webAdmin, /<MerasAssistant/);
});

test("commerce controls use server-backed state and live badges", async () => {
  const [state, actions, header, mobileHeader, course] = await Promise.all([
    read("components/commerce-state.tsx"),
    read("components/course-actions.tsx"),
    read("components/site-header.tsx"),
    read(new URL("../mobile/src/components/AppHeader.tsx", root)),
    read(new URL("../mobile/app/course/[slug].tsx", root)),
  ]);
  assert.match(state, /syncCommerce/);
  assert.match(state, /setFavorite/);
  assert.match(state, /setCart/);
  assert.match(actions, /aria-pressed=\{isFavorite\}/);
  assert.match(actions, /is-favorite/);
  assert.match(actions, /is-added/);
  assert.match(header, /cartSlugs\.length/);
  assert.match(header, /favoriteSlugs\.length/);
  assert.match(mobileHeader, /cartCount/);
  assert.match(mobileHeader, /favoriteCount/);
  assert.match(course, /onMutate: async/);
  assert.match(course, /active: !inCart/);
});

test("auth headers expose the requested desktop and mobile layout", async () => {
  const [webAuth, mobileLogin, mobileRegister, mobileHeader] = await Promise.all([
    read("components/auth-shell.tsx"),
    read(new URL("../mobile/app/(auth)/login.tsx", root)),
    read(new URL("../mobile/app/(auth)/register.tsx", root)),
    read(new URL("../mobile/src/components/AppHeader.tsx", root)),
  ]);
  assert.match(webAuth, /<SiteHeader \/>/);
  assert.match(webAuth, /className="auth-page"/);
  assert.match(mobileLogin, /auth \/>/);
  assert.match(mobileRegister, /auth \/>/);
  assert.match(mobileHeader, /accessibilityLabel=\{dark \? "الوضع الفاتح" : "الوضع الليلي"\}/);
});
