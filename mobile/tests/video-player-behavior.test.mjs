import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(new URL("../src/lib/player-layout.ts", import.meta.url), "utf8");
const exports = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports });
const { playerStageLayout, inlinePlayerHeight, playerBackAction, createCaptureLease } = exports;
const player = readFileSync(new URL("../app/lesson/[courseSlug]/[lessonId].tsx", import.meta.url), "utf8");

test("rotation fits the same measured host in portrait, landscape and tablet", () => {
  for (const [width, height] of [[320, 540], [812, 350], [1024, 1300]]) {
    for (const rotated of [false, true]) {
      const stage = playerStageLayout(width, height, rotated);
      assert.equal(stage.width, rotated ? height : width);
      assert.equal(stage.height, rotated ? width : height);
      assert.equal(stage.transform[0].rotate, rotated ? "90deg" : "0deg");
    }
  }
});

test("inline layout leaves room for lesson navigation in narrow landscape", () => {
  assert.equal(inlinePlayerHeight(320, 640), 180);
  assert.equal(inlinePlayerHeight(812, 375), 168.75);
  assert.equal(playerStageLayout(Number.NaN, -10, false).width, 1);
  assert.equal(playerStageLayout(Number.NaN, -10, false).height, 1);
});

test("back closes settings before fullscreen before leaving the lesson", () => {
  assert.equal(playerBackAction(true, true), "close-settings");
  assert.equal(playerBackAction(false, true), "close-settings");
  assert.equal(playerBackAction(true, false), "exit-fullscreen");
  assert.equal(playerBackAction(false, false), "leave-player");
});

test("capture cleanup waits for pending protection and runs only once", async () => {
  const events = [];
  let finishProtection;
  const pending = new Promise((resolve) => { finishProtection = resolve; });
  const lease = createCaptureLease({ prevent: async (key) => { events.push(["prevent", key]); await pending; }, allow: async (key) => { events.push(["allow", key]); } });
  const released = lease.release();
  assert.equal(released, lease.release());
  await Promise.resolve();
  assert.equal(events.length, 1);
  finishProtection();
  await released;
  assert.deepEqual(events, [["prevent", lease.key], ["allow", lease.key]]);
});

test("cleanup of the previous lesson cannot release the current lease", async () => {
  const active = new Set();
  const adapter = { prevent: async (key) => { active.add(key); }, allow: async (key) => { active.delete(key); } };
  const previous = createCaptureLease(adapter);
  const current = createCaptureLease(adapter);
  await Promise.all([previous.ready, current.ready]);
  assert.notEqual(previous.key, current.key);
  await previous.release();
  assert.equal(active.has(current.key), true);
  assert.equal(active.size, 1);
  await current.release();
  assert.equal(active.size, 0);
});

test("failed protection rejects playback readiness and retry uses a fresh key", async () => {
  const cleared = [];
  const failed = createCaptureLease({ prevent: async () => { throw new Error("protection unavailable"); }, allow: async (key) => { cleared.push(key); } });
  await assert.rejects(failed.ready, /protection unavailable/);
  await failed.release();
  assert.deepEqual(cleared, [failed.key]);
  const retry = createCaptureLease({ prevent: async () => {}, allow: async () => {} });
  assert.notEqual(retry.key, failed.key);
  await retry.ready;
  await retry.release();
});

test("native fullscreen keeps one protected video surface with custom controls", () => {
  assert.equal((player.match(/<VideoView\s/g) || []).length, 1);
  assert.doesNotMatch(player, /<Modal\b|if\s*\(!expanded\)/);
  assert.match(player, /nativeControls=\{false\}/);
  assert.match(player, /fullscreenOptions=\{\{ enable: false \}\}/);
  assert.match(player, /loading \|\| !preparedPlayback \|\| !captureReady/);
  assert.match(player, /lease\.release\(\)/);
  assert.match(player, /onLayout=\{/);
  assert.match(player, /StatusBar hidden=\{fullscreen\}/);
  assert.match(player, /AppState\.currentState === "active"\) player\.play\(\)/);
});

