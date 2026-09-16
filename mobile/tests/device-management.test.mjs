import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(import.meta.url), ts = require("typescript");
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
function load(path, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, console, URL, AbortController, require: name => { if (name in mocks) return mocks[name]; throw new Error(`Unexpected import ${name}`); } });
  return exports;
}
const policy = load("src/lib/device-access-policy.ts");
const nodes = node => !node ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
function harness(grants = ["students.devices.manage"], user = { id: 41, role: "supervisor" }) {
  const slots = [], refs = [], effects = [], dialogs = [], writes = [], queries = [], jobs = [];
  let cursor = 0, refCursor = 0, effectCursor = 0, mutationError = null;
  const snapshot = { deviceLimit: 2, serverTime: "2026-09-16T10:00:00Z", registeredDevices: [
    { id: 7, deviceLabel: "iPhone", platform: "ios", firstSeenAt: "2026-09-01", lastSeenAt: "2026-09-15", revokedAt: null, policyVersion: 3, returnPolicy: "blocked" },
    { id: 8, deviceLabel: "Old phone", platform: "android", firstSeenAt: "2026-09-01", lastSeenAt: "2026-09-14", revokedAt: "2026-09-15", policyVersion: 4, returnPolicy: "blocked" },
  ] };
  const hooks = { ...require("react"),
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
    useRef: initial => { const i = refCursor++; if (!(i in refs)) refs[i] = { current: initial }; return refs[i]; },
    useEffect: effect => { const i = effectCursor++; if (!(i in effects)) effects[i] = effect(); },
  };
  const element = (type, props) => typeof type === "function" ? type(props) : ({ type, props });
  const runtime = load("src/components/RegisteredDevices.tsx", {
    react: hooks, "react/jsx-runtime": { jsx: element, jsxs: element }, "react-native": { View: "View" },
    "@expo/vector-icons": { Ionicons: "Icon" }, "@/src/components/ScaledText": { ScaledText: "Text" },
    "@/src/components/ui": { AppButton: "Button", Card: "Card", Field: "Field", SectionTitle: "SectionTitle" },
    "@/src/lib/device-access-policy": policy,
    "@/src/providers/AuthProvider": { useAuth: () => ({ user }) },
    "@/src/providers/LanguageProvider": { useLanguage: () => ({ direction: "rtl", locale: "ar-SA" }) },
    "@/src/providers/ThemeProvider": { useTheme: () => ({ colors: { text: "text", textSoft: "soft", primary: "primary", border: "border", danger: "danger", success: "success" } }) },
    "@/src/lib/interaction-events": { MerasAlert: { alert: (title, message, buttons) => dialogs.push({ title, message, buttons }) } },
    "@/src/lib/api": { jsonBody: JSON.stringify, api: async (path, options) => { writes.push({ path, ...options }); return snapshot; } },
    "@tanstack/react-query": {
      useQueryClient: () => ({ setQueryData: () => {}, invalidateQueries: async () => {} }),
      useQuery: config => { queries.push(config); return { data: config.queryKey[0] === "admin-device-permissions" ? { permissions: grants, user: { isPlatformOwner: false } } : snapshot, isPending: false, isError: false, refetch: async () => {} }; },
      useMutation: config => ({ isPending: false, error: mutationError, reset: () => { mutationError = null; }, mutate: command => {
        const job = config.mutationFn(command).then(result => config.onSuccess(result)).catch(error => { mutationError = error; }); jobs.push(job); return job;
      } }),
    },
  });
  const render = (email = "student@example.test") => { cursor = 0; refCursor = 0; effectCursor = 0; return runtime.RegisteredDevices({ studentEmail: email }); };
  const button = (tree, title) => nodes(tree).find(node => node.type === "Button" && node.props.title === title);
  function expanded() { let tree = render(); button(tree, "أجهزة الطالب وسياسة العودة").props.onPress(); tree = render(); return tree; }
  return { render, button, expanded, nodes, dialogs, writes, queries, jobs, dispose: () => effects.forEach(cleanup => cleanup?.()), snapshot };
}

