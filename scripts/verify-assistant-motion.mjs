/* Local, read-only UI QA: no chat request, account, email, or production writes. */
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright");
const baseURL = process.env.MARAS_TEST_URL || "http://127.0.0.1:3000";
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL).hostname), "This script is local-only");
const storageKey = "meras-assistant-position-v1";
const folder = path.resolve("outputs/assistant-motion", new Date().toISOString().replace(/[:.]/g, "-"));
fs.mkdirSync(folder, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.MARAS_TEST_BROWSER || "msedge" });
const results = [];
const closeEnough = (a, b, label, tolerance = 2) => assert.ok(Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);

async function position(page) {
  return page.locator(".meras-assistant").evaluate(element => ({ x: parseFloat(element.style.left), y: parseFloat(element.style.top), width: element.querySelector(".assistant-fab").offsetWidth, height: element.querySelector(".assistant-fab").offsetHeight }));
}
async function ready(page) {
  const response = await page.goto(baseURL, { waitUntil: "load", timeout: 60_000 });
  assert.equal(response?.status(), 200);
  await page.waitForFunction(() => !!document.querySelector(".meras-assistant")?.style.left);
  await page.addStyleTag({ content: "nextjs-portal{visibility:hidden!important}" }); // Hide only Next's local dev indicator, which otherwise intercepts the default FAB.
  await page.evaluate(() => document.fonts.ready);
}
async function insideViewport(page, selector, margin = 0) {
  const geometry = await page.locator(selector).evaluate(element => {
    const box = element.getBoundingClientRect();
    const viewport = visualViewport;
    return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height, leftLimit: viewport?.offsetLeft || 0, topLimit: viewport?.offsetTop || 0, widthLimit: viewport?.width || innerWidth, heightLimit: viewport?.height || innerHeight };
  });
  assert.ok(geometry.width > 0 && geometry.height > 0, selector + " is hidden");
  assert.ok(geometry.x >= geometry.leftLimit + margin - 2 && geometry.y >= geometry.topLimit + margin - 2 && geometry.right <= geometry.leftLimit + geometry.widthLimit - margin + 2 && geometry.bottom <= geometry.topLimit + geometry.heightLimit - margin + 2, selector + " escapes viewport: " + JSON.stringify(geometry));
  return geometry;
}
async function longDrag(page, x, y) {
  const box = await position(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForFunction(() => document.querySelector(".meras-assistant")?.classList.contains("is-dragging"));
  await page.mouse.move(x, y, { steps: 5 });
  await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector(".meras-assistant")?.classList.contains("is-dragging"));
}
async function assertClosed(page) {
  assert.equal(await page.locator(".assistant-fab").getAttribute("aria-expanded"), "false", "A drag must not open the assistant");
  assert.equal(await page.locator(".assistant-panel").count(), 0);
}
async function checkDragAndKeyboard(page, viewport) {
  const fab = page.locator(".assistant-fab");
  await insideViewport(page, ".assistant-fab", 8);
  const start = await position(page);
  await assertClosed(page);
  // A short pointer gesture that starts scrolling must neither move the button nor open it.
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 24, start.y + start.height / 2 - 20);
  await page.mouse.up();
  const cancelled = await position(page);
  closeEnough(cancelled.x, start.x, "Short gesture x");
  closeEnough(cancelled.y, start.y, "Short gesture y");
  await assertClosed(page);
  // Pointer capture keeps the drag moving even after the pointer leaves the original hit target.
  await longDrag(page, Math.min(viewport.width - 50, start.x + start.width / 2 + 155), Math.max(60, start.y - 210));
  await insideViewport(page, ".assistant-fab", 8);
  const moved = await position(page);
  assert.ok(Math.abs(moved.x - start.x) > 50 && Math.abs(moved.y - start.y) > 70, "Long press did not move the button");
  await assertClosed(page);
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
  assert.ok(saved.x > 0 && saved.x <= 1 && saved.y >= 0 && saved.y < 1, "Normalized position was not saved");
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => !!document.querySelector(".meras-assistant")?.style.left);
  await page.addStyleTag({ content: "nextjs-portal{visibility:hidden!important}" });
  const restored = await position(page);
  closeEnough(restored.x, moved.x, "Restored x");
  closeEnough(restored.y, moved.y, "Restored y");
  // The first ordinary tap after dragging remains functional.
  await fab.click();
  await page.locator(".assistant-panel").waitFor();
  await insideViewport(page, ".assistant-panel", 8);
  await page.getByRole("button", { name: "إغلاق المساعد", exact: true }).click();
  await assertClosed(page);
  await fab.focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowUp");
  const keyed = await position(page);
  closeEnough(keyed.x, Math.max(12, restored.x - 24), "ArrowLeft displacement");
  closeEnough(keyed.y, Math.max(12, restored.y - 24), "ArrowUp displacement");
  await page.keyboard.press("Enter");
  await page.locator(".assistant-panel").waitFor();
  await page.getByRole("button", { name: "إغلاق المساعد", exact: true }).click();
  await fab.focus();
  await page.keyboard.press("Home");
  const reset = await position(page);
  closeEnough(reset.x, start.x, "Home reset x");
  closeEnough(reset.y, start.y, "Home reset y");
  // All four outside corners must clamp, and the open panel must follow within the viewport.
  for (const [x, y] of [[-100, -100], [viewport.width + 100, -100], [viewport.width + 100, viewport.height + 100], [-100, viewport.height + 100]]) {
    await longDrag(page, x, y);
    await insideViewport(page, ".assistant-fab", 8);
    await assertClosed(page);
    await fab.click();
    await page.locator(".assistant-panel").waitFor();
    await insideViewport(page, ".assistant-panel", 8);
    await page.getByRole("button", { name: "إغلاق المساعد", exact: true }).click();
  }
  // Reposition also stays usable while rotating/resizing with the panel open.
  await longDrag(page, viewport.width + 100, -100);
  await fab.click();
  await page.locator(".assistant-panel").waitFor();
  for (const size of [{ width: 844, height: 390 }, { width: 320, height: 568 }, viewport]) {
    await page.setViewportSize(size);
    await page.waitForFunction(({ width, height }) => innerWidth === width && innerHeight === height, size);
    await page.waitForFunction(() => {
      const rect = document.querySelector(".assistant-fab")?.getBoundingClientRect();
      return rect && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
    }); // Allow the resize listener's React state commit; fail if it never clamps.
    await insideViewport(page, ".assistant-fab", 8);
    await insideViewport(page, ".assistant-panel", 8);
    await insideViewport(page, ".assistant-input");
  }
  await page.getByRole("button", { name: "إعادة موضع الزر", exact: true }).click();
  const buttonReset = await position(page);
  closeEnough(buttonReset.x, start.x, "Panel reset x");
  closeEnough(buttonReset.y, start.y, "Panel reset y");
  await page.screenshot({ path: path.join(folder, `assistant-open-${viewport.width}.png`) });
  await page.getByRole("button", { name: "إغلاق المساعد", exact: true }).click();
}

