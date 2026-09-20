import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(new URL("../components/secure-video-player.tsx", import.meta.url), "utf8");
const syntax = ts.createSourceFile("secure-video-player.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function descendants(node, predicate) {
  const found = [];
  function visit(child) { if (predicate(child)) found.push(child); ts.forEachChild(child, visit); }
  visit(node); return found;
}
const elements = tag => descendants(syntax, node => ts.isJsxElement(node) && node.openingElement.tagName.getText(syntax) === tag);
const attribute = (element, name) => element.openingElement.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText(syntax) === name);
test("video settings use separately named semantic groups without relabelling their first button", () => {
  const groups = elements("fieldset").filter(element => attribute(element, "className")?.initializer?.text === "player-setting-group");
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(group => group.children.find(child => ts.isJsxElement(child) && child.openingElement.tagName.getText(syntax) === "legend")?.children.map(child => child.getText(syntax)).join("")), ["السرعة", "الجودة"]);
  for (const label of elements("label")) assert.equal(descendants(label, node => ts.isJsxElement(node) && node.openingElement.tagName.getText(syntax) === "button").length, 0);
  for (const group of groups) {
    const buttons = descendants(group, node => ts.isJsxElement(node) && node.openingElement.tagName.getText(syntax) === "button");
    assert.equal(buttons.length, 1, "Each group renders its choices from one controlled map");
    assert.equal(attribute(buttons[0], "type")?.initializer?.text, "button");
    assert.ok(attribute(buttons[0], "aria-pressed"), "Chosen setting must be exposed to assistive technology");
    assert.equal(attribute(buttons[0], "aria-label"), undefined, "Visible option text is the accessible name");
  }
});
