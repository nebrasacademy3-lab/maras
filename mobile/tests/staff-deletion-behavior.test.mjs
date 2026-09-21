import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(import.meta.url), ts = require("typescript");
function harness({ confirmation = "حذف", owner = false, fail = false } = {}) {
  const calls = [], dialogs = [], toasts = [], errors = [];
  const member = { id: 23, fullName: "Synthetic supervisor", email: "staff@example.test", role: "supervisor", isPlatformOwner: owner, status: "active", mfaEnabled: false, permissions: [], sessions: [] };
  const jsx = (type, props) => ({ type, props });
  const mocks = {
    react: { useState: initial => [initial, value => errors.push(value)] },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "react-native": { Pressable: "Pressable", View: "View" },
    "@tanstack/react-query": { useQuery: () => ({ data: { staff: [member], permissions: [], total: 1, pageSize: 50 }, refetch: async () => {} }) },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "@/src/components/ScaledText": { ScaledText: "Text" },
    "@/src/components/ui": { AppButton: "Button", Card: "Card", Field: "Field" },
    "@/src/providers/ThemeProvider": { useTheme: () => ({ colors: {} }) },
    "@/src/lib/api": { jsonBody: JSON.stringify, api: async (path, init) => { calls.push({ path, ...init }); if (fail) throw new Error("MFA not completed"); } },
    "@/src/lib/interaction-events": { MerasAlert: { alert: (...args) => dialogs.push(args) }, promptNative: async () => confirmation, nativeToast: (...args) => toasts.push(args) },
  };
  const exports = {};
  const source = readFileSync(new URL("../src/components/staff-manager.tsx", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, Error, require: name => { if (!(name in mocks)) throw Error(name); return mocks[name]; } });
  const buttons = [];
  const visit = node => { if (!node || typeof node !== "object") return; if (Array.isArray(node)) return node.forEach(visit); if (node.type === "Button") buttons.push(node); visit(node.props?.children); };
  visit(exports.StaffManager());
  return { calls, dialogs, toasts, errors, remove: buttons.find(button => button.props.title === "حذف حساب المشرف") };
}
async function confirm(state) {
  state.remove.props.onPress();
  state.dialogs[0][2].find(button => button.style === "destructive").onPress();
  await new Promise(resolve => setImmediate(resolve));
}
test("owner deletion is absent and cancellation or wrong text never reaches the server", async () => {
  assert.equal(harness({ owner: true }).remove, undefined);
  const cancelled = harness(); cancelled.remove.props.onPress();
  assert.equal(cancelled.calls.length, 0);
  for (const confirmation of [null, "", "delete", "حذف الحساب"]) {
    const state = harness({ confirmation }); await confirm(state);
    assert.equal(state.calls.length, 0); assert.equal(state.toasts.length, 0);
  }
});
test("confirmed deletion uses the protected endpoint and server refusal never reports success", async () => {
  const state = harness(); await confirm(state);
  assert.equal(state.calls.length, 1); assert.equal(state.calls[0].path, "/api/admin/console");
  assert.equal(state.calls[0].method, "POST");
  assert.deepEqual(JSON.parse(state.calls[0].body), { action: "deleteEntity", entityType: "user", entityId: "23", confirmation: "حذف" });
  assert.equal(state.toasts.length, 1);
  const refused = harness({ fail: true }); await confirm(refused);
  assert.equal(refused.toasts.length, 0); assert.ok(refused.errors.includes("MFA not completed"));
});