async function checkMotion(page) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // Real MutationObserver/IntersectionObserver path; fixture lives only in this browser context.
  const immediate = await page.evaluate(() => {
    const fixture = document.createElement("article");
    fixture.id = "qa-motion-fixture"; fixture.dataset.motion = "card";
    fixture.style.cssText = "position:fixed;top:90px;left:90px;width:120px;padding:12px;background:var(--surface);z-index:99999";
    fixture.textContent = "محتوى ظاهر أثناء التحميل";
    document.body.append(fixture);
    return getComputedStyle(fixture).opacity;
  });
  assert.equal(immediate, "1", "Content is hidden while waiting for animation registration");
  await page.waitForFunction(() => document.querySelector("#qa-motion-fixture")?.classList.contains("is-revealed"));
  const animated = await page.evaluate(() => document.getAnimations().some(animation => animation.effect?.target?.id === "qa-motion-fixture" && animation.playState === "running"));
  assert.equal(animated, true, "New visible content did not receive the expected entry animation");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(() => !document.getAnimations().some(animation => animation.effect?.target?.id === "qa-motion-fixture" && animation.playState === "running"));
  assert.equal(await page.locator("#qa-motion-fixture").evaluate(element => getComputedStyle(element).opacity), "1", "Cancelling motion left content transparent");
  const reduced = await page.evaluate(() => {
    const fixture = document.createElement("article"); fixture.id = "qa-reduced-fixture"; fixture.dataset.motion = "card";
    fixture.style.cssText = "position:fixed;top:140px;left:90px;width:120px;padding:12px;z-index:99999";
    fixture.textContent = "محتوى بدون حركة"; document.body.append(fixture);
    return getComputedStyle(fixture).opacity;
  });
  assert.equal(reduced, "1");
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const violations = await page.evaluate(() => ({
    fixtureAnimations: document.getAnimations().filter(animation => animation.effect?.target?.id === "qa-reduced-fixture" && animation.playState === "running").length,
    hiddenContent: Array.from(document.querySelectorAll("[data-home-reveal],#qa-reduced-fixture")).filter(element => { const style = getComputedStyle(element); return style.opacity === "0" || style.visibility === "hidden"; }).length,
    ringAnimation: getComputedStyle(document.querySelector(".assistant-fab-rings")).animationName,
  }));
  assert.equal(violations.fixtureAnimations, 0);
  assert.equal(violations.hiddenContent, 0);
  assert.equal(violations.ringAnimation, "none");
  await page.evaluate(() => { document.querySelector("#qa-motion-fixture")?.remove(); document.querySelector("#qa-reduced-fixture")?.remove(); });
}

