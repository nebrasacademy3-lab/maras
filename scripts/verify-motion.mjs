/* Real local homepage/browser QA. No credentials, production writes, or DB mutations.
 * NODE_PATH points to the Playwright runtime; --url defaults to http://127.0.0.1:3000.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium, webkit, firefox } = require("playwright");
const url = process.argv.find(value => value.startsWith("--url="))?.slice(6) || "http://127.0.0.1:3000/";
const engineFilter = process.argv.find(value => value.startsWith("--engine="))?.slice(9);
if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error("This QA script only runs against a local server");
const folder = path.resolve("outputs/motion", new Date().toISOString().replace(/[:.]/g, "-"));
fs.mkdirSync(folder, { recursive: true });
const results = [];
const cases = [
  { engine: "chromium", width: 1440, height: 900 },
  { engine: "chromium", width: 390, height: 844 },
  { engine: "webkit", width: 390, height: 844 },
  { engine: "firefox", width: 1280, height: 900 },
];
for (const scene of cases.filter(scene => !engineFilter || scene.engine === engineFilter)) {
  const label = `${scene.engine}-${scene.width}`;
  const browser = await ({ chromium, webkit, firefox }[scene.engine]).launch({ headless: true, ...(scene.engine === "chromium" ? { channel: "msedge" } : {}) });
  const context = await browser.newContext({ viewport: { width: scene.width, height: scene.height }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__motionCalls = [];
    window.__motionCss = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      const animation = original.call(this, frames, options);
      window.__motionCalls.push({ node: this, id: this.id, tag: this.tagName, options, frames });
      return animation;
    };
    document.addEventListener("animationstart", event => window.__motionCss.push({ name: event.animationName, id: event.target.id }));
  });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForSelector("#home-gateway-title", { timeout: 20000 });
    await page.waitForFunction(() => window.__motionCss.some(item => item.name === "merasHeroArrival"), undefined, { timeout: 10000 });
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(folder, label + "-entrance.png") });
    await page.waitForTimeout(1400);
    await page.waitForFunction(() => !document.querySelector("#home-gateway-title").getAnimations().some(animation => animation.playState === "running"), undefined, { timeout: 6000 });
    const hero = await page.evaluate(() => {
      const title = document.querySelector("#home-gateway-title");
      return { opacity: getComputedStyle(title).opacity, translate: getComputedStyle(title).translate, copyTransform: getComputedStyle(title.parentElement).transform, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2 };
    });
    assert.equal(hero.opacity, "1");
    assert.equal(hero.translate, "none");
    assert.equal(hero.copyTransform, "none");
    assert.equal(hero.horizontalOverflow, false);

    // Real semantic homepage cards, not class-name fixtures.
    const section = page.locator("[aria-labelledby='learning-title']");
    await section.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => window.__motionCalls.some(call => call.node.closest("[aria-labelledby='learning-title']")), undefined, { timeout: 12000 });
    const scrollReveal = await page.evaluate(() => window.__motionCalls.filter(call => call.node.closest("[aria-labelledby='learning-title']")).map(call => ({ tag: call.tag, duration: call.options.duration, delay: call.options.delay, fill: call.options.fill })));
    assert.ok(scrollReveal.some(call => call.tag === "ARTICLE"));
    assert.ok(scrollReveal.every(call => call.fill === "backwards"));
    await page.waitForTimeout(80);
    await page.screenshot({ path: path.join(folder, label + "-scroll.png") });
    await page.waitForTimeout(1250);

    // New server/client content remains eligible; safety boundaries must not move.
    await page.evaluate(() => {
      const section = document.createElement("section");
      section.id = "motion-qa"; section.setAttribute("data-home-reveal", "");
      section.innerHTML = '<div class="container"><header id="qa-heading"><h2>اختبار الحركة المحلي</h2></header><article id="qa-card" style="padding:30px"><button id="qa-focus">متابعة</button></article><article id="qa-media"><video></video></article><article data-motion="off" id="qa-off">بلا حركة</article></div>';
      document.querySelector("main").append(section);
    });
    await page.locator("#motion-qa").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => window.__motionCalls.some(call => call.id === "qa-card"), undefined, { timeout: 8000 });
    assert.equal(await page.evaluate(() => window.__motionCalls.some(call => ['qa-media','qa-off'].includes(call.id))), false);
    await page.locator("#qa-focus").focus();
    assert.equal(await page.evaluate(() => document.getElementById('qa-card').getAnimations().some(animation => animation.playState === "running")), false);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => {
      const card = document.createElement("article"); card.id = "qa-preference"; card.textContent = "محتوى ظاهر دون حركة"; card.style.padding = "40px";
      document.querySelector("#motion-qa .container").append(card);
    });
    await page.locator("#qa-preference").scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.__motionCalls.some(call => call.id === "qa-preference")), false);
    assert.equal(await page.locator("#qa-preference").evaluate(node => getComputedStyle(node).opacity), "1");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForFunction(() => window.__motionCalls.some(call => call.id === "qa-preference"), undefined, { timeout: 8000 });
    await page.waitForTimeout(30);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(50);
    assert.equal(await page.locator("#qa-preference").evaluate(node => node.getAnimations().some(animation => animation.playState === "running")), false);
    await page.evaluate(() => document.getElementById("motion-qa").remove());
    assert.equal(errors.length, 0, errors.join("\n"));

    // With JavaScript disabled the page must still display, including all lower sections.
    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: scene.width, height: scene.height }, reducedMotion: "reduce" });
    const staticPage = await noJs.newPage();
    await staticPage.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await staticPage.locator("#home-gateway-title").waitFor({ state: "visible" });
    assert.equal(await staticPage.locator("[aria-labelledby='learning-title'] article").first().isVisible(), true);
    await noJs.close();
    results.push({ label, passed: true, hero, scrollReveal, checks: ["first-paint CSS", "finite entrance", "real scroll cards", "no overflow", "dynamic content", "protected player", "focus cancellation", "reduced motion live on/off", "no JavaScript visibility"] });
  } catch (error) {
    await page.screenshot({ path: path.join(folder, label + "-failure.png"), fullPage: false }).catch(() => undefined);
    results.push({ label, passed: false, error: error.stack, errors });
  } finally { await context.close(); await browser.close(); }
}
fs.writeFileSync(path.join(folder, "results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ folder, results }, null, 2));
if (results.some(result => !result.passed)) process.exitCode = 1;
