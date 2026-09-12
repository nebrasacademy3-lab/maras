import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function load(path, mocks = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(compile(read(path)), { exports, URL, URLSearchParams, Headers, AbortController, FormData, Blob, setTimeout, clearTimeout, ...globals, require: (name) => { if (name in mocks) return mocks[name]; throw new Error("Unexpected import " + name); } });
  return exports;
}
const progressHelpers = load("src/lib/playback-progress.ts");

test("leaving a lesson persists the last JS snapshot after the native player was released", () => {
  const source = read("app/lesson/[courseSlug]/[lessonId].tsx");
  const tree = ts.createSourceFile("lesson.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  function find(node) { if (ts.isCallExpression(node) && node.expression.getText(tree) === "useEffect" && node.arguments[0]?.getText(tree).includes('setInterval(save')) effect = node.arguments[0].getText(tree); ts.forEachChild(node, find); }
  find(tree);
  assert.ok(effect);
  const requests = [];
  let background;
  let interval;
  const snapshot = { ready: true, snapshot: progressHelpers.playbackSnapshot(92.9, 100) };
  const exported = {};
  vm.runInNewContext(compile("exports.mount = " + effect), { exports: exported, courseSlug: "cs101", lessonId: "lesson1", loading: false, user: { id: 1 }, preparedPlayback: { courseSlug: "cs101", lessonId: "lesson1" }, progress: snapshot, progressFromSnapshot: progressHelpers.progressFromSnapshot, player: new Proxy({}, { get() { throw new Error("Native shared object released"); } }), api: (path, init) => { requests.push({ path, ...JSON.parse(init.body) }); return Promise.resolve({}); }, jsonBody: JSON.stringify, setInterval: (callback) => { interval = callback; return 1; }, clearInterval: () => {}, AppState: { addEventListener: (_name, callback) => { background = callback; return { remove() {} }; } } });
  const cleanup = exported.mount();
  interval(); background("background");
  assert.doesNotThrow(cleanup);
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[2], { path: "/api/progress", courseSlug: "cs101", lessonId: "lesson1", watchedSeconds: 92, completed: true });
  snapshot.ready = false;
  cleanup();
  assert.equal(requests.length, 3, "an unloaded source cannot overwrite saved progress with zero");
});

test("invalid video values never create negative or non-finite progress", () => {
  for (const [position, duration] of [[-4, 20], [NaN, Infinity], [1000, 100], [89.9, 100]]) {
    const payload = progressHelpers.progressFromSnapshot(progressHelpers.playbackSnapshot(position, duration));
    assert.equal(Number.isFinite(payload.watchedSeconds), true);
    assert.ok(payload.watchedSeconds >= 0);
  }
  assert.equal(progressHelpers.progressFromSnapshot({ currentTime: 90, duration: 100 }).completed, true);
  assert.equal(progressHelpers.progressFromSnapshot({ currentTime: 89.9, duration: 100 }).completed, false);
  assert.equal(progressHelpers.progressFromSnapshot({ currentTime: 100, duration: 0 }).completed, false);
});

const direction = load("src/lib/text-direction.ts");
const flatten = (style) => Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flatten)) : style || {};
function textComponents(isRTL = true, platform = "web") {
  const mocks = { react: { default: require("react") }, "react/jsx-runtime": { jsx: (type, props) => ({ type, props }) }, "react-native": { Platform: { OS: platform }, Text: "Text", TextInput: "TextInput", StyleSheet: { flatten } }, "@/src/providers/ThemeProvider": { useTheme: () => ({ fontScale: 1 }) }, "@/src/providers/LanguageProvider": { useLanguage: () => ({ isRTL, t: (value) => value }) }, "@/src/lib/text-direction": direction };
  return { ...load("src/components/ScaledText.tsx", mocks), ...load("src/components/ScaledTextInput.tsx", mocks) };
}
test("Arabic paragraphs stay RTL even when a course code or English product name appears first", () => {
  const { ScaledText } = textComponents();
  for (const children of ["CS101 شرح المادة", "Google تسجيل الدخول", "شرح الدرس", ["CS101 ", "المادة"]]) {
    const style = flatten(ScaledText({ children }).props.style);
    assert.equal(style.textAlign, "right"); assert.equal(style.writingDirection, "rtl");
  }
  assert.equal(flatten(ScaledText({ children: "name@example.com", style: { writingDirection: "ltr" } }).props.style).textAlign, "left");
  assert.equal(flatten(textComponents(false).ScaledText({ children: "My courses" }).props.style).textAlign, "left");
});
test("code cells preserve centered alignment and Arabic empty inputs start on the right", () => {
  const { ScaledTextInput } = textComponents();
  const code = ScaledTextInput({ value: "123456", keyboardType: "number-pad", style: { textAlign: "center" } });
  assert.equal(flatten(code.props.style).textAlign, "center");
  assert.equal(code.props.textAlign, "center");
  const placeholder = ScaledTextInput({ value: "", placeholder: "البريد الإلكتروني", keyboardType: "email-address" });
  assert.equal(flatten(placeholder.props.style).textAlign, "right");
  const email = ScaledTextInput({ value: "me@example.com", keyboardType: "email-address" });
  assert.equal(flatten(email.props.style).textAlign, "left");
  assert.equal(flatten(email.props.style).writingDirection, "ltr");
});

