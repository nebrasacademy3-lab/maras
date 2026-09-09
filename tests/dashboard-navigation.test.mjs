import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/dashboard-navigation.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: mod, exports: mod.exports, URLSearchParams });
const { DASHBOARD_VIEWS, dashboardHref, currentDashboardView, navigationIsActive } = mod.exports;
test("only the selected dashboard section is active in the header", () => {
  const links = ["/dashboard", "/dashboard?view=courses", "/dashboard?view=account"];
  for (const [search, expected] of [["",0],["view=courses",1],["view=account",2]]) {
    assert.deepEqual(links.map(href=>navigationIsActive(href,"/dashboard",search)),links.map((_,i)=>i===expected));
  }
});
test("each dashboard section survives URL round trips and unknown views fall back safely", () => {
  for(const view of DASHBOARD_VIEWS) assert.equal(currentDashboardView(dashboardHref(view).split("?")[1] || ""),view);
  assert.equal(currentDashboardView("view=not-a-section"),"overview");
});
test("payment return opens orders and leaving it removes stale payment routing", () => {
  const search="payment=return&order=ord-123&view=account&error=forbidden";
  assert.equal(currentDashboardView(search),"orders");
  assert.equal(dashboardHref("courses",search),"/dashboard?view=courses");
  assert.equal(currentDashboardView("payment=return&order=!&view=account"),"account");
});
test("navigation matches route boundaries and does not mark FAQ as the homepage", () => {
  assert.equal(navigationIsActive("/#faq","/",""),false);
  assert.equal(navigationIsActive("/courses","/courses/biology",""),true);
  assert.equal(navigationIsActive("/courses","/courses-unknown",""),false);
});
