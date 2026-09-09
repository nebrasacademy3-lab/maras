import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const compile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function load(path, mocks = {}) { const exports = {}; vm.runInNewContext(compile(read(path)), { exports, URL, console, require: (name) => { if (name in mocks) return mocks[name]; throw new Error("Unexpected import " + name); } }); return exports; }
const policy = load("src/lib/store-commerce.ts");
const flatten = (style) => Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flatten)) : style || {};
function nodes(node) { if (!node) return []; if (Array.isArray(node)) return node.flatMap(nodes); return [node, ...nodes(node.props?.children)]; }
const element = (type, props) => ({ type, props });

for (const platform of ["ios", "android"]) test(`${platform}: Expo Go and development show checkout while store releases remain reader`, () => {
  assert.equal(policy.resolveStoreMode({ platform, executionEnvironment: "storeClient", development: false, configuredMode: "reader" }), "direct");
  assert.equal(policy.resolveStoreMode({ platform, development: true, configuredMode: "reader" }), "direct");
  assert.equal(policy.resolveStoreMode({ platform, development: false, executionEnvironment: "standalone", configuredMode: "reader", readerPreview: true, distribution: "store" }), "reader");
  assert.equal(policy.resolveStoreMode({ platform, development: false, configuredMode: "direct", distribution: "internal" }), "direct");
  assert.equal(policy.resolveStoreMode({ platform, development: false, configuredMode: "direct", distribution: "store" }), "reader");
  assert.equal(policy.resolveStoreMode({ platform, development: false, configuredMode: "direct" }), "reader");
  assert.equal(policy.resolveStoreMode({ platform, development: true, executionEnvironment: "storeClient", configuredMode: "reader", readerPreview: true }), "reader");
});
test("web checkout is available by default and QA can explicitly select reader mode", () => {
  assert.equal(policy.resolveStoreMode({ platform: "web", development: false }), "direct");
  assert.equal(policy.resolveStoreMode({ platform: "web", development: false, configuredMode: "reader", readerPreview: true }), "reader");
});

function header(direct, isRTL, user = { id: 1 }) {
  const paths = [], modes = [], queries = [];
  const colors = { text: "#111", primary: "#155eef", surface: "#fff", border: "#ddd", danger: "#f00" };
  const module = load("src/components/AppHeader.tsx", {
    react: require("react"), "react/jsx-runtime": { jsx: element, jsxs: element },
    "@tanstack/react-query": { useQuery: (config) => { queries.push(config); return { data: config.queryKey[0] === "cart" ? { count: 3 } : { courseSlugs: ["math"] } }; } },
    "expo-router": { router: { push: (path) => paths.push(path), replace: (path) => paths.push(path), canGoBack: () => false } },
    "react-native": { Pressable: "Pressable", View: "View", StyleSheet: { create: (styles) => styles } },
    "@expo/vector-icons": { Ionicons: "Icon" }, "@/src/components/ScaledText": { ScaledText: "Text" }, "@/src/components/Brand": { BrandMark: "Brand" },
    "@/src/lib/api": { api: () => {}, STORE_COMMERCE_ENABLED: direct }, "@/src/providers/AuthProvider": { useAuth: () => ({ user }) },
    "@/src/providers/ThemeProvider": { useTheme: () => ({ colors, dark: true, setMode: (mode) => modes.push(mode) }) },
    "@/src/providers/LanguageProvider": { useLanguage: () => ({ isRTL, direction: isRTL ? "rtl" : "ltr", rowDirection: "row", t: (label) => "localized:" + label }) },
  }); return { render: module.AppHeader, paths, modes, queries };
}
for (const isRTL of [true, false]) test(`header keeps its three interactive icons in one row with RTL=${isRTL}`, () => {
  const runtime = header(true, isRTL);
  const tree = runtime.render({ title: "عنوان طويل جدًا للمادة الجامعية" });
  const all = nodes(tree);
  const toolbar = all.find((node) => node.props?.testID === "app-header-toolbar");
  const group = all.find((node) => node.props?.testID === "app-header-actions");
  assert.equal(flatten(toolbar.props.style).flexWrap, "nowrap");
  assert.equal(flatten(group.props.style).flexShrink, 0);
  assert.equal(flatten(group.props.style).flexWrap, "nowrap");
  assert.equal(group.props.children.length, 3);
  assert.equal(nodes(toolbar).some((node) => node.props?.testID === "app-header-title"), false, "long page titles cannot push an icon to the next line");
  const buttons = nodes(group).filter((node) => node.type === "Pressable");
  assert.deepEqual(buttons.map((node) => node.props.accessibilityLabel), ["localized:السلة", "localized:المفضلة", "localized:الإشعارات"]);
  for (const node of buttons) { assert.equal(flatten(node.props.style({ pressed: false })).width, 44); node.props.onPress(); }
  assert.deepEqual(runtime.paths, ["/cart", "/favorites", "/notifications"]);
});
test("reader header preserves three useful controls and never sends a cart query", () => {
  const runtime = header(false, true);
  const tree = runtime.render({});
  const group = nodes(tree).find((node) => node.props?.testID === "app-header-actions");
  assert.equal(group.props.children.length, 3);
  group.props.children[0].props.onPress();
  assert.equal(runtime.paths[0], "/(tabs)/learning");
  assert.equal(runtime.queries.find((query) => query.queryKey[0] === "cart").enabled, false);
});
test("auth appearance control is translated and toggles the real theme", () => {
  const runtime = header(true, true, null);
  const tree = runtime.render({ auth: true });
  const control = nodes(tree).find((node) => node.props?.accessibilityLabel === "localized:الوضع الفاتح");
  assert.ok(control); control.props.onPress(); assert.deepEqual(runtime.modes, ["light"]);
});