async function checkTouchDrag(page, context) {
  const before = await position(page);
  const viewport = page.viewportSize();
  const session = await context.newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: before.x + before.width / 2, y: before.y + before.height / 2, id: 0 }] });
    await page.waitForFunction(() => document.querySelector(".meras-assistant")?.classList.contains("is-dragging"));
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: Math.min(viewport.width - 50, before.x + 150), y: Math.max(75, before.y - 170), id: 0 }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const after = await position(page);
    assert.ok(Math.abs(after.x - before.x) > 40 && Math.abs(after.y - before.y) > 70, "Native touch long-press did not drag");
    await assertClosed(page);
    await insideViewport(page, ".assistant-fab", 8);
    await page.touchscreen.tap(after.x + after.width / 2, after.y + after.height / 2);
    await page.locator(".assistant-panel").waitFor();
    await insideViewport(page, ".assistant-panel", 8);
    await page.getByRole("button", { name: "إغلاق المساعد", exact: true }).click();
  } finally { await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }).catch(() => undefined); await session.detach(); }
}

try {
  for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 950 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce", hasTouch: viewport.width <= 390 });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.setDefaultTimeout(12_000);
    try {
      await ready(page);
      if (viewport.width === 390) await page.getByRole("button", { name: "تفعيل الوضع الليلي", exact: true }).click();
      await checkDragAndKeyboard(page, viewport);
      if (viewport.width <= 390) await checkTouchDrag(page, context);
      // A new document starts the observer with motion enabled, then exercises live preference changes.
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.reload({ waitUntil: "load" });
      await page.waitForFunction(() => !!document.querySelector(".meras-assistant")?.style.left);
      await page.addStyleTag({ content: "nextjs-portal{visibility:hidden!important}" });
      await checkMotion(page);
      assert.deepEqual(errors, [], "Browser runtime errors");
      results.push({ viewport, status: "passed", longPressDrag: true, nativeTouchDrag: viewport.width <= 390, shortGestureSuppressed: true, tapAfterDrag: true, savedReload: true, keyboardAndReset: true, allCornerBounds: true, orientationReflow: true, dynamicMotion: true, reducedMotionCancellation: true });
    } catch (error) {
      await page.screenshot({ path: path.join(folder, `failure-${viewport.width}.png`), fullPage: true }).catch(() => undefined);
      results.push({ viewport, status: "failed", error: error.stack || error.message, runtimeErrors: errors });
    } finally { await context.close(); }
    console.log(JSON.stringify(results.at(-1)));
  }
  // Corrupt/untrusted persisted UI coordinates must not strand the button off-screen.
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, reducedMotion: "reduce" });
  await context.addInitScript(key => localStorage.setItem(key, '{"x":9999,"y":-9999}'), storageKey);
  const page = await context.newPage();
  try { await ready(page); await insideViewport(page, ".assistant-fab", 10); results.push({ storage: "out-of-range coordinates", status: "passed" }); }
  catch (error) { results.push({ storage: "out-of-range coordinates", status: "failed", error: error.message }); }
  finally { await context.close(); }
} finally { await browser.close(); }
const report = { ok: results.every(result => result.status === "passed"), results, screenshots: folder };
fs.writeFileSync(path.join(folder, "results.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, passed: results.filter(result => result.status === "passed").length, total: results.length, screenshots: folder }));
if (!report.ok) process.exitCode = 1;
