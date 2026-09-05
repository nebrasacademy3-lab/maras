import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const compiledModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/player-fullscreen.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: compiledModule, exports: compiledModule.exports });
const helpers = compiledModule.exports;

class Style {
  values = new Map();
  setProperty(name, value, priority = "") { this.values.set(name, { value, priority }); }
  getPropertyValue(name) { return this.values.get(name)?.value || ""; }
  getPropertyPriority(name) { return this.values.get(name)?.priority || ""; }
  removeProperty(name) { this.values.delete(name); }
  snapshot() { return JSON.stringify([...this.values].sort(([a], [b]) => a.localeCompare(b))); }
}
function events(target) {
  const listeners = new Map();
  return Object.assign(target, {
    addEventListener(name, handler) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(handler); },
    removeEventListener(name, handler) { listeners.get(name)?.delete(handler); },
    emit(name) { for (const handler of listeners.get(name) || []) handler(); },
    listenerCount() { return [...listeners.values()].reduce((n, group) => n + group.size, 0); },
  });
}
function fixture(popover = true) {
  const viewport = events({ width: 390, height: 720, offsetLeft: 3, offsetTop: 7 });
  const window = events({ innerWidth: 390, innerHeight: 844, scrollX: 0, scrollY: 460, visualViewport: viewport, scrollTo(x, y) { this.scrollX = x; this.scrollY = y; } });
  const document = { defaultView: window };
  const element = parentElement => ({ ownerDocument: document, style: new Style(), parentElement, scrollTop: 0, scrollLeft: 0, isConnected: true });
  const html = element(null); const body = element(html); const ancestor = element(body);
  Object.assign(document, { documentElement: html, body });
  ancestor.scrollTop = 240; ancestor.style.setProperty("transform", "translateY(20px)", "important"); ancestor.style.setProperty("contain", "paint");
  body.style.setProperty("overflow", "auto", "important"); html.style.setProperty("scroll-behavior", "smooth");
  const attributes = new Map();
  const shell = Object.assign(element(ancestor), {
    getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) { attributes.delete(name); },
    shown: false,
  });
  if (popover) { shell.showPopover = () => { shell.shown = true; }; shell.hidePopover = () => { shell.shown = false; }; }
  return { shell, ancestor, body, html, window, viewport, document };
}
test("viewport fullscreen uses the existing connected surface in the top layer", () => {
  const f = fixture(); const originalParent = f.shell.parentElement;
  const release = helpers.enterViewportFullscreen(f.shell);
  assert.equal(f.shell.shown, true); assert.equal(f.shell.getAttribute("popover"), "manual");
  assert.equal(f.shell.parentElement, originalParent);
  assert.equal(f.ancestor.style.getPropertyValue("transform"), "translateY(20px)");
  assert.equal(f.body.style.getPropertyValue("position"), "fixed");
  assert.equal(f.body.style.getPropertyValue("top"), "-460px");
  assert.equal(f.shell.style.getPropertyValue("--player-viewport-height"), "720px");
  release();
  assert.equal(f.shell.shown, false); assert.equal(f.shell.getAttribute("popover"), null);
});
test("closing restores body, document, nested scroll and exact inline priorities once", () => {
  const f = fixture(); const before = [f.body, f.html, f.ancestor].map(e => e.style.snapshot());
  const release = helpers.enterViewportFullscreen(f.shell);
  f.window.scrollY = 0; f.ancestor.scrollTop = 0; release(); release();
  assert.deepEqual([f.body, f.html, f.ancestor].map(e => e.style.snapshot()), before);
  assert.equal(f.window.scrollY, 460); assert.equal(f.ancestor.scrollTop, 240);
  assert.equal(f.window.listenerCount(), 0); assert.equal(f.viewport.listenerCount(), 0);
});
test("legacy fallback escapes transform, containment and will-change and restores them", () => {
  const f = fixture(false); f.ancestor.style.setProperty("will-change", "transform");
  const before = f.ancestor.style.snapshot();
  const release = helpers.enterViewportFullscreen(f.shell);
  assert.equal(f.ancestor.style.getPropertyValue("transform"), "none");
  assert.equal(f.ancestor.style.getPropertyValue("contain"), "none");
  assert.equal(f.ancestor.style.getPropertyValue("will-change"), "auto");
  assert.equal(f.ancestor.style.getPropertyValue("content-visibility"), "visible");
  assert.equal(f.ancestor.style.getPropertyPriority("transform"), "important");
  release(); assert.equal(f.ancestor.style.snapshot(), before);
});
test("a throwing popover implementation safely falls back without hiding the player", () => {
  const f = fixture(); f.shell.showPopover = () => { throw new Error("unsupported embedding"); };
  const release = helpers.enterViewportFullscreen(f.shell);
  assert.equal(f.shell.getAttribute("popover"), null);
  assert.equal(f.ancestor.style.getPropertyValue("transform"), "none");
  release(); assert.equal(f.body.style.getPropertyValue("overflow"), "auto");
});
test("visual viewport dimensions update after orientation and toolbar changes", () => {
  const f = fixture(); const release = helpers.enterViewportFullscreen(f.shell);
  f.viewport.width = 844; f.viewport.height = 340; f.viewport.offsetTop = 0; f.viewport.emit("resize");
  assert.equal(f.shell.style.getPropertyValue("--player-viewport-width"), "844px");
  assert.equal(f.shell.style.getPropertyValue("--player-viewport-height"), "340px");
  assert.equal(f.shell.style.getPropertyValue("--player-viewport-top"), "0px");
  release(); assert.equal(f.shell.style.getPropertyValue("--player-viewport-width"), "");
});
test("native fullscreen uses the screen viewport rather than page zoom offsets", () => {
  const f = fixture(); const release = helpers.watchPlayerViewport(f.shell, true);
  assert.equal(f.shell.style.getPropertyValue("--player-viewport-height"), "844px");
  assert.equal(f.shell.style.getPropertyValue("--player-viewport-left"), "0px");
  release();
});
test("pre-entry scroll snapshot restores native fullscreen layout shifts and keeps smooth preference", () => {
  const f = fixture(); const restore = helpers.capturePlayerScroll(f.shell);
  f.window.scrollY = 0; f.ancestor.scrollTop = 0;
  restore();
  assert.equal(f.window.scrollY, 460); assert.equal(f.ancestor.scrollTop, 240);
  assert.equal(f.html.style.getPropertyValue("scroll-behavior"), "smooth");
  f.ancestor.scrollTop = 10; restore();
  assert.equal(f.ancestor.scrollTop, 240);
});
test("standard and WebKit full screen target the complete shell, never a native video-only UI", async () => {
  const standard = { called: false, requestFullscreen(options) { this.called = options.navigationUI === "hide"; return Promise.resolve(); } };
  await helpers.requestPlayerFullscreen(standard); assert.equal(standard.called, true);
  const legacy = { called: false, webkitRequestFullscreen() { this.called = true; } };
  await helpers.requestPlayerFullscreen(legacy); assert.equal(legacy.called, true);
  assert.equal(helpers.requestPlayerFullscreen({}), null);
  let exited = false; await helpers.exitPlayerFullscreen({ webkitExitFullscreen() { exited = true; } }); assert.equal(exited, true);
  assert.equal(helpers.currentFullscreenElement({ webkitFullscreenElement: legacy }), legacy);
});
