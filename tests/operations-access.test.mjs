import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { nativeSource } from "./helpers/native-source.mjs";
const require = createRequire(import.meta.url), ts = require("typescript");
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const contract = await nativeSource("lib/operations-contract.ts");
const policy = await nativeSource("lib/staff-policy.ts");
const jsx = (type, props, key) => ({ type, props: props || {}, key });
function compiled(path, mocks, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { exports, console, URL, AbortController, DOMException, Error, Date, ...globals, require: name => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
    if (name in mocks) return mocks[name];
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    throw new Error("Unexpected component dependency: " + name);
  } }, { filename: path });
  return exports;
}
function nodes(tree, result = []) {
  if (tree == null || typeof tree === "boolean") return result;
  if (Array.isArray(tree)) { for (const node of tree) nodes(node, result); return result; }
  if (typeof tree !== "object") { result.push(tree); return result; }
  if (typeof tree.type === "function") return nodes(tree.type(tree.props), result);
  result.push(tree); nodes(tree.props?.children, result); return result;
}
function setup({ native = true, permissions = ["operations.manage", "data.all"], owner = false, userId = 501 } = {}) {
  const queries = [], requests = [], callbacks = [], stateWrites = [];
  const state = { permissions, owner, userId, operations: { geminiVerification: Object.fromEntries(contract.GEMINI_VERIFICATION_METRICS.map((item, i) => [item.key, i + 1])), waitlist: {}, bundles: {}, queues: {} } };
  const can = required => state.owner || policy.permissionsCover(new Set(state.permissions), required);
  let index = 0, refIndex = 0; const refs = [], effects = [];
  const react = {
    useMemo: fn => fn(), useCallback: fn => fn, useRef: value => refs[refIndex++] ||= { current: value },
    useEffect: effect => effects.push(effect),
    useState: value => { const current = index++; return [!native && current === 6 ? state.operations : !native && current === 7 ? false : value, next => stateWrites.push({ current, next })]; },
  };
  const capability = ({ all, children }) => can(all) ? children : null;
  const api = async (path, init) => { requests.push({ path, init }); return state.operations; };
  const shared = {
    react: { __esModule: true, default: react, ...react },
    "@/components/admin-access": { useAdminAccess: () => ({ permissions: state.permissions, owner: state.owner, can }) },
    "@/components/admin-capability": { AdminCapability: capability },
    "@/components/searchable-select": { SearchableSelect: "select" },
    "@/components/admin-mfa-notice": { AdminMfaNotice: "MfaNotice", isAdminStepUpMessage: () => false, isAdminStepUpResponse: () => false },
    "@/components/realtime-sync": { useRealtimeSync: () => {} },
    "@/lib/operations-contract": contract,
    "@/lib/admin-client": { adminFetch: async (path, init) => { requests.push({ path, init }); if(state.transport)return state.transport(path,init); return { ok: true, json: async () => state.operations }; } },
    "@/src/components/AdminCapability": { AdminCapability: capability },
    "@/src/lib/admin-capabilities": { useAdminCapabilities: () => {
      const permissions=[...state.permissions], owner=state.owner, grants=new Set(permissions);
      return {permissions,owner,can:required=>owner||policy.permissionsCover(grants,required)};
    } },
    "@/src/lib/interaction-events": { MerasAlert: {}, promptNative: async () => null },
    "@/src/providers/AuthProvider": { useAuth: () => ({ user: { id: state.userId, role: "supervisor" } }) },
    "@/src/components/admin-student-actions": { AdminStudentActions: "StudentActions" },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "@tanstack/react-query": { useQuery: settings => { queries.push(settings); return { data: settings.queryKey.at(-1) === "summary" ? state.operations : undefined, isLoading: false, isError: false }; }, useQueryClient: () => ({ invalidateQueries: async () => {} }) },
    "react-native": { StyleSheet: { create: value => value }, View: "View" },
    "@/src/components/SearchPicker": { SearchChoice: "SearchChoice" },
    "@/src/components/ScaledText": { ScaledText: "Text" },
    "@/src/components/ScaledTextInput": { ScaledTextInput: "TextInput" },
    "@/src/components/ui": Object.fromEntries(["AppButton", "Card", "EmptyState", "Field", "LoadingState", "SectionTitle"].map(name => [name, name])),
    "@/src/lib/api": { api, getApiToken: () => "synthetic-user-" + state.userId, ApiError: class extends Error {}, isAdminStepUpError: () => false, jsonBody: JSON.stringify },
    "@/src/providers/ThemeProvider": { useTheme: () => ({ colors: {} }) },
    "@/src/lib/operations-contract": contract,
  };
  const component = compiled(native ? "mobile/src/components/AdminCenters.tsx" : "components/admin-operations-center.tsx", shared, { window: { setTimeout: fn => { callbacks.push(fn); return 1; }, clearTimeout: () => {} } });
  const render = () => { index = 0; refIndex = 0; queries.length = 0; effects.length = 0; const output=nodes(native ? component.AdminOperations({}) : component.AdminOperationsCenter({ adminName: "Synthetic operator" })); for(const effect of effects)effect(); return output; };
  return { state, queries, requests, callbacks, stateWrites, render, component };
}
test("web/native operation vocabulary is byte-identical and permissions match actual server routes", () => {
  assert.equal(read("lib/operations-contract.ts"), read("mobile/src/lib/operations-contract.ts"));
  for (const row of Object.values(contract.OPERATIONS_PANELS)) assert.deepEqual(row.permissions, policy.requiredRoutePermissions(row.endpoint));
  for (const row of Object.values(contract.OPERATIONS_TASKS)) assert.deepEqual(row.permissions, policy.requiredRoutePermissions(row.endpoint, "POST"));
  assert.equal(contract.GEMINI_VERIFICATION_METRICS.length, 8);
  assert.equal(new Set(contract.GEMINI_VERIFICATION_METRICS.map(item => item.key)).size, 8);
});
test("native operations only enables the granted query and forwards its abort signal", async () => {
  const f = setup(); const output = f.render();
  assert.deepEqual(f.queries.map(query => query.enabled), [true, false, false]);
  const signal = new AbortController().signal;
  await f.queries[0].queryFn({ signal });
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].path, contract.OPERATIONS_PANELS.automation.endpoint); assert.equal(f.requests[0].init.signal, signal);
  const buttons = output.filter(node => node.type === "AppButton");
  assert.deepEqual(buttons.map(button => button.props.title), ["فحص المرفقات"]);
  for (const metric of contract.GEMINI_VERIFICATION_METRICS) assert.ok(output.includes(metric.label));
});
test("native operational cache is scoped to actor, grants and owner state", () => {
  const f = setup(); f.render(); const original = JSON.stringify(f.queries[0].queryKey);
  f.state.userId++; f.render(); assert.notEqual(JSON.stringify(f.queries[0].queryKey), original);
  const actorChanged = JSON.stringify(f.queries[0].queryKey);
  f.state.permissions.push("support.manage"); f.render(); assert.notEqual(JSON.stringify(f.queries[0].queryKey), actorChanged); assert.equal(f.queries[1].enabled, true);
  const grantsChanged = JSON.stringify(f.queries[0].queryKey);
  f.state.owner = true; f.render(); assert.notEqual(JSON.stringify(f.queries[0].queryKey), grantsChanged); assert.ok(f.queries.every(query => query.enabled));
});
test("revoked native access cannot display cached metrics or execute an old action", async () => {
  const f = setup(); const original = f.render(); const scan = original.find(node => node.type === "AppButton" && node.props.title === "فحص المرفقات");
  f.state.permissions = []; f.render();
  scan.props.onPress(); await Promise.resolve(); assert.equal(f.requests.length, 0);
  const revoked = f.render(); assert.ok(f.queries.every(query => !query.enabled));
  assert.ok(revoked.some(node => node.type === "EmptyState")); assert.equal(revoked.includes("إثباتات صالحة"), false);
});
test("an actor switch prevents replaying a native action captured for the previous user", async () => {
  const f = setup(); const original = f.render(); const scan = original.find(node => node.type === "AppButton" && node.props.title === "فحص المرفقات");
  f.state.userId++;
  scan.props.onPress(); await Promise.resolve(); assert.equal(f.requests.length, 0);
});
test("web operations defaults to the permitted queue and does not offer forbidden panels or dispatch", () => {
  const f = setup({ native: false }); const output = f.render();
  const labels = output.filter(node => node.type === "button").flatMap(node => nodes(node.props.children).filter(item => typeof item === "string"));
  assert.ok(labels.includes("الأتمتة والطوابير"));
  for (const forbidden of ["التحويل والاحتفاظ", "تشغيل الدعم وSLA", "ملف الامتثال", "تنبيهات السلة والتجديد والإطلاق", "إرسال Push المستحق"]) assert.equal(labels.includes(forbidden), false);
  assert.ok(labels.includes("فحص المرفقات المعلقة"));
  for (const item of contract.GEMINI_VERIFICATION_METRICS) assert.ok(output.includes(item.label));
});
test("web owner sees all panels while a permission change remounts and clears old state", () => {
  const f = setup({ native: false, owner: true });
  const before = f.component.AdminOperationsCenter({ adminName: "Synthetic operator" });
  const output = f.render(), labels = output.filter(node => node.type === "button").flatMap(node => nodes(node.props.children).filter(item => typeof item === "string"));
  for (const item of Object.values(contract.OPERATIONS_PANELS)) assert.ok(labels.includes(item.label));
  f.state.owner = false; const after = f.component.AdminOperationsCenter({ adminName: "Synthetic operator" }); assert.notEqual(before.key, after.key);
  f.state.permissions = []; assert.ok(f.render().includes("لا تملك صلاحية عرض التشغيل."));
});
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
test("web operations ignores an older read completing after a newer refresh", async () => {
  const f=setup({native:false}), pending=[];
  f.state.transport=()=>new Promise(resolve=>pending.push(resolve));
  const refresh=f.render().find(node=>node.type==="button"&&node.props.children==="تحديث");
  refresh.props.onClick(); refresh.props.onClick(); assert.equal(pending.length,2);
  pending[1]({ok:true,json:async()=>({...f.state.operations,generatedAt:"newer"})}); await flush();
  pending[0]({ok:true,json:async()=>({...f.state.operations,generatedAt:"older"})}); await flush();
  assert.deepEqual(f.stateWrites.filter(item=>item.current===6).map(item=>item.next.generatedAt),["newer"]);
});
test("web operations serializes repeated mutation clicks and refreshes only after success", async () => {
  const f=setup({native:false}); let finish;
  f.state.transport=(_path,init)=>init?.method==="POST"?new Promise(resolve=>{finish=resolve;}):Promise.resolve({ok:true,json:async()=>f.state.operations});
  const scan=f.render().find(node=>node.type==="button"&&node.props.children==="فحص المرفقات المعلقة");
  scan.props.onClick();scan.props.onClick();assert.equal(f.requests.length,1);
  finish({ok:true,json:async()=>({summary:{scanned:0,clean:0,quarantined:0,pending:0}})});await flush();
  assert.equal(f.requests.filter(item=>item.init?.method==="POST").length,1);
  assert.equal(f.requests.filter(item=>!item.init?.method).length,1);
});
test("web mutation transport failure becomes visible feedback without an unhandled rejection", async () => {
  const f=setup({native:false});f.state.transport=async()=>{throw new Error("synthetic transport unavailable");};
  const scan=f.render().find(node=>node.type==="button"&&node.props.children==="فحص المرفقات المعلقة");
  scan.props.onClick();await flush();
  assert.ok(f.stateWrites.some(item=>item.next==="synthetic transport unavailable"));
  assert.equal(f.requests.length,1);
});
