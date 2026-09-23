import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement, Fragment, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/accessible-data-table.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const runtime = {};
new Function("exports", "require", compiled)(runtime, require);
const { AccessibleDataTable } = runtime;
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  return [node, ...elements(node.props.children)];
}

test("data table exposes columns and rows while retaining named interactive links and buttons", () => {
  let clicks = 0;
  const row = createElement("div", { className: "live-table-row", key: "row" },
    createElement("strong", null, "مادة الفيزياء"),
    createElement("a", { href: "/courses/physics" }, "فتح المادة"),
    createElement("button", { type: "button", "aria-label": "تعديل مادة الفيزياء", onClick: () => clicks++ }, "تعديل"));
  const tree = AccessibleDataTable({ headers: ["المادة", "التفاصيل", "الإجراء"], children: createElement(Fragment, null, [row]) });
  const nodes = elements(tree);
  assert.equal(tree.props.role, "table");
  assert.equal(tree.props["aria-label"], "جدول المادة، التفاصيل، الإجراء");
  assert.equal(nodes.filter(node => node.props.role === "row").length, 2);
  assert.deepEqual(nodes.filter(node => node.props.role === "columnheader").map(node => node.props.children), ["المادة", "التفاصيل", "الإجراء"]);
  assert.equal(nodes.filter(node => node.props.role === "cell").length, 3);
  const link = nodes.find(node => node.type === "a"), button = nodes.find(node => node.type === "button");
  assert.equal(link.props.href, "/courses/physics");
  assert.equal(link.props.role, undefined, "A link must not become a non-interactive cell");
  assert.equal(button.props["aria-label"], "تعديل مادة الفيزياء");
  assert.equal(button.props.role, undefined, "A button must retain its native role");
  button.props.onClick(); assert.equal(clicks, 1);
  const html = renderToStaticMarkup(tree);
  assert.equal((html.match(/role="row"/g) || []).length, 2);
  assert.match(html, /class="live-table-row"/, "Existing grid styling remains available");
});

test("table cells preserve zero values, nested fragments and native grouping without extra hidden cells", () => {
  const tree = AccessibleDataTable({ headers: ["العدد", "الإجراء"], children: createElement(Fragment, null,
    createElement(Fragment, null, createElement("div", { className: "live-table-row" }, 0, null, false,
      createElement("div", { className: "live-actions" }, createElement("button", { type: "button" }, "فتح"))))) });
  const nodes = elements(tree), cells = nodes.filter(node => node.props.role === "cell");
  assert.equal(nodes.filter(node => node.props.role === "row").length, 2);
  assert.equal(cells.length, 2);
  assert.equal(cells[0].props.children, 0);
  assert.equal(cells[1].props.className, "live-actions");
  assert.equal(nodes.find(node => node.type === "button").props.children, "فتح");
});