test("concurrent initialization registers exactly one installation device identity", async () => {
  let reads = 0, writes = 0, ids = 0, persisted = null; const identities = [];
  const runtime = load("src/lib/device.ts", {
    "expo-crypto": { randomUUID: () => { ids++; return "12345678-1234-1234-1234-123456789012"; } },
    "expo-device": { modelName: "iPhone" }, "react-native": { Platform: { OS: "ios" } },
    "expo-secure-store": { getItemAsync: async (key) => { assert.equal(key, "meras_device_id"); reads++; await Promise.resolve(); return persisted; }, setItemAsync: async (key, id) => { assert.equal(key, "meras_device_id"); assert.ok(id.startsWith("ios-")); persisted = id; writes++; }, AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "installation-only" },
    "@/src/lib/api": { setApiDeviceIdentity: (identity) => identities.push(identity) },
  });
  const results = await Promise.all(Array.from({ length: 10 }, () => runtime.ensureDeviceIdentity()));
  const repeated = await runtime.ensureDeviceIdentity();
  assert.equal(new Set(results.map((value) => value.id)).size, 1); assert.equal(repeated.id, results[0].id);
  assert.equal(reads, 2); assert.equal(writes, 1); assert.equal(ids, 1); assert.equal(identities.length, 1);
});

test("referral share cancellation and native failure do not record a successful share", async () => {
  const tree = ts.createSourceFile("referrals.tsx", read("app/referrals.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); let share;
  function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "share") share = node.initializer.getText(tree); ts.forEachChild(node, visit); } visit(tree); assert.ok(share);
  for (const action of ["dismissedAction", "sharedAction", "error"]) {
    const exports = {}, requests = [], feedback = [];
    vm.runInNewContext(compile("exports.share = " + share), { exports, sharing: false, data: { program: { enabled: true }, referral: { shareUrl: "https://example.test/r/code" } }, safeExternalLink: (url) => url, setSharing: () => {}, setFeedback: (message) => feedback.push(message), Share: { sharedAction: "sharedAction", share: async () => { if (action === "error") throw Error("cancelled by native UI"); return { action }; } }, api: async (...args) => requests.push(args), jsonBody: JSON.stringify });
    await assert.doesNotReject(() => exports.share());
    assert.equal(requests.length, action === "sharedAction" ? 1 : 0);
    if (action === "error") assert.ok(feedback.at(-1).includes("تعذرت المشاركة"));
  }
});