test("native device permissions hide the entire section and disable private queries when ungranted", () => {
  for (const grants of [[], ["students.manage"], ["students.view"]]) {
    const h = harness(grants); assert.equal(h.render(), null);
    const deviceQueries = h.queries.filter(query => query.queryKey[0] === "registered-devices");
    assert.ok(deviceQueries.every(query => query.enabled === false)); assert.equal(h.writes.length, 0); h.dispose();
  }
});
test("a read-only device supervisor sees status without management actions", () => {
  const h = harness(["students.devices.view"]), tree = h.expanded();
  assert.equal(nodes(tree).filter(node => node.type === "Button" && node.props.title === "إدارة الجهاز").length, 0);
  assert.equal(nodes(tree).filter(node => node.type === "Field").length, 0); h.dispose();
});
test("device mutation waits for the styled confirmation and preserves cancellation without a request", async () => {
  const h = harness(); let tree = h.expanded();
  nodes(tree).find(node => node.type === "Button" && node.props.title === "إدارة الجهاز").props.onPress(); tree = h.render();
  assert.equal(h.button(tree, "مراجعة وتأكيد").props.disabled, true);
  nodes(tree).find(node => node.type === "Field" && node.props.label === "سبب الإجراء").props.onChangeText("  بطلب الطالب بعد التحقق  "); tree = h.render();
  h.button(tree, "مراجعة وتأكيد").props.onPress(); assert.equal(h.dialogs.length, 1); assert.equal(h.writes.length, 0);
  assert.match(h.dialogs[0].message, /يبقى الجهاز معتمدًا/);
  h.dialogs[0].buttons.find(button => button.style === "cancel").onPress?.(); assert.equal(h.writes.length, 0);
  assert.equal(nodes(h.render()).find(node => node.type === "Field" && node.props.label === "سبب الإجراء").props.value, "  بطلب الطالب بعد التحقق  ");
  h.button(h.render(), "مراجعة وتأكيد").props.onPress(); h.dialogs[1].buttons.find(button => button.text === "تأكيد الإجراء").onPress(); await Promise.all(h.jobs);
  assert.equal(h.writes.length, 1); assert.equal(h.writes[0].method, "POST"); assert.equal(h.writes[0].path, "/api/admin/students/student%40example.test/devices");
  assert.deepEqual(JSON.parse(h.writes[0].body), { action: "end_sessions", deviceId: 7, expectedRevision: 3, reason: "بطلب الطالب بعد التحقق" }); h.dispose();
});
test("a revoked device offers explicit allow-return without requesting automatic enrollment", async () => {
  const h = harness(); let tree = h.expanded();
  nodes(tree).filter(node => node.type === "Button" && node.props.title === "إدارة الجهاز")[1].props.onPress(); tree = h.render();
  assert.ok(h.button(tree, "✓ " + policy.DEVICE_ACTION_LABELS.allow_return));
  nodes(tree).find(node => node.type === "Field" && node.props.label === "سبب الإجراء").props.onChangeText("سمح المدير بطلب عودة جديد"); tree = h.render();
  h.button(tree, "مراجعة وتأكيد").props.onPress(); assert.match(h.dialogs[0].message, /دون إعادة الاعتماد/);
  h.dialogs[0].buttons.find(button => button.text === "تأكيد الإجراء").onPress(); await Promise.all(h.jobs);
  assert.deepEqual(JSON.parse(h.writes[0].body), { action: "allow_return", deviceId: 8, expectedRevision: 4, reason: "سمح المدير بطلب عودة جديد" }); h.dispose();
});
test("a confirmation belonging to an unmounted student view never submits", async () => {
  const h = harness(); let tree = h.expanded(); nodes(tree).find(node => node.type === "Button" && node.props.title === "إدارة الجهاز").props.onPress(); tree = h.render();
  nodes(tree).find(node => node.type === "Field" && node.props.label === "سبب الإجراء").props.onChangeText("طلب قبل تغيير الحساب");
  h.button(h.render(), "مراجعة وتأكيد").props.onPress(); h.dispose();
  h.dialogs[0].buttons.find(button => button.text === "تأكيد الإجراء").onPress(); await Promise.all(h.jobs); assert.equal(h.writes.length, 0);
});
test("private device query keys include both the acting account and selected student", () => {
  const h = harness(); h.expanded(); const config = h.queries.findLast(query => query.queryKey[0] === "registered-devices");
  assert.deepEqual(Array.from(config.queryKey), ["registered-devices", 41, "student@example.test"]); h.dispose();
});
