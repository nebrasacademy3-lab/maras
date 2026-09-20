import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(import.meta.url), ts = require("typescript");
function render(hydrated) {
  const writes = [], exports = {}, jsx = (type, props) => ({ type, props });
  const react = { useSyncExternalStore: (_subscribe, client, server) => hydrated ? client() : server(), useState: initial => [typeof initial === "function" ? initial() : initial, value => writes.push(value)], useRef: value => ({ current: value }), useCallback: value => value, useMemo: fn => fn(), useEffect: () => {} };
  const mocks = { react, "react/jsx-runtime": { jsx, jsxs: jsx }, "@/components/realtime-sync": { useRealtimeSync: () => {} }, "@/components/searchable-select": { SearchableSelect: "select" }, "@/components/admin-capability": { AdminCapability: "Capability" }, "next/link": { default: "a" }, "./finance-governance": { FinanceGovernance: "Governance" }, "@/lib/interaction-events": {}, "@/lib/admin-client": {}, "@/components/admin-mfa-notice": {} };
  const source = ts.transpileModule(readFileSync(new URL("../components/finance-center.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { exports, Intl, Date, URLSearchParams, require: name => name === "lucide-react" ? new Proxy({}, { get: (_, key) => key }) : name.endsWith(".css") ? { default: {} } : name in mocks ? mocks[name] : (() => { throw new Error(name); })() });
  const nodes = []; const visit = n => { if (Array.isArray(n)) return n.forEach(visit); if (!n || typeof n !== "object") return; nodes.push(n); visit(n.props?.children); };
  visit(exports.FinanceCenter({ adminName: "Synthetic operator" }));
  return { nodes, writes };
}
for (const hydrated of [false, true]) test(`finance filters are ${hydrated ? "interactive after hydration" : "inert in server HTML"}`, () => {
  const { nodes } = render(hydrated); const form = nodes.find(n => n.type === "form");
  assert.equal(form.props["data-finance-ready"], String(hydrated));
  assert.equal(form.props["aria-label"], "مرشحات المركز المالي");
  const controls = []; const visit = n => { if (Array.isArray(n)) return n.forEach(visit); if (!n || typeof n !== "object") return; if (["input", "select", "button"].includes(n.type)) controls.push(n); visit(n.props?.children); }; visit(form);
  assert.equal(controls.length, 10); for (const control of controls) assert.equal(control.props.disabled, !hydrated);
});
test("a stale pre-hydration submit cannot apply an unowned filter state", () => {
  for (const hydrated of [false, true]) { const f = render(hydrated); let prevented = false; f.nodes.find(n => n.type === "form").props.onSubmit({ preventDefault: () => { prevented = true; } }); assert.equal(prevented, true); assert.equal(f.writes.length, hydrated ? 1 : 0); }
});
