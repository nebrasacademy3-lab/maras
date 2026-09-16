import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../components/public-content-editor.tsx", import.meta.url), "utf8");
function nodes(value) { return !value || typeof value !== "object" ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.children)]; }
function text(value) { return typeof value === "string" || typeof value === "number" ? String(value) : Array.isArray(value) ? value.map(text).join("") : text(value?.children || []); }
async function render(about) {
  const state = [{ about, faq: [] }, null, false, "", false, ""];
  let index = 0;
  const mocks = {
    useState: () => { const slot = index++; return [state[slot], value => { state[slot] = value; }]; },
    useEffect: () => {}, useCallback: callback => callback,
    BookOpen: "icon", Plus: "icon", Save: "icon", Search: "icon",
    styles: {}, React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
  };
  const key = "__contentA11y" + crypto.randomUUID().replaceAll("-", "");
  globalThis[key] = mocks;
  try {
    const input = `const { ${Object.keys(mocks).join(",")} } = globalThis[${JSON.stringify(key)}];\n` + source.replace(/^import .+;\r?\n/gm, "");
    const compiled = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
    const runtime = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
    return runtime.PublicContentEditor();
  } finally { delete globalThis[key]; }
}

test("public-content labels have unique IDs, named fields and separate live character descriptions", async () => {
  for (const title of ["عن مراس", "عنوان جديد أكثر تفصيلًا لمراس العلم"]) {
    const about = { title, intro: "المقدمة", mission: "رسالة المنصة", vision: "رؤية المنصة", why: [] };
    const tree = await render(about), all = nodes(tree);
    const ids = all.map(node => node.props.id).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, "each accessible reference must target one element");
    for (const [key, label, maximum] of [["title", "عنوان الصفحة", 100], ["intro", "المقدمة", 600], ["mission", "الرسالة", 1600], ["vision", "الرؤية", 1600]]) {
      const field = all.find(node => node.type === "textarea" && node.props.id === `about-${key}`);
      assert.ok(field);
      const name = all.find(node => node.props.id === field.props["aria-labelledby"]);
      const count = all.find(node => node.props.id === field.props["aria-describedby"]);
      assert.equal(text(name), label, "changing a counter must not change the field's name");
      assert.equal(text(count), `${[...about[key]].length}/${maximum}`);
      assert.notEqual(name, count);
      assert.ok(all.find(node => node.type === "label" && node.props.htmlFor === field.props.id));
    }
  }
});
