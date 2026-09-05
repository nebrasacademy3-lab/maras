import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(new URL("../lib/motion-runtime.ts", import.meta.url), "utf8");
const compiledModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: compiledModule, exports: compiledModule.exports });
const { revealTiming, revealFrames, startMotionOrchestrator } = compiledModule.exports;

test("scroll reveals have perceptible finite durations and a bounded stagger", () => {
  assert.equal(revealTiming(0, false).duration, 820);
  assert.equal(revealTiming(0, true).duration, 680);
  assert.deepEqual([0, 1, 2, 3, 99, -1].map(index => revealTiming(index, false).delay), [0, 75, 150, 225, 225, 0]);
  assert.equal(revealTiming(1, false).fill, "backwards");
});

test("reveal keyframes do not persist a containing block or animate dimensions", () => {
  for (const compact of [false, true]) {
    const frames = revealFrames(compact);
    assert.equal(frames.at(-1).translate, "none");
    assert.equal(frames.at(-1).opacity, 1);
    assert.ok(frames[0].opacity > 0);
    for (const frame of frames) for (const key of Object.keys(frame)) assert.ok(["opacity", "translate", "offset"].includes(key));
  }
});

test("unsupported observers degrade to visible, working content", () => {
  assert.equal(typeof startMotionOrchestrator({ defaultView: null }), "function");
  assert.doesNotThrow(() => startMotionOrchestrator({ defaultView: {} })());
});

test("scroll targeting uses semantic home hooks and excludes media, dialogs, and the assistant", () => {
  assert.match(source, /\[data-home-reveal\] article/);
  assert.match(source, /\[tabindex='0'\]\[aria-label\] > \*/);
  assert.match(source, /video,audio,\.secure-player,dialog/);
  assert.match(source, /\.learning-room,\.learning-page,\.assistant-panel,\.meras-assistant/);
  assert.doesNotMatch(source, /style\.(opacity|transform|translate|visibility)|will-change/);
});

test("preference changes, focused elements, removals, and navigation have explicit cleanup", () => {
  assert.match(source, /preference\.addEventListener\("change", onPreference\)/);
  assert.match(source, /for \(const element of waiting\) if \(element\.isConnected\) observer\.observe\(element\)/);
  assert.match(source, /document\.addEventListener\("focusin", onFocus\)/);
  assert.match(source, /document\.removeEventListener\("focusin", onFocus\)/);
  assert.match(source, /active\.forEach\(animation => animation\.cancel\(\)\)/);
  assert.match(source, /if \(!element\.isConnected\)/);
});

test("first-paint hero motion is independent of deferred JS and respects reduced motion", () => {
  const css = readFileSync(new URL("../app/motion.css", import.meta.url), "utf8");
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
  assert.match(css, /#home-intent-panel\s*\{\s*animation: merasCanvasArrival/);
  assert.match(css, /@keyframes merasHeroArrival/);
  assert.match(css, /:nth-child\(5\) \{ animation-delay: 360ms/);
  assert.doesNotMatch(css, /merasHeroArrival[^;}]*\b(forwards|both|infinite)\b/);
});