test("settings scroll within the frame and time polling does not fight seeking", () => {
  assert.match(player, /ScrollView[^>]*style=\{styles\.settingsScroll\}/);
  assert.match(player, /settings: \{[^\n]*top: 8[^\n]*bottom: 8/);
  assert.match(player, /controlsRow: \{[^\n]*flexWrap: "wrap"/);
  assert.match(player, /if \(!seeking\.current\) setTime/);
  assert.match(player, /onSlidingStart=\{\(\) => \{ seeking\.current = true;/);
  assert.match(player, /onSlidingComplete=\{[^\n]*seeking\.current = false;/);
});

function webHostHarness({ failure = false, supported = true } = {}) {
  const events = [];
  const style = () => {
    const properties = new Map([["overflow", { value: "auto", priority: "important" }]]);
    return { getPropertyValue: (key) => properties.get(key)?.value || "", getPropertyPriority: (key) => properties.get(key)?.priority || "", setProperty: (key, value, priority = "") => properties.set(key, { value, priority }), removeProperty: (key) => properties.delete(key) };
  };
  const document = { documentElement: { style: style() }, body: { style: style() } };
  document.body.style.removeProperty("overflow");
  const media = { currentTime: 125, playbackRate: 1.5 };
  const dialog = { open: true, isConnected: true, media, close() { events.push("close"); this.open = false; }, setAttribute(key) { if (key === "open") this.open = true; } };
  if (supported) dialog.showModal = function () { events.push("showModal"); if (failure) throw new Error("Unavailable"); this.open = true; };
  const tree = ts.createSourceFile("player.tsx", player, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = tree.statements.filter((node) => ts.isFunctionDeclaration(node) && ["openWebPlayerDialog", "WebPlayerHost"].includes(node.name?.text)).map((node) => node.getText(tree)).join("\n");
  const exported = {};
  let effect;
  let closed = 0;
  const compiled = ts.transpileModule(`${functions}\nexports.open = openWebPlayerDialog; exports.Host = WebPlayerHost;`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(compiled, { exports: exported, document, useLanguage: () => ({ t: (text) => text }), useRef: (value) => ({ current: value === null ? dialog : value }), useLayoutEffect: (callback) => { effect = callback; }, require: () => ({ jsx: (type, props) => ({ type, props }) }) });
  exported.Host({ expanded: true, width: 390, height: 750, onClose: () => { closed++; }, children: media });
  return { dialog, document, events, media, enter: () => effect(), closed: () => closed };
}

test("Expo Web promotes the same open dialog without replacing its video", () => {
  const host = webHostHarness();
  const cleanup = host.enter();
  assert.deepEqual(host.events, ["close", "showModal"]);
  assert.equal(host.dialog.media, host.media);
  assert.equal(host.dialog.media.currentTime, 125);
  assert.equal(host.document.body.style.getPropertyValue("overflow"), "hidden");
  cleanup();
});

test("Expo Web collapse or unmount restores exact document scrolling styles", () => {
  const host = webHostHarness();
  const cleanup = host.enter();
  cleanup();
  assert.equal(host.document.documentElement.style.getPropertyValue("overflow"), "auto");
  assert.equal(host.document.documentElement.style.getPropertyPriority("overflow"), "important");
  assert.equal(host.document.body.style.getPropertyValue("overflow"), "");
  assert.equal(host.dialog.open, true, "inline player remains visible after leaving top layer");
  assert.equal(host.dialog.media, host.media);
});

test("unsupported or failed top-layer activation returns inline without locking scroll", () => {
  for (const options of [{ failure: true }, { supported: false }]) {
    const host = webHostHarness(options);
    assert.equal(host.enter(), undefined);
    assert.equal(host.closed(), 1);
    assert.equal(host.dialog.open, true);
    assert.equal(host.document.body.style.getPropertyValue("overflow"), "");
    assert.equal(host.document.documentElement.style.getPropertyValue("overflow"), "auto");
  }
});