function notifications(platform, environment) {
  let imports = 0;
  let handlers = 0;
  const notifications = { setNotificationHandler: () => { handlers++; }, setBadgeCountAsync: async () => {}, dismissAllNotificationsAsync: async () => {} };
  const mocks = { "expo-constants": { __esModule: true, default: { executionEnvironment: environment }, ExecutionEnvironment: { StoreClient: "storeClient" } }, "react-native": { Platform: { OS: platform } } };
  Object.defineProperty(mocks, "expo-notifications", { get: () => { imports++; return notifications; } });
  return { module: load("src/lib/native-notifications.ts", mocks), imports: () => imports, handlers: () => handlers };
}
test("Expo Go and web never import unavailable native push code", async () => {
  for (const [platform, environment] of [["ios", "storeClient"], ["android", "storeClient"], ["web", "standalone"]]) {
    const runtime = notifications(platform, environment);
    assert.equal(await runtime.module.loadNativeNotifications(), null);
    await runtime.module.clearNativeNotificationBadge();
    await runtime.module.setNativeNotificationBadge(7);
    assert.equal(runtime.imports(), 0);
  }
});
test("native builds initialize notification handlers only once", async () => {
  const runtime = notifications("ios", "standalone");
  const [first, second] = await Promise.all([runtime.module.loadNativeNotifications(), runtime.module.loadNativeNotifications()]);
  assert.equal(first, second); assert.equal(runtime.imports(), 1); assert.equal(runtime.handlers(), 1);
});

function apiHarness(fetch, extra = {}) {
  return load("src/lib/api.ts", { "expo-constants": { default: { expoConfig: { extra: { apiUrl: "https://example.test", storeMode: "direct", storeDistribution: "internal" } } } }, "react-native": { Platform: { OS: "ios" } }, "@/src/lib/store-commerce": load("src/lib/store-commerce.ts") }, { fetch, ...extra });
}
test("API requests and uploads cannot send credentials outside the platform", async () => {
  let calls = 0;
  const api = apiHarness(async () => { calls++; return { ok: true, text: async () => "{}" }; });
  api.setApiToken("session-private");
  for (const url of ["https://attacker.test/api", "http://example.test/api", "https://user:password@example.test/api"]) {
    await assert.rejects(() => api.api(url), /غير موثوق/);
    await assert.rejects(() => api.apiUpload(url, new FormData()), /غير موثوق/);
  }
  assert.equal(calls, 0);
  await api.api("/api/auth/me"); assert.equal(calls, 1);
});
test("an already cancelled upload never opens a network request", async () => {
  let opened = false;
  const api = apiHarness(async () => {}, { XMLHttpRequest: class { constructor() { opened = true; } } });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => api.apiUpload("/api/upload", new FormData(), { signal: controller.signal }), /إلغاء/);
  assert.equal(opened, false);
});
test("a successful response with invalid JSON is reported as a service error", async () => {
  const api = apiHarness(async () => ({ ok: true, text: async () => "<html>maintenance</html>" }));
  await assert.rejects(() => api.api("/api/auth/me"), (error) => error.status === 502);
});
test("notification links with malformed escaping do not crash navigation", () => {
  const pushed = [];
  const routes = load("src/lib/notification-routing.ts", { "expo-router": { router: { push: (path) => pushed.push(path) } }, "react-native": { Linking: { openURL: async () => {} } } });
  for (const route of ["/learn/%E0%A4%A", "/courses/%", "/r/%2Fadmin", "/study-tools-attacker", "/learn/%00"]) assert.doesNotThrow(() => routes.openNotificationRoute(route));
  assert.equal(pushed.length, 0);
  routes.openNotificationRoute("/courses/cs101");
  assert.equal(pushed[0].pathname, "/course/[slug]");
  assert.equal(pushed[0].params.slug, "cs101");
});


