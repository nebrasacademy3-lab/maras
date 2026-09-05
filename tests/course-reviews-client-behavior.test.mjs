import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../components/course-reviews.tsx", import.meta.url), "utf8");
const props = { courseSlug: "physics", catalogRating: 0, catalogCount: 0, signedIn: true, canReview: true };

async function componentHarness(fetcher) {
  const state = [];
  const effects = [];
  let index = 0;
  const deps = {
    fetch: fetcher,
    useState: initial => {
      const slot = index++;
      if (!(slot in state)) state[slot] = initial;
      return [state[slot], value => { state[slot] = typeof value === "function" ? value(state[slot]) : value; }];
    },
    useEffect: effect => { effects.push(effect); },
    React: { createElement: (type, properties, ...children) => ({ type, props: properties || {}, children }), Fragment: "fragment" },
    SearchableSelect: "select", Link: "a", BadgeCheck: "svg", LoaderCircle: "svg",
    FormData: class { constructor(form) { this.values = form.values; } get(key) { return this.values[key]; } },
  };
  const key = "__merasReviewsTest" + crypto.randomUUID().replaceAll("-", "");
  globalThis[key] = deps;
  try {
    const prefix = "const { " + Object.keys(deps).join(", ") + " } = globalThis[" + JSON.stringify(key) + "];\n";
    const transformed = ts.transpileModule(prefix + source.replace(/^import .+;\r?\n/gm, ""), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
    const component = await import("data:text/javascript;base64," + Buffer.from(transformed).toString("base64"));
    return { state, effects, render: () => { index = 0; return component.CourseReviews(props); } };
  } finally { delete globalThis[key]; }
}

function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return null;
  if (predicate(tree)) return tree;
  for (const child of tree.children?.flat(Infinity) || []) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test("empty server errors, malformed JSON and connection failures render a review error without an unhandled rejection", async () => {
  for (const fetcher of [
    async () => new Response(null, { status: 500 }),
    async () => new Response("not-json", { status: 200 }),
    async () => { throw new Error("connection failed"); },
  ]) {
    const harness = await componentHarness(fetcher);
    harness.render();
    const cleanup = harness.effects.shift()();
    await settle();
    const rendered = harness.render();
    const status = find(rendered, node => node.type === "p" && node.props.role === "status");
    assert.ok(status);
    assert.match(status.children.join(""), /تعذر تحميل التقييمات/);
    assert.equal(harness.state[1], props.courseSlug, "the loading state must finish");
    cleanup();
  }
});

test("a review request completed after navigation cannot change the abandoned component state", async () => {
  let resolve;
  let requestSignal;
  const pending = new Promise(yes => { resolve = yes; });
  const harness = await componentHarness((_url, options) => { requestSignal = options.signal; return pending; });
  harness.render();
  const cleanup = harness.effects.shift()();
  cleanup();
  assert.equal(requestSignal.aborted, true);
  resolve(Response.json({ reviews: [{ id: 1 }] }));
  await settle();
  assert.deepEqual(harness.state, [[], "", "", ""]);
});

test("review submission preserves the form when the server returns an empty error or the connection fails", async () => {
  for (const fetcher of [
    async () => new Response(null, { status: 500 }),
    async () => { throw new Error("offline"); },
  ]) {
    const harness = await componentHarness(fetcher);
    const tree = harness.render();
    const form = find(tree, node => node.type === "form");
    let reset = false;
    await form.props.onSubmit({ preventDefault() {}, currentTarget: { values: { rating: "5", body: "محتوى واضح ومفيد للمراجعة" }, reset() { reset = true; } } });
    assert.equal(reset, false);
    assert.match(harness.state[3], /تعذر إرسال التقييم/);
  }
});