for (const failure of ["read", "write", "readback", "corrupt"]) test(`device identity fails closed on ${failure} and can retry safely`, async () => {
  let failing = true, persisted = failure === "corrupt" ? "bad" : null, attached = 0, writes = 0;
  class ApiError extends Error {}
  const runtime = load("src/lib/device.ts", {
    "expo-crypto": { randomUUID: () => "12345678-1234-1234-1234-123456789012" }, "expo-device": { modelName: "iPhone" }, "react-native": { Platform: { OS: "ios" } },
    "expo-secure-store": { getItemAsync: async () => { if (failing && failure === "read") throw Error("keychain unavailable"); if (failing && failure === "readback" && writes) return null; return persisted; }, setItemAsync: async (_key, value) => { writes++; if (failing && failure === "write") throw Error("write blocked"); persisted = value; } },
    "@/src/lib/api": { ApiError, setApiDeviceIdentity: () => { attached++; } },
  });
  await assert.rejects(() => runtime.ensureDeviceIdentity(), /تعذر حفظ هوية/);
  assert.equal(attached, 0, "an unpersisted identity is never sent to the backend");
  if (failure === "corrupt" || failure === "read") assert.equal(writes, 0);
  failing = false; if (failure === "corrupt") persisted = null;
  const recovered = await runtime.ensureDeviceIdentity();
  assert.equal(recovered.id, persisted); assert.equal(attached, 1);
});

test("admin replacement needs confirmation and sends the permanent registration ID and reason", async () => {
  const state = []; let index = 0, mutation; const calls = []; class ApiError extends Error {}
  const runtime = load("src/components/RegisteredDevices.tsx", {
    react: { ...require("react"), useState: (initial) => { const key = index++; if (!(key in state)) state[key] = initial; return [state[key], (value) => { state[key] = typeof value === "function" ? value(state[key]) : value; }]; } },
    "react/jsx-runtime": { jsx: element, jsxs: element },
    "react-native": { Modal: "Modal", View: "View", Pressable: "Pressable", KeyboardAvoidingView: "KeyboardAvoidingView", ScrollView: "ScrollView", Platform: { OS: "ios" }, StyleSheet: { create: (styles) => styles } },
    "@expo/vector-icons": { Ionicons: "Icon" }, "@/src/components/ScaledText": { ScaledText: "Text" }, "@/src/components/ui": { AppButton: "AppButton", Card: "Card", Field: "Field", SectionTitle: "SectionTitle" },
    "@/src/providers/AuthProvider": { useAuth: () => ({ user: { id: 1, role: "admin" } }) }, "@/src/providers/LanguageProvider": { useLanguage: () => ({ direction: "rtl", locale: "ar-SA" }) }, "@/src/providers/ThemeProvider": { useTheme: () => ({ colors: { primary: "blue", danger: "red" } }) },
    "@/src/lib/api": { ApiError, jsonBody: JSON.stringify, api: async (path, options) => { calls.push({ path, ...options }); return {}; } },
    "@tanstack/react-query": { useQueryClient: () => ({ invalidateQueries: async () => {} }), useQuery: () => ({ data: { deviceLimit: 2, registeredDevices: [{ id: 7, deviceLabel: "iPhone", platform: "ios", lastSeenAt: "2026-09-09" }, { id: 8, deviceLabel: "Old phone", platform: "ios", lastSeenAt: "2026-09-09", revokedAt: "2026-09-09" }] } }), useMutation: (options) => { mutation = options; return { isPending: false, reset: () => {}, mutate: async () => { await mutation.mutationFn(); await mutation.onSuccess(); } }; } },
  });
  const render = () => { index = 0; return runtime.RegisteredDevices({ studentEmail: "student@example.test" }); };
  let tree = render(); nodes(tree).find((node) => node.props?.title === "الأجهزة المعتمدة واستبدالها").props.onPress(); tree = render();
  const buttons = nodes(tree).filter((node) => node.type === "Pressable"); assert.equal(buttons.length, 1, "revoked devices have no replacement action"); buttons[0].props.onPress(); tree = render();
  assert.equal(nodes(tree).find((node) => node.props?.title === "تأكيد إيقاف اعتماد الجهاز").props.disabled, true);
  nodes(tree).find((node) => node.props?.label === "سبب الاستبدال").props.onChangeText("  استبدال الهاتف بطلب الطالب  "); tree = render();
  const confirm = nodes(tree).find((node) => node.props?.title === "تأكيد إيقاف اعتماد الجهاز"); assert.equal(confirm.props.disabled, false); await confirm.props.onPress();
  assert.equal(calls.length, 1); assert.equal(calls[0].path, "/api/admin/students/student%40example.test/devices"); assert.equal(calls[0].method, "DELETE"); assert.deepEqual(JSON.parse(calls[0].body), { deviceId: 7, reason: "استبدال الهاتف بطلب الطالب" });
});