test("protected downloads reject external origins before requesting files or credentials", async () => {
  let requested = false;
  const api = apiHarness(async () => { requested = true; });
  const downloads = load("src/lib/downloads.ts", { "expo-file-system/legacy": {}, "react-native": { Platform: { OS: "web" } }, "@/src/lib/api": api }, { fetch: async () => { requested = true; } });
  await assert.rejects(() => downloads.downloadProtectedFile({ path: "https://attacker.test/private.pdf", fileName: "notes.pdf" }), /غير موثوق/);
  assert.equal(requested, false);
});

function authHarness(api, identity = async () => {}) {
  const states = [];
  let index = 0;
  let cleared = 0;
  let identityReady = false; const deleted = [];
  const react = require("react");
  const hooks = { __esModule: true, default: react, ...react, useState: (initial) => { const key = index++; states[key] = initial; return [initial, (value) => { states[key] = value; }]; }, useRef: (current) => ({ current }), useEffect: () => {}, useCallback: (callback) => callback, useMemo: (callback) => callback() };
  class ApiError extends Error { constructor(status) { super("API error"); this.status = status; } }
  const runtime = load("src/providers/AuthProvider.tsx", { "react": hooks, "react/jsx-runtime": { jsx: (type, props) => ({ type, props }) }, "expo-secure-store": { deleteItemAsync: async (key) => { deleted.push(key); }, setItemAsync: async () => {}, AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "private" }, "@tanstack/react-query": { useQueryClient: () => ({ clear: () => { cleared++; }, cancelQueries: async () => {} }) }, "react-native": { Platform: { OS: "ios" } }, "@/src/lib/api": { api: (...args) => api(ApiError, ...args), ApiError, jsonBody: JSON.stringify, setApiToken: () => {} }, "@/src/lib/device": { ensureDeviceIdentity: async () => { await identity(); identityReady = true; } }, "@/src/lib/social-auth": {} });
  return { auth: runtime.AuthProvider({ children: null }).props.value, states, cleared: () => cleared, deleted, identityReady: () => identityReady };
}
test("a late account refresh cannot restore a session after logout", async () => {
  let resolveRefresh;
  const pending = new Promise((resolve) => { resolveRefresh = resolve; });
  const runtime = authHarness((_error, path) => path === "/api/auth/me" ? pending : Promise.resolve({ ok: true }));
  const refresh = runtime.auth.refresh();
  await runtime.auth.logout();
  resolveRefresh({ user: { id: 99, email: "old@example.test" } });
  assert.equal(await refresh, null);
  assert.equal(runtime.states[0], null);
  assert.equal(runtime.states[1], null);
});
test("an expired session clears cached private account data", async () => {
  const runtime = authHarness((ApiError) => Promise.reject(new ApiError(401)));
  await runtime.auth.refresh();
  assert.equal(runtime.cleared(), 1);
  assert.equal(runtime.states[0], null);
  assert.equal(runtime.states[1], null);
});


test("notification routes separate fragments, queries and safely decoded university slugs", () => {
  const routes = load("src/lib/notification-routing.ts", { "expo-router": { router: {} }, "react-native": { Linking: {} } });
  for (const suffix of ["#preview", "?source=assistant#preview"]) {
    const course = routes.resolveMobileRoute("/courses/math" + suffix);
    assert.equal(course.pathname, "/course/[slug]"); assert.equal(course.params.slug, "math");
    const university = routes.resolveMobileRoute("/universities/" + encodeURIComponent("جامعة-الملك") + suffix);
    assert.equal(university.pathname, "/university/[slug]"); assert.equal(university.params.slug, "جامعة-الملك");
  }
  assert.equal(routes.resolveMobileRoute("/dashboard?view=courses#progress"), "/(tabs)/learning");
  assert.equal(routes.resolveMobileRoute("/dashboard?view=orders#latest"), "/orders");
  const learn = routes.resolveMobileRoute("/learn/math#lesson");
  assert.equal(learn.pathname, "/learn/[slug]"); assert.equal(learn.params.slug, "math");
  const conversation = routes.resolveMobileRoute("/study-tools?conversation=abc123#messages");
  assert.equal(conversation.params.id, "abc123");
});
test("route parsing rejects traversal, malformed and multiply encoded separators", () => {
  const routes = load("src/lib/notification-routing.ts", { "expo-router": { router: {} }, "react-native": { Linking: {} } });
  for (const path of ["/courses/..", "/courses/%2e%2e", "/courses/%2E/../admin", "/courses/a%2fb", "/courses/%252Fadmin", "/universities/%5cadmin", "/learn/%3Fadmin", "/courses/%E0%A4%A", "/courses/math%00", "//attacker.test", "/\\attacker.test"]) assert.equal(routes.parseInternalLink(path), null, path);
});
test("assistant actions use the shared route resolver and retain policy fragments", async () => {
  const routes = load("src/lib/notification-routing.ts", { "expo-router": { router: {} }, "react-native": { Linking: {} } });
  const source = read("app/assistant.tsx");
  const tree = ts.createSourceFile("assistant.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let action;
  function find(node) { if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "openAction") action = node.initializer.getText(tree); ts.forEachChild(node, find); }
  find(tree); assert.ok(action);
  const pushed = []; const opened = []; const exported = {};
  vm.runInNewContext(compile("exports.openAction = " + action), { exports: exported, ...routes, router: { push: (route) => pushed.push(route) }, Linking: { openURL: async (url) => opened.push(url) }, absoluteUrl: (path) => "https://example.test" + path, isRTL: true, setMessages: () => {} });
  await exported.openAction("/universities/uni-a#majors");
  await exported.openAction("/dashboard?view=orders#latest");
  await exported.openAction("/learn/math#preview");
  await exported.openAction("/terms#privacy");
  await exported.openAction("/courses/%252fadmin");
  assert.equal(pushed.length, 3); assert.equal(pushed[0].pathname, "/university/[slug]"); assert.equal(pushed[0].params.slug, "uni-a"); assert.equal(pushed[1], "/orders"); assert.equal(pushed[2].pathname, "/learn/[slug]");
  assert.deepEqual(opened, ["https://example.test/terms#privacy"]);
});

// React Native 0.86 native paragraph renderers invert physical alignment when
// layoutDirection is RTL; web CSS does not. Exercise each actual wrapper path.
for (const platform of ["ios", "android", "web"]) test(`Arabic content and fields remain physically right aligned on ${platform}`, () => {
  const { ScaledText, ScaledTextInput } = textComponents(true, platform);
  for (const children of ["شرح المادة", "CS101 شرح المادة", ["Google ", "تسجيل الدخول"], "١٢٣ درسًا"]) {
    const style = flatten(ScaledText({ children }).props.style);
    const physicalAlignment = platform !== "web" && style.direction === "rtl" ? (style.textAlign === "right" ? "left" : "right") : style.textAlign;
    assert.equal(physicalAlignment, "right");
    assert.equal(style.writingDirection, "rtl");
  }
  const input = flatten(ScaledTextInput({ value: "شرح المادة" }).props.style);
  assert.equal(input.direction, platform === "web" ? "rtl" : "ltr");
  assert.equal(input.textAlign, "right");
  assert.equal(input.writingDirection, "rtl");
  for (const style of [{ textAlign: "center" }, { textAlign: "justify" }]) assert.equal(flatten(ScaledText({ children: "شرح", style }).props.style).textAlign, style.textAlign);
  assert.equal(flatten(textComponents(false, platform).ScaledText({ children: "My courses" }).props.style).textAlign, "left");
});

test("password login and registration initialize identity before API and logout preserves installation ID", async () => {
  for (const method of ["login", "register"]) {
    let runtime;
    runtime = authHarness((_error, path) => { if (path.includes(method)) assert.equal(runtime.identityReady(), true); return Promise.resolve({ user: { id: 7 }, token: "session" }); });
    await runtime.auth[method]({ email: "a@example.test", password: "long-enough" });
    await runtime.auth.logout();
    assert.equal(runtime.deleted.includes("meras_device_id"), false);
    assert.ok(runtime.deleted.length > 0, "logout still clears the session token");
  }
});

test("failed device persistence prevents every password and OAuth authentication request", async () => {
  let requests = 0;
  const runtime = authHarness(() => { requests++; return Promise.resolve({}); }, async () => { throw Error("secure storage unavailable"); });
  await assert.rejects(() => runtime.auth.login({ identifier: "a@example.test", password: "long-enough" }), /secure storage/);
  await assert.rejects(() => runtime.auth.register({ email: "a@example.test", password: "long-enough" }), /secure storage/);
  await assert.rejects(() => runtime.auth.socialLogin("google"), /secure storage/);
  assert.equal(requests, 0);
});
